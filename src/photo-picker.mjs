import { listImagesInFolder } from './drive.mjs';

const MIN_SIZE = 200_000;
const PREFERRED_SIZE = 500_000;

export async function pickPhoto(folderId, keywords = []) {
  if (!folderId) return null;
  const all = await listImagesInFolder(folderId, { recursive: true, max: 200 });

  const usable = all.filter(f => {
    const size = Number(f.size || 0);
    if (size < MIN_SIZE) return false;
    if (/^thumb_|^preview_/i.test(f.name)) return false;
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
    if (!/^IMG-\d|^IMG_\d/.test(f.name)) score += 2; // descriptive name bonus
    const name = norm(f.name);
    for (const kw of kwLower) if (name.includes(kw)) score += 5;
    const mtime = new Date(f.modifiedTime || 0).getTime();
    const ageDays = (Date.now() - mtime) / 86400000;
    if (ageDays < 365) score += 1;
    return { ...f, _score: score };
  });

  scored.sort((a, b) => b._score - a._score);
  const top = scored.slice(0, 8);
  // pick deterministically by hash of the keywords for reproducibility
  return top[0];
}
