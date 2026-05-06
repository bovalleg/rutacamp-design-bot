// Catalog job: walks each destino's Drive folder, tags every photo with Claude vision,
// and writes a JSON catalog at catalog/<destino>.json.
//
// Incremental: skips photos already catalogued whose modifiedTime hasn't changed.
//
// Usage:
//   node scripts/catalog.mjs                  # all destinos
//   node scripts/catalog.mjs --destino puerto-fuy
//   node scripts/catalog.mjs --full           # re-tag everything (ignore cache)

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import sharp from 'sharp';
import Anthropic from '@anthropic-ai/sdk';
import { DESTINOS, catalogPathForDestino } from '../src/folders.mjs';
import { listImagesInFolder, downloadFileBuffer } from '../src/drive.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const PRIMARY_MODEL = 'claude-sonnet-4-6';   // Sonnet is plenty for tagging, cheaper than Opus.
const FALLBACK_MODEL = 'claude-haiku-4-5-20251001';
const RESIZE_THRESHOLD_BYTES = 1_500_000;
const PREVIEW_MAX_WIDTH = 1024;

const TAG_SYSTEM_PROMPT = `Sos curador de imágenes para Ruta Camp, una red chilena de campings para motorhomes y casas rodantes en Patagonia y Araucanía. Tu trabajo es mirar UNA foto y devolver tags estructurados que permitan a un bot de diseño después decidir si esa foto sirve para un brief específico.

Devolvés EXCLUSIVAMENTE un JSON con este schema (sin markdown, sin texto extra):

{
  "subjects": [string, ...],   // 2-5 sustantivos concretos del vocab preferido. Vocab: motorhome, casa-rodante, camping, sitio, fogon, lago, rio, bosque, arboles-nativos, montaña, volcan, cordillera, atardecer, golden-hour, noche, dia, drone-shot, aerea, gente, familia, vehiculo, infraestructura, conexiones, sendero, niebla, lluvia, nieve, paisaje, vacio. Si no calza ninguno, ponele uno descriptivo en kebab-case.
  "mood": "cinematic" | "casual" | "intimate" | "editorial" | "dramatic" | "calm" | "wild",
  "composition": "aerial-wide" | "wide" | "medium" | "close-up" | "portrait-vertical",
  "lighting": "golden-hour" | "blue-hour" | "harsh-day" | "overcast" | "night" | "indoor",
  "focal_point": { "x": 0-100, "y": 0-100 },   // posición del sujeto principal (50,50 = centro; 0,0 = esquina superior izquierda)
  "copy_friendly_zones": ["top" | "bottom" | "left" | "right" | "center"],   // zonas relativamente vacías donde se podría poner copy sin tapar al sujeto. Vacío [] si la imagen está saturada.
  "quality": 1-10,   // overall: nitidez (no blurry/movido), composición (no cortes raros), on-brand (warm/earthy/outdoors, no stock-glamour). Default 6 si dudas.
  "notes": "<una línea en español describiendo brevemente qué se ve>"
}

Sé honesto con quality: una foto blurry o sobreexpuesta es 3-4. Una buena pero sin sujeto claro es 5-6. Una excelente con motorhome bien encuadrado en golden hour es 9-10.`;

function makeClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 5 });
}

async function callWithFallback(client, fn) {
  try {
    return await fn(PRIMARY_MODEL);
  } catch (err) {
    if (err?.status === 529 || /overload/i.test(err?.message || '')) {
      console.warn(`[catalog] ${PRIMARY_MODEL} overloaded — fallback to ${FALLBACK_MODEL}`);
      return await fn(FALLBACK_MODEL);
    }
    throw err;
  }
}

async function tagPhotoVision(client, buffer, mimeType) {
  // Resize for vision API (smaller payload, faster, cheaper)
  let preview = buffer;
  let pmime = mimeType || 'image/jpeg';
  if (buffer.length > RESIZE_THRESHOLD_BYTES) {
    preview = await sharp(buffer, { failOn: 'none' })
      .rotate()
      .resize({ width: PREVIEW_MAX_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: 78, mozjpeg: true })
      .toBuffer();
    pmime = 'image/jpeg';
  }

  const msg = await callWithFallback(client, (model) => client.messages.create({
    model,
    max_tokens: 600,
    system: TAG_SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: pmime, data: preview.toString('base64') } },
        { type: 'text', text: 'Devolveme el JSON con los tags. Solo el JSON.' },
      ],
    }],
  }));

  const text = msg.content.find(c => c.type === 'text')?.text ?? '';
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('Tag response not parseable: ' + text);
  return JSON.parse(m[0]);
}

