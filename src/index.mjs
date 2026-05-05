import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { briefToSpec } from './claude.mjs';
import { pickPhoto, pickMultiplePhotos } from './photo-picker.mjs';
import { downloadFile, uploadFile } from './drive.mjs';
import { renderSpec, renderCarrusel } from './render.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'out');

const OUTPUT_DRIVE_FOLDER = process.env.OUTPUT_DRIVE_FOLDER_ID || '';

async function main() {
  const brief = process.env.BRIEF || process.argv.slice(2).join(' ').trim();
  const formatHint = process.env.FORMAT || 'auto';   // auto | post | story | carrusel
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
    // For each slide that uses a photo, fetch a different one from the same folder
    const photoSlots = slides.map(s => Boolean(s.use_photo && spec.drive_folder_id));
    const photosNeeded = photoSlots.filter(Boolean).length;
    let downloadedPhotos = [];
    if (photosNeeded > 0 && spec.drive_folder_id) {
      const files = await pickMultiplePhotos(spec.drive_folder_id, spec.photo_keywords || [], photosNeeded);
      console.log(`[2/5] Picked ${files.length} photos`);
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const dest = path.join(OUT_DIR, `photo_${i + 1}${path.extname(f.name || '.jpg')}`);
        await downloadFile(f.id, dest);
        downloadedPhotos.push(dest);
      }
    }
    const photosByIndex = [];
    let pi = 0;
    for (const want of photoSlots) {
      photosByIndex.push(want ? (downloadedPhotos[pi++] || null) : null);
    }
    console.log('[4/5] Rendering carrusel');
    outFiles = await renderCarrusel(spec, photosByIndex, OUT_DIR, baseName);
  } else {
    let photoPath = null;
    const wantsPhoto = spec.template?.endsWith('-photo');
    if (wantsPhoto && spec.drive_folder_id) {
      console.log('[2/5] Picking photo from Drive folder', spec.drive_folder_id);
      const file = await pickPhoto(spec.drive_folder_id, spec.photo_keywords || []);
      if (!file) {
        console.warn('[2/5] No photo found, falling back to -cream template');
        spec.template = spec.format === 'story' ? 'story-cream' : 'post-cream';
      } else {
        console.log('[2/5] Picked:', file.name, `(${file.size} bytes)`);
        photoPath = path.join(OUT_DIR, 'photo' + path.extname(file.name || '.jpg'));
        await downloadFile(file.id, photoPath);
      }
    } else {
      console.log('[2/5] No photo needed for this spec');
    }
    const out = path.join(OUT_DIR, baseName + '.png');
    console.log('[4/5] Rendering to', out);
    await renderSpec(spec, photoPath, out);
    outFiles = [out];
  }

  // Upload all output PNGs to Drive
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

  // Caption sidecar
  const captionPath = path.join(OUT_DIR, baseName + '.caption.txt');
  await fs.writeFile(captionPath, spec.caption || '');
  console.log('Caption written to', captionPath);

  console.log('\nDONE');
  for (const f of outFiles) console.log('PNG:', f);
  console.log('Caption:', captionPath);
  console.log('Rationale:', spec.rationale);
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
