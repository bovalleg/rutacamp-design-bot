import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

function applyTemplate(html, vars) {
  return html.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
}

export async function renderSpec(spec, photoLocalPath, outPath) {
  const tplName = spec.template === 'post-cream' ? 'post-cream.html' : 'post-photo.html';
  const tplPath = path.join(ROOT, 'templates', tplName);
  const tplHtml = await fs.readFile(tplPath, 'utf8');

  const vars = {
    EYEBROW: spec.eyebrow || '',
    TITLE: spec.title || '',
    TITLE_SIZE: spec.title_size || (spec.template === 'post-cream' ? 132 : 128),
    SUBTITLE: spec.subtitle || '',
    BODY: spec.body || '',
    HAND: spec.hand || '¡vive la aventura!',
    HANDLE: spec.handle || '@ruta.camp · rutacamp.cl',
    PHOTO_URL: photoLocalPath ? pathToFileURL(path.resolve(photoLocalPath)).href : '',
  };

  const renderedHtml = applyTemplate(tplHtml, vars);
  const tmpHtml = path.join(ROOT, 'templates', '.render-tmp.html');
  await fs.writeFile(tmpHtml, renderedHtml);

  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1080, height: 1080 }, deviceScaleFactor: 2 });
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
  } finally {
    await browser.close();
    await fs.unlink(tmpHtml).catch(() => {});
  }
  return outPath;
}
