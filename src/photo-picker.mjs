import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { listImagesInFolder, downloadFileBuffer } from './drive.mjs';
import { visionPickPhoto } from './claude.mjs';
import { catalogPathForDestino } from './folders.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const MIN_SIZE = 200_000;
const PREFERRED_SIZE = 500_000;
// How many candidates to actually send to Claude vision (more = better choice but more tokens/$)
const VISION_CANDIDATE_COUNT = 12;
// Above this, the candidate gets resized down before sending to vision (the original file is unchanged for the final render).
const RESIZE_THRESHOLD_BYTES = 1_500_000;
// Target width for the downscaled preview sent to vision.
const VISION_PREVIEW_MAX_WIDTH = 1024;

function rankCandidates(files, keywords = [], excludeIds = []) {
  const norm = (s) => (s || '').toLowerCase();
  const kwLower = keywords.map(norm);
  return files
    .filter(f => {
      const size = Number(f.size || 0);
      if (size < MIN_SIZE) return false;
      if (/^thumb_|^preview_/i.test(f.name)) return false;
      if (excludeIds.includes(f.id)) return false;
      return true;
    })
    .map(f => {
      let score = 0;
      const size = Number(f.size || 0);
      if (size > PREFERRED_SIZE) score += 3;
      if (size > 1_000_000) score += 2;
      if (!/^IMG-\d|^IMG_\d/.test(f.name)) score += 2;
      const name = norm(f.name);
      for (const kw of kwLower) if (name.includes(kw)) score += 5;
      const mtime = new Date(f.modifiedTime || 0).getTime();
      const ageDays = (Date.now() - mtime) / 86400000;
      if (ageDays < 365) score += 1;
      return { ...f, _score: score };
    })
    .sort((a, b) => b._score - a._score);
}

// Metadata-only picker (legacy / fallback). Returns one file with a default focal_point.
export async function pickPhoto(folderId, keywords = [], { excludeIds = [] } = {}) {
  if (!folderId) return null;
  const all = await listImagesInFolder(folderId, { recursive: true, max: 200 });
  const ranked = rankCandidates(all, keywords, excludeIds);
  if (!ranked.length) return null;
  const top = ranked.slice(0, 5);
  const chosen = top[Math.floor(Math.random() * top.length)];
  return { ...chosen, focal_point: null };
}

export async function pickMultiplePhotos(folderId, keywords = [], n = 3) {
  if (!folderId || n <= 0) return [];
  const picked = [];
  const seen = [];
  for (let i = 0; i < n; i++) {
    const p = await pickPhoto(folderId, keywords, { excludeIds: seen });
    if (!p) break;
    picked.push(p);
    seen.push(p.id);
  }
  return picked;
}

async function downloadCandidates(candidates) {
  const buffers = await Promise.all(candidates.map(async (c) => {
    try {
      let buf = await downloadFileBuffer(c.id);
      let mimeType = c.mimeType || 'image/jpeg';
      if (buf.length > RESIZE_THRESHOLD_BYTES) {
        const before = buf.length;
        buf = await sharp(buf, { failOn: 'none' })
          .rotate()
          .resize({ width: VISION_PREVIEW_MAX_WIDTH, withoutEnlargement: true })
          .jpeg({ quality: 78, mozjpeg: true })
          .toBuffer();
        mimeType = 'image/jpeg';
        console.log(`[vision] Resized ${c.name}: ${(before/1e6).toFixed(1)}MB → ${(buf.length/1e3).toFixed(0)}KB`);
      }
      return { id: c.id, name: c.name, mimeType, base64: buf.toString('base64'), file: c };
    } catch (err) {
      console.warn(`[vision] Failed to prepare ${c.name}:`, err.message);
      return null;
    }
  }));
  return buffers.filter(Boolean);
}

// ---- Catalog-based pre-filter ----
// Lazy import of DESTINOS so we can detect "umbrella" destinos that aggregate others.
async function getDestinosMap() {
  const mod = await import('./folders.mjs');
  return mod.DESTINOS;
}

