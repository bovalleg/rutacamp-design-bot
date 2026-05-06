import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// Returns true if the template's HTML expects a photo to be present.
// Used by the orchestrator to decide whether to invoke the photo picker.
export function templateNeedsPhoto(name) {
  if (!name) return false;
  return name.endsWith('-photo') || name.endsWith('-split') || name === 'carrusel-cover';
}

// Template registry: name → { dimensions }
const TEMPLATES = {
  'post-photo':             { width: 1080, height: 1080 },
  'post-cream':             { width: 1080, height: 1080 },
  'post-quote':             { width: 1080, height: 1080 },
  'post-split':             { width: 1080, height: 1080 },
  'story-photo':            { width: 1080, height: 1920 },
  'story-cream':            { width: 1080, height: 1920 },
  'story-split':            { width: 1080, height: 1920 },
  'carrusel-cover':         { width: 1080, height: 1080 },
  'carrusel-content':       { width: 1080, height: 1080 },
  'carrusel-content-photo': { width: 1080, height: 1080 },
  'carrusel-content-split': { width: 1080, height: 1080 },
  'carrusel-end':           { width: 1080, height: 1080 },
};

function applyTemplate(html, vars) {
  return html.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
}

function focalPointToCss(fp) {
  if (!fp) return 'center center';
  const x = Math.max(0, Math.min(100, Number(fp.x ?? 50)));
  const y = Math.max(0, Math.min(100, Number(fp.y ?? 50)));
  return `${x}% ${y}%`;
}

function defaultVars(spec, photoLocalPath, extraVars = {}) {
  return {
    EYEBROW: spec.eyebrow || '',
    TITLE: spec.title || '',
    TITLE_SIZE: spec.title_size || 128,
    SUBTITLE: spec.subtitle || '',
    BODY: spec.body || '',
    HAND: spec.hand || '¡vive la aventura!',
    HANDLE: spec.handle || '@RUTA.CAMP · RUTACAMP.CL',
    CTA: spec.cta || 'RESERVAS · LINK EN BIO',
    PHOTO_URL: photoLocalPath ? pathToFileURL(path.resolve(photoLocalPath)).href : '',
    PHOTO_POSITION: focalPointToCss(spec.focal_point),
    PHOTO_OR_INK: photoLocalPath
      ? '<div class="photo"></div>'
      : '<div class="ink-fill"></div>',
    SLIDE_INDEX: extraVars.SLIDE_INDEX || '01',
    SLIDE_TOTAL: extraVars.SLIDE_TOTAL || '01',
    ...extraVars,
  };
}

async function renderOne(browser, templateName, vars, outPath) {
  const cfg = TEMPLATES[templateName];
  if (!cfg) throw new Error(`Unknown template: ${templateName}`);

  const tplPath = path.join(ROOT, 'templates', templateName + '.html');
  const tplHtml = await fs.readFile(tplPath, 'utf8');
  const renderedHtml = applyTemplate(tplHtml, vars);

  const tmpHtml = path.join(ROOT, 'templates', '.render-tmp.html');
  await fs.writeFile(tmpHtml, renderedHtml);

  try {
    const ctx = await browser.newContext({
      viewport: { width: cfg.width, height: cfg.height },
      deviceScaleFactor: 2,
    });
    const page = await ctx.newPage();
    await page.goto(pathToFileURL(tmpHtml).href, { waitUntil: 'load', timeout: 30_000 });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map(img =>
        img.complete ? null : new Promise(r => { img.onload = img.onerror = r; })
      ));
    });
    await page.waitForFunction(() => document.fonts.check('700 italic 100px "Playfair Display"'), { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(300);
    const frame = await page.$('#frame');
    await frame.screenshot({ path: outPath });
    await ctx.close();
  } finally {
    await fs.unlink(tmpHtml).catch(() => {});
  }
  return outPath;
}

// Single piece (post or story)
export async function renderSpec(spec, photoLocalPath, outPath) {
  const browser = await chromium.launch();
  try {
    return await renderOne(browser, spec.template, defaultVars(spec, photoLocalPath), outPath);
  } finally {
    await browser.close();
  }
}

// Carrusel: multiple slides → multiple PNGs
export async function renderCarrusel(spec, photosByIndex, outDir, baseName) {
  const slides = spec.slides || [];
  if (!slides.length) throw new Error('Carrusel spec has no slides');
  await fs.mkdir(outDir, { recursive: true });

  const browser = await chromium.launch();
  const results = [];
  try {
    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];
      const photoForSlide = photosByIndex?.[i] ?? null;
      const idx = String(i + 1).padStart(2, '0');
      const total = String(slides.length).padStart(2, '0');
      const vars = defaultVars(
        { ...slide, handle: spec.handle || slide.handle },
        photoForSlide,
        { SLIDE_INDEX: idx, SLIDE_TOTAL: total }
      );
      const out = path.join(outDir, `${baseName}_${idx}.png`);
      await renderOne(browser, slide.template, vars, out);
      results.push(out);
    }
  } finally {
    await browser.close();
  }
  return results;
}
