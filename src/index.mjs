import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { briefToSpec } from './claude.mjs';
import { pickPhotoWithVision } from './photo-picker.mjs';
import { downloadFile, uploadFile } from './drive.mjs';
import { renderSpec, renderCarrusel, templateNeedsPhoto } from './render.mjs';
import { folderIdForDestino } from './folders.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'out');

const OUTPUT_DRIVE_FOLDER = process.env.OUTPUT_DRIVE_FOLDER_ID || '';

async function main() {
  const brief = process.env.BRIEF || process.argv.slice(2).join(' ').trim();
  const formatHint = process.env.FORMAT || 'auto';
  if (!brief) {
    console.error('Usage: BRIEF="..." [FORMAT=post|story|carrusel] node src/index.mjs');
    process.exit(1);
  }
  await fs.mkdir(OUT_DIR, { recursive: true });

  console.log('[1/5] Sending brief to Claude:', brief, '| format hint:', formatHint);
  const spec = await briefToSpec(brief, { format: formatHint });
  console.log('[1/5] Spec:', JSON.stringify(spec, null, 2));

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const baseName = `rutacamp_${spec.destino || 'red'}_${spec.format || 'post'}_${stamp}`;

  let outFiles = [];

  if (spec.format === 'carrusel') {
    const slides = spec.slides || [];
    console.log(`[2/5] Carrusel with ${slides.length} slides`);
    // Auto-fix: if Claude forgot to set use_photo:true on a template that needs a photo, do it for them.
    for (const s of slides) {
      if (templateNeedsPhoto(s.template) && s.use_photo === undefined) s.use_photo = true;
    }

    // Resolve per-slide destino + folder. Slide-level destino overrides spec-level.
    // Slides whose destino has no Drive folder (e.g. malalcahuello) are downgraded to -content.
    const resolved = slides.map((s) => {
      const slideDestino = s.destino || spec.destino || null;
      const folderId = folderIdForDestino(slideDestino) || (slideDestino === spec.destino ? spec.drive_folder_id : null);
      if (s.use_photo && !folderId) {
        console.warn(`[2/5] Slide "${s.template}" (destino: ${slideDestino || 'none'}) wants a photo but no Drive folder available — downgrading to carrusel-content`);
        return { slide: { ...s, template: 'carrusel-content', use_photo: false }, slideDestino, folderId: null };
      }
      return { slide: s, slideDestino, folderId };
    });

    // Pick photos slide-by-slide so each slide pulls from its own destino's folder/catalog.
    const seenIds = [];
    const alreadyChosen = [];
    const downloadedByIndex = new Array(resolved.length).fill(null);
    for (let i = 0; i < resolved.length; i++) {
      const { slide, slideDestino, folderId } = resolved[i];
      if (!slide.use_photo || !folderId) continue;

      const slideContext = [slide.eyebrow, slide.title, slide.subtitle, slide.body].filter(Boolean).join(' · ');
      console.log(`[2/5] Slide ${i + 1}/${resolved.length}: picking photo (destino: ${slideDestino}, folder: ${folderId})`);
      const file = await pickPhotoWithVision(folderId, brief, spec.photo_keywords || [], {
        template: 'carrusel-cover',
        destino: slideDestino,
        excludeIds: seenIds,
        alreadyChosen,
        slideContext,
      });
      if (!file) {
        console.warn(`[2/5] Slide ${i + 1}: vision didn't pick a photo — downgrading to carrusel-content`);
        resolved[i].slide = { ...slide, template: 'carrusel-content', use_photo: false };
        continue;
      }
      const dest = path.join(OUT_DIR, `photo_${i + 1}${path.extname(file.name || '.jpg')}`);
      await downloadFile(file.id, dest);
      downloadedByIndex[i] = { path: dest, focal_point: file.focal_point };
      seenIds.push(file.id);
      if (file._visionBuffer) {
        alreadyChosen.push({ ...file._visionBuffer, rationale: file._rationale });
      }
    }

    const enrichedSlides = resolved.map(({ slide }, i) => {
      const ph = downloadedByIndex[i];
      return ph ? { ...slide, focal_point: ph.focal_point } : slide;
    });
    const enrichedSpec = { ...spec, slides: enrichedSlides };
    const photoPaths = downloadedByIndex.map(ph => ph ? ph.path : null);
    console.log('[4/5] Rendering carrusel');
    outFiles = await renderCarrusel(enrichedSpec, photoPaths, OUT_DIR, baseName);
  } else {
    let photoPath = null;
    const wantsPhoto = templateNeedsPhoto(spec.template);
    if (wantsPhoto && spec.drive_folder_id) {
      console.log(`[2/5] Picking photo with vision from Drive folder ${spec.drive_folder_id}`);
      const file = await pickPhotoWithVision(
        spec.drive_folder_id,
        brief,
        spec.photo_keywords || [],
        { template: spec.template, destino: spec.destino },
      );
      if (!file) {
        console.warn('[2/5] Vision found no fitting photo — falling back to -cream template');
        spec.template = spec.format === 'story' ? 'story-cream' : 'post-cream';
      } else {
        photoPath = path.join(OUT_DIR, 'photo' + path.extname(file.name || '.jpg'));
        await downloadFile(file.id, photoPath);
        spec.focal_point = file.focal_point;
      }
    } else {
      console.log('[2/5] No photo needed for this spec');
    }
    const out = path.join(OUT_DIR, baseName + '.png');
    console.log('[4/5] Rendering to', out);
    await renderSpec(spec, photoPath, out);
    outFiles = [out];
  }

  if (OUTPUT_DRIVE_FOLDER) {
    console.log(`[5/5] Uploading ${outFiles.length} file(s) to Drive folder`);
    for (const f of outFiles) {
      const uploaded = await uploadFile(f, path.basename(f), OUTPUT_DRIVE_FOLDER);
      if (uploaded) console.log('[5/5]', path.basename(f), '→', uploaded.webViewLink);
      else console.log('[5/5]', path.basename(f), '→ upload skipped');
    }
  } else {
    console.log('[5/5] OUTPUT_DRIVE_FOLDER_ID not set — skipping upload');
  }

  const captionPath = path.join(OUT_DIR, baseName + '.caption.txt');
  await fs.writeFile(captionPath, spec.caption || '');
  console.log('Caption written to', captionPath);

  console.log('\n========================');
  console.log('DONE — resumen');
  console.log('========================');
  console.log('Format:', spec.format);
  if (spec.format === 'carrusel') {
    console.log('Slides:', spec.slides.map(s => s.template).join(' → '));
  } else {
    console.log('Template:', spec.template);
  }
  console.log('Rationale del diseño:', spec.rationale);
  console.log('---');
  for (const f of outFiles) console.log('PNG:', path.basename(f));
  console.log('Caption:', path.basename(captionPath));
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
