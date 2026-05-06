import { listImagesInFolder, downloadFileBuffer } from './drive.mjs';
import { visionPickPhoto } from './claude.mjs';

const MIN_SIZE = 200_000;
const PREFERRED_SIZE = 500_000;
// How many candidates to actually send to Claude vision (more = better choice but more tokens/$)
const VISION_CANDIDATE_COUNT = 5;
// Max bytes per candidate sent to vision (downscale guard — Drive thumbnails are usually smaller, but protect against full-res anyway)
const VISION_MAX_BYTES = 1_500_000;

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

// Vision picker: lets Claude look at the top-N candidates and choose + return focal_point.
// Falls back to metadata-only pick if vision call fails.
export async function pickPhotoWithVision(folderId, brief, keywords = [], { template, excludeIds = [] } = {}) {
  if (!folderId) return null;
  const all = await listImagesInFolder(folderId, { recursive: true, max: 200 });
  const ranked = rankCandidates(all, keywords, excludeIds);
  if (!ranked.length) return null;

  const candidates = ranked.slice(0, VISION_CANDIDATE_COUNT);
  console.log(`[vision] Downloading ${candidates.length} candidates for vision pick`);

  // Download buffers in parallel
  const buffers = await Promise.all(candidates.map(async (c) => {
    try {
      const buf = await downloadFileBuffer(c.id);
      // Guard: if buffer is huge and we can't easily downscale here, skip oversize candidates
      if (buf.length > VISION_MAX_BYTES) {
        console.warn(`[vision] Skipping oversize candidate ${c.name} (${buf.length} bytes)`);
        return null;
      }
      return { id: c.id, name: c.name, mimeType: c.mimeType, base64: buf.toString('base64'), file: c };
    } catch (err) {
      console.warn(`[vision] Failed to download ${c.name}:`, err.message);
      return null;
    }
  }));

  const usable = buffers.filter(Boolean);
  if (!usable.length) {
    console.warn('[vision] No usable candidates downloaded — falling back to metadata pick');
    return pickPhoto(folderId, keywords, { excludeIds });
  }

  try {
    const result = await visionPickPhoto(brief, usable, { template });
    const idx = Math.max(0, Math.min(usable.length - 1, Number(result.chosen_index) || 0));
    const chosen = usable[idx].file;
    console.log(`[vision] Chose photo ${idx} (${chosen.name}). focal_point=`, result.focal_point, '— rationale:', result.rationale);
    return { ...chosen, focal_point: result.focal_point || null };
  } catch (err) {
    console.warn('[vision] Vision pick failed:', err.message, '— falling back to metadata pick');
    return pickPhoto(folderId, keywords, { excludeIds });
  }
}

export async function pickMultiplePhotosWithVision(folderId, brief, keywords = [], n = 3, { template } = {}) {
  if (!folderId || n <= 0) return [];
  const picked = [];
  const seen = [];
  for (let i = 0; i < n; i++) {
    const p = await pickPhotoWithVision(folderId, brief, keywords, { template, excludeIds: seen });
    if (!p) break;
    picked.push(p);
    seen.push(p.id);
  }
  return picked;
}
