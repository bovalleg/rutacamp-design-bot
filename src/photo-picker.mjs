import { listImagesInFolder } from './drive.mjs';

const MIN_SIZE = 200_000;
const PREFERRED_SIZE = 500_000;

export async function pickPhoto(folderId, keywords = [], { excludeIds = [] } = {}) {
  if (!folderId) return null;
  const all = await listImagesInFolder(folderId, { recursive: true, max: 200 });

  const usable = all.filter(f => {
    const size = Number(f.size || 0);
    if (size < MIN_SIZE) return false;
    if (/^thumb_|^preview_/i.test(f.name)) return false;
    if (excludeIds.includes(f.id)) return false;
    return true;
  });
  if (!usable.length) return null;

  const norm = (s) => (s || '').toLowerCase();
  const kwLower = keywords.map(norm);

  const scored = usable.map(f => {
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
  });

  scored.sort((a, b) => b._score - a._score);
  // Pick a random photo from the top 5 candidates so consecutive runs don't always pick the same one
  const top = scored.slice(0, 5);
  return top[Math.floor(Math.random() * top.length)];
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
