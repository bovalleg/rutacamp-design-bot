import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { briefToSpec } from './claude.mjs';
import { pickPhotoWithVision, pickMultiplePhotosWithVision } from './photo-picker.mjs';
import { downloadFile, uploadFile } from './drive.mjs';
import { renderSpec, renderCarrusel } from './render.mjs';

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
    const photoSlots = slides.map(s => Boolean(s.use_photo && spec.drive_folder_id));
    const photosNeeded = photoSlots.filter(Boolean).length;
    let downloadedPhotos = [];
    let pickedFiles = [];
    if (photosNeeded > 0 && spec.drive_folder_id) {
      // For carrusel, the cover usually wants photo of destino mood; content slides may want detail shots.
      // We pick all distinct photos with vision (using the cover template as the framing reference).
      pickedFiles = await pickMultiplePhotosWithVision(
        spec.drive_folder_id,
        brief,
        spec.photo_keywords || [],
        photosNeeded,
        { template: 'carrusel-cover' },
      );
      console.log(`[2/5] Picked ${pickedFiles.length} photos with vision`);
      for (let i = 0; i < pickedFiles.length; i++) {
        const f = pickedFiles[i];
        const dest = path.join(OUT_DIR, `photo_${i + 1}${path.extname(f.name || '.jpg')}`);
        await downloadFile(f.id, dest);
        downloadedPhotos.push({ path: dest, focal_point: f.focal_point });
      }
    }
    // Map picked photos onto slides: each slide that wants a photo consumes one in order
    const photosByIndex = [];
    let pi = 0;
    for (const want of photoSlots) {
      if (want && downloadedPhotos[pi]) {
        const ph = downloadedPhotos[pi++];
        photosByIndex.push(ph);
      } else {
        photosByIndex.push(null);
      }
    }
    // Inject focal_point into each slide spec so render uses it
    const enrichedSlides = slides.map((s, i) => {
      const ph = photosByIndex[i];
      return ph ? { ...s, focal_point: ph.focal_point } : s;
    });
    const enrichedSpec = { ...spec, slides: enrichedSlides };
    const photoPaths = photosByIndex.map(ph => ph ? ph.path : null);
    console.log('[4/5] Rendering carrusel');
    outFiles = await renderCarrusel(enrichedSpec, photoPaths, OUT_DIR, baseName);
  } else {
    let photoPath = null;
    const wantsPhoto = spec.template?.endsWith('-photo') || spec.template === 'post-split';
    if (wantsPhoto && spec.drive_folder_id) {
      console.log(`[2/5] Picking photo with vision from Drive folder ${spec.drive_folder_id}`);
      const file = await pickPhotoWithVision(
        spec.drive_folder_id,
        brief,
        spec.photo_keywords || [],
        { template: spec.template },
      );
      if (!file) {
        console.warn('[2/5] No photo found, falling back to -cream template');
        spec.template = spec.format === 'story' ? 'story-cream' : 'post-cream';
      } else {
        console.log('[2/5] Picked:', file.name);
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

  console.log('\nDONE');
  for (const f of outFiles) console.log('PNG:', f);
  console.log('Caption:', captionPath);
  console.log('Rationale:', spec.rationale);
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