async function loadOneCatalog(destinoKey) {
  try {
    const raw = await fs.readFile(path.join(ROOT, catalogPathForDestino(destinoKey)), 'utf8');
    const cat = JSON.parse(raw);
    return (cat?.photos || []).filter(p => p.tags);
  } catch {
    return null;
  }
}

async function loadCatalog(destinoKey) {
  if (!destinoKey) return null;
  // Check if this destino is an "umbrella" that should aggregate others (e.g. "red")
  const destinos = await getDestinosMap();
  const meta = destinos[destinoKey];
  if (meta?.skip_in_default_catalog) {
    // Aggregate every catalogued destino (the ones that DO get tagged in the default run)
    const sources = Object.keys(destinos).filter(k => destinos[k].drive_folder_id && !destinos[k].skip_in_default_catalog);
    const all = [];
    const seenIds = new Set();
    for (const k of sources) {
      const cat = await loadOneCatalog(k);
      if (!cat) continue;
      for (const p of cat) {
        if (seenIds.has(p.id)) continue; // dedup if Drive returned the same file from multiple folders
        seenIds.add(p.id);
        all.push({ ...p, _source: k });
      }
    }
    if (!all.length) return null;
    console.log(`[vision] Aggregated catalog for "${destinoKey}": ${all.length} photos from ${sources.join(', ')}`);
    return all;
  }
  return loadOneCatalog(destinoKey);
}

// Extract subject hints from a brief. Returns an array of normalized tokens.
function subjectsFromBrief(brief) {
  const lower = brief.toLowerCase();
  const hints = new Set();
  if (/motorhome|casa rodante|rodantero|camper|rv\b/.test(lower)) { hints.add('motorhome'); hints.add('casa-rodante'); }
  if (/conex|enchufe|servic|agua.*luz|electric|infraestruct/.test(lower)) { hints.add('infraestructura'); hints.add('conexiones'); }
  if (/fogón|fogon|fuego|noche/.test(lower)) { hints.add('fogon'); hints.add('noche'); }
  if (/atardecer|golden|crepúsculo|crepusculo/.test(lower)) { hints.add('atardecer'); hints.add('golden-hour'); }
  if (/lago|laguna|agua|río|rio/.test(lower)) { hints.add('lago'); hints.add('rio'); }
  if (/bosque|árbol|arbol|nativo|coigüe|coigue|mañío|mañio/.test(lower)) { hints.add('bosque'); hints.add('arboles-nativos'); }
  if (/cordillera|volcán|volcan|montaña|montaña|nieve/.test(lower)) { hints.add('montaña'); hints.add('volcan'); hints.add('cordillera'); }
  if (/familia|niñ|grup|junto/.test(lower)) { hints.add('familia'); hints.add('gente'); }
  if (/aérea|aerea|dron|sobrevuelo/.test(lower)) { hints.add('drone-shot'); hints.add('aerea'); }
  return [...hints];
}

function scoreCatalogEntry(entry, subjectHints, keywords, template) {
  const tags = entry.tags;
  let score = 0;
  // Quality is the spine
  score += (tags.quality || 5);
  // Subject matches
  const subj = (tags.subjects || []).map(s => s.toLowerCase());
  for (const h of subjectHints) if (subj.includes(h)) score += 5;
  // Keyword matches (also try against notes)
  const notes = (tags.notes || '').toLowerCase();
  for (const kw of keywords) {
    const k = kw.toLowerCase();
    if (subj.includes(k)) score += 3;
    if (notes.includes(k)) score += 1;
  }
  // Composition fit per template
  if (template === 'post-photo' || template === 'carrusel-cover') {
    if (tags.composition === 'aerial-wide' || tags.composition === 'wide') score += 2;
  } else if (template === 'story-photo') {
    if (tags.composition === 'portrait-vertical' || tags.composition === 'wide') score += 2;
  } else if (template === 'post-split') {
    if (tags.composition === 'wide' || tags.composition === 'medium') score += 1;
    if ((tags.copy_friendly_zones || []).includes('right')) score += 3; // split has copy on the right
  }
  // Copy-friendly zones for typical bottom-copy layouts
  if ((tags.copy_friendly_zones || []).includes('bottom')) score += 1;
  return score;
}