async function loadExistingCatalog(catalogPath) {
  try {
    const raw = await fs.readFile(path.join(ROOT, catalogPath), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function catalogDestino(destinoKey, { full = false } = {}) {
  const dest = DESTINOS[destinoKey];
  if (!dest) throw new Error(`Unknown destino: ${destinoKey}`);
  if (!dest.drive_folder_id) {
    console.log(`[catalog] ${destinoKey}: no drive folder → skipping`);
    return null;
  }

  const catalogPath = catalogPathForDestino(destinoKey);
  const existing = full ? null : await loadExistingCatalog(catalogPath);
  const cachedById = new Map((existing?.photos || []).map(p => [p.id, p]));

  console.log(`[catalog] ${destinoKey} (${dest.label}): listing photos…`);
  const all = await listImagesInFolder(dest.drive_folder_id, { recursive: true, max: 500 });
  console.log(`[catalog] ${destinoKey}: ${all.length} photos found`);

  const client = makeClient();
  const photos = [];
  let processed = 0, skipped = 0, tagged = 0, failed = 0;

  for (const f of all) {
    processed++;
    const cached = cachedById.get(f.id);
    if (cached && cached.modified === f.modifiedTime && cached.tags) {
      photos.push(cached);
      skipped++;
      continue;
    }

    try {
      const buf = await downloadFileBuffer(f.id);
      const tags = await tagPhotoVision(client, buf, f.mimeType);
      photos.push({
        id: f.id,
        name: f.name,
        modified: f.modifiedTime,
        size: Number(f.size || 0),
        tags,
        tagged_at: new Date().toISOString(),
      });
      tagged++;
      console.log(`  ✓ ${f.name} | ${tags.subjects?.slice(0, 3).join(',')} | mood=${tags.mood} | q=${tags.quality}`);
    } catch (err) {
      console.warn(`  ✗ ${f.name}: ${err.message}`);
      failed++;
      // Still keep file in catalog with empty tags so we know it exists
      photos.push({ id: f.id, name: f.name, modified: f.modifiedTime, size: Number(f.size || 0), tags: null, error: err.message });
    }
  }

  const catalog = {
    destino: destinoKey,
    label: dest.label,
    drive_folder_id: dest.drive_folder_id,
    updated: new Date().toISOString(),
    photos,
  };

  await fs.mkdir(path.join(ROOT, 'catalog'), { recursive: true });
  await fs.writeFile(path.join(ROOT, catalogPath), JSON.stringify(catalog, null, 2));
  console.log(`[catalog] ${destinoKey}: wrote ${catalogPath} (${photos.length} entries; ${tagged} new tags, ${skipped} cached, ${failed} failed)`);

  // Incremental commit: push this destino's catalog right away, so progress is preserved
  // even if the workflow times out before all destinos finish.
  if (process.env.CI && tagged > 0) {
    try {
      execSync(`git add ${catalogPath}`, { cwd: ROOT, stdio: 'inherit' });
      const status = execSync('git status --porcelain', { cwd: ROOT }).toString().trim();
      if (status) {
        execSync(`git commit -m "chore(catalog): ${destinoKey} (${tagged} new, ${skipped} cached) [skip ci]"`, { cwd: ROOT, stdio: 'inherit' });
        execSync('git push', { cwd: ROOT, stdio: 'inherit' });
        console.log(`[catalog] ${destinoKey}: pushed to remote`);
      } else {
        console.log(`[catalog] ${destinoKey}: nothing to commit`);
      }
    } catch (err) {
      console.warn(`[catalog] ${destinoKey}: incremental push failed (${err.message}) — continuing`);
    }
  }
  return catalog;
}

async function main() {
  const args = process.argv.slice(2);
  const fullIdx = args.indexOf('--full');
  const full = fullIdx >= 0;
  if (full) args.splice(fullIdx, 1);
  const destIdx = args.indexOf('--destino');
  const onlyDestino = destIdx >= 0 ? args[destIdx + 1] : null;

  const targets = onlyDestino
    ? [onlyDestino]
    : Object.keys(DESTINOS).filter(k => DESTINOS[k].drive_folder_id && !DESTINOS[k].skip_in_default_catalog);

  console.log(`[catalog] Targets: ${targets.join(', ')} | full=${full}`);
  if (!onlyDestino) {
    const skipped = Object.keys(DESTINOS).filter(k => DESTINOS[k].skip_in_default_catalog);
    if (skipped.length) console.log(`[catalog] Skipped (run with --destino X to include): ${skipped.join(', ')}`);
  }

  for (const t of targets) {
    try {
      await catalogDestino(t, { full });
    } catch (err) {
      console.error(`[catalog] ${t} FAILED:`, err);
    }
  }

  console.log('\n[catalog] DONE');
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
