import sharp from 'sharp';
import { listImagesInFolder, downloadFileBuffer } from './drive.mjs';
import { visionPickPhoto } from './claude.mjs';

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

// Vision picker: lets Claude look at the top-N candidates and choose + return focal_point.
// Falls back to metadata-only pick if vision call fails.
// alreadyChosen: array of previously-picked candidates (for diversity in multi-pick).
export async function pickPhotoWithVision(folderId, brief, keywords = [], { template, excludeIds = [], alreadyChosen = [] } = {}) {
  if (!folderId) return null;
  const all = await listImagesInFolder(folderId, { recursive: true, max: 200 });
  const ranked = rankCandidates(all, keywords, excludeIds);
  if (!ranked.length) return null;

  const candidates = ranked.slice(0, VISION_CANDIDATE_COUNT);
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

export async function pickMultiplePhotosWithVision(folderId, brief, keywords = [], n = 3, { template } = {}) {
  if (!folderId || n <= 0) return [];
  const picked = [];
  const seenIds = [];
  const alreadyChosen = []; // visual context for diversity prompt
  for (let i = 0; i < n; i++) {
    const p = await pickPhotoWithVision(folderId, brief, keywords, {
      template,
      excludeIds: seenIds,
      alreadyChosen,
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