// Vision picker: lets Claude look at the top-N candidates and choose + return focal_point.
// Falls back to metadata-only pick if vision call fails.
// alreadyChosen: array of previously-picked candidates (for diversity in multi-pick).
// destino: if provided, will use catalog/<destino>.json to pre-filter (Nivel 2).
export async function pickPhotoWithVision(folderId, brief, keywords = [], { template, excludeIds = [], alreadyChosen = [], destino } = {}) {
  if (!folderId) return null;

  // Try catalog-based pre-filter first (Nivel 2)
  const catalog = await loadCatalog(destino);
  let candidates;
  if (catalog?.length) {
    const subjectHints = subjectsFromBrief(brief);
    const ranked = catalog
      .filter(p => !excludeIds.includes(p.id))
      .map(p => ({ ...p, _score: scoreCatalogEntry(p, subjectHints, keywords, template) }))
      .sort((a, b) => b._score - a._score);
    candidates = ranked.slice(0, VISION_CANDIDATE_COUNT);
    console.log(`[vision] Catalog pre-filter: ${ranked.length} entries → top ${candidates.length} (subjects detected: ${subjectHints.join(',') || 'none'})`);
  } else {
    // Fallback: legacy metadata-only ranking over Drive listing
    const all = await listImagesInFolder(folderId, { recursive: true, max: 200 });
    const ranked = rankCandidates(all, keywords, excludeIds);
    if (!ranked.length) return null;
    candidates = ranked.slice(0, VISION_CANDIDATE_COUNT);
    console.log(`[vision] No catalog for "${destino}" — sending ${candidates.length} metadata-ranked candidates`);
  }

  console.log(`[vision] Sending ${candidates.length} candidates to vision (already-chosen: ${alreadyChosen.length})`);

  const usable = await downloadCandidates(candidates);
  if (!usable.length) {
    console.warn('[vision] No usable candidates downloaded — falling back to metadata pick');
    return pickPhoto(folderId, keywords, { excludeIds });
  }

  try {
    const result = await visionPickPhoto(brief, usable, { template, alreadyChosen });
    if (result.chosen_index === -1 || result.chosen_index === '-1') {
      console.log(`[vision] ⚠️  Vision dijo -1 ("${result.rationale}") — fallback a metadata pick para no quedarnos sin foto`);
      return pickPhoto(folderId, keywords, { excludeIds });
    }
    const idx = Math.max(0, Math.min(usable.length - 1, Number(result.chosen_index) || 0));
    const chosen = usable[idx];
    console.log(`[vision] ✓ ${chosen.file.name} | focal=${JSON.stringify(result.focal_point)} | "${result.rationale}"`);
    return {
      ...chosen.file,
      focal_point: result.focal_point || null,
      _visionBuffer: chosen,
      _rationale: result.rationale,
    };
  } catch (err) {
    console.warn('[vision] Vision pick failed:', err.message, '— falling back to metadata pick');
    return pickPhoto(folderId, keywords, { excludeIds });
  }
}

export async function pickMultiplePhotosWithVision(folderId, brief, keywords = [], n = 3, { template, destino } = {}) {
  if (!folderId || n <= 0) return [];
  const picked = [];
  const seenIds = [];
  const alreadyChosen = [];
  for (let i = 0; i < n; i++) {
    const p = await pickPhotoWithVision(folderId, brief, keywords, {
      template,
      excludeIds: seenIds,
      alreadyChosen,
      destino,
    });
    if (!p) break;
    picked.push(p);
    seenIds.push(p.id);
    if (p._visionBuffer) {
      alreadyChosen.push({
        ...p._visionBuffer,
        rationale: p._rationale,
      });
    }
  }
  return picked;
}
