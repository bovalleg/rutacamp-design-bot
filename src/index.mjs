import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { briefToSpec } from './claude.mjs';
import { pickPhoto } from './photo-picker.mjs';
import { downloadFile, uploadFile } from './drive.mjs';
import { renderSpec } from './render.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'out');

const OUTPUT_DRIVE_FOLDER = process.env.OUTPUT_DRIVE_FOLDER_ID || ''; // optional

async function main() {
  const brief = process.env.BRIEF || process.argv.slice(2).join(' ').trim();
  if (!brief) {
    console.error('Usage: BRIEF="..." node src/index.mjs   (or pass brief as args)');
    process.exit(1);
  }
  await fs.mkdir(OUT_DIR, { recursive: true });

  console.log('[1/5] Sending brief to Claude:', brief);
  const spec = await briefToSpec(brief);
  console.log('[1/5] Spec:', JSON.stringify(spec, null, 2));

  let photoPath = null;
  if (spec.template === 'post-photo' && spec.drive_folder_id) {
    console.log('[2/5] Picking photo from Drive folder', spec.drive_folder_id);
    const file = await pickPhoto(spec.drive_folder_id, spec.photo_keywords || []);
    if (!file) {
      console.warn('[2/5] No photo found, falling back to post-cream template');
      spec.template = 'post-cream';
    } else {
      console.log('[2/5] Picked:', file.name, '(', file.size, 'bytes )');
      photoPath = path.join(OUT_DIR, 'photo' + path.extname(file.name || '.jpg'));
      console.log('[3/5] Downloading to', photoPath);
      await downloadFile(file.id, photoPath);
    }
  } else {
    console.log('[2/5] Cream template — no photo needed');
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outPng = path.join(OUT_DIR, `rutacamp_${spec.destino}_${stamp}.png`);
  console.log('[4/5] Rendering to', outPng);
  await renderSpec(spec, photoPath, outPng);

  if (OUTPUT_DRIVE_FOLDER) {
    console.log('[5/5] Uploading to Drive folder', OUTPUT_DRIVE_FOLDER);
    const uploaded = await uploadFile(outPng, path.basename(outPng), OUTPUT_DRIVE_FOLDER);
    console.log('[5/5] Drive link:', uploaded.webViewLink);
  } else {
    console.log('[5/5] OUTPUT_DRIVE_FOLDER_ID not set — skipping upload');
  }

  // emit caption next to image
  const captionPath = outPng.replace(/\.png$/, '.caption.txt');
  await fs.writeFile(captionPath, spec.caption || '');
  console.log('Caption written to', captionPath);

  console.log('\nDONE');
  console.log('PNG:', outPng);
  console.log('Caption:', captionPath);
  console.log('Rationale:', spec.rationale);
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
