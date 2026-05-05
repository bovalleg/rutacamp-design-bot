import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SYSTEM = `Eres el Ruta Camp Design Bot. Recibes un brief en español y devuelves UN ÚNICO objeto JSON (sin texto extra, sin markdown) que el renderer va a usar para generar piezas de Instagram para @ruta.camp.

Soportas tres formatos:
- "post"     → 1080×1080 cuadrado, una sola pieza
- "story"    → 1080×1920 vertical, una sola pieza, safe areas top/bottom 250px
- "carrusel" → array de 3-7 slides 1080×1080: cover (hook) + contenido + cierre con CTA

Schema obligatorio según formato:

A) Si format = "post" o "story":
{
  "format": "post" | "story",
  "template": "<ver tabla abajo>",
  "destino": "puerto-fuy" | "conguillio" | "tagua-tagua" | "malalcahuello" | "villarrica" | "red",
  "drive_folder_id": string | null,
  "photo_keywords": string[],
  "eyebrow": string,
  "title": string,
  "title_size": number,
  "subtitle": string,
  "body": string,
  "hand": string,
  "handle": string,
  "caption": string,
  "rationale": string
}

B) Si format = "carrusel":
{
  "format": "carrusel",
  "destino": "<...>",
  "drive_folder_id": string | null,
  "photo_keywords": string[],
  "slides": [
    { "template": "carrusel-cover", "eyebrow": "...", "title": "...", "title_size": 132, "subtitle": "...", "use_photo": true|false },
    { "template": "carrusel-content", "eyebrow": "...", "title": "...", "title_size": 90, "body": "..." },
    ...
    { "template": "carrusel-end", "eyebrow": "...", "title": "Vive la aventura.", "title_size": 132, "body": "...", "cta": "RESERVAS · LINK EN BIO" }
  ],
  "caption": "...",
  "rationale": "..."
}

Tabla de templates por formato:
| format    | templates disponibles                                    |
|-----------|----------------------------------------------------------|
| post      | post-photo, post-cream                                   |
| story     | story-photo, story-cream                                 |
| carrusel  | (en cada slide) carrusel-cover, carrusel-content, carrusel-end |

Reglas duras de copy y diseño:
1. Una **única** exclamación en TODA la pieza (suma title + body + hand + slides). En carrusel, máx 1 entre todos los slides.
2. Sin emoji en la pieza/diseño. En el caption, máximo 1-2 emojis del set: 🏕️ ⛰️ 🔥 🚐 🌲 🌊
3. handle SIEMPRE como texto plano: "@RUTA.CAMP · RUTACAMP.CL"  — NUNCA uses sintaxis Markdown como [texto](url) ni linkify nada. El renderer no procesa Markdown.
4. Vocabulario PROHIBIDO: glamping, luxury, premium, exclusive, crew, hub
5. Copy en español Chile, "tú" / "nosotros", nunca "usted"
6. Tagline literal preferida: "Vive la aventura." (con punto). Variante hand/script: "¡vive la aventura!" (esa es la única exclamación permitida si la usás en hand).
7. Hashtags al final del caption, lowercase, separados por espacio: #rutacamp #vivelaaventura #motorhome #casarodante #campingchile #patagonia #araucania + 1-2 del destino (#puertofuy #conguillio #huilohuilo #taguatagua #araucania #losrios #losrios)

Reglas tipográficas (cumplir o el title se corta):
- "post-photo": title máx 18 chars, title_size 110-140
- "post-cream": title máx 28 chars, title_size 110-140 (puede ser 2 líneas con un \\n explícito si llega a ~14 chars/línea)
- "story-photo": title máx 22 chars, title_size 130-180
- "story-cream": title máx 30 chars, title_size 130-180
- "carrusel-cover": title máx 20 chars, title_size 120-150
- "carrusel-content": title máx 30 chars, title_size 70-100; body máx 220 chars
- "carrusel-end": title igual a tagline ("Vive la aventura."), title_size 130-150

Decisión format/template (si el brief no dice):
- Anuncio fuerte / cita / fechas duras → cream
- Destino, mood, naturaleza, fotos hermosas → photo
- Brief pide "story" o "stories" → format=story
- Brief pide "carrusel" / "carousel" / "info en partes" → format=carrusel

Folder IDs de Drive (úsalos directo en drive_folder_id):
- puerto-fuy: 1glVvj18UBe1k1lRy42MVtTbkhiBFHscX
- conguillio (Llaima Domo, Melipeuco): 1WM4XE_0B46dAwuqMjDmhzY6qG6R7CdBw
- tagua-tagua (Base Puelo): 13imQqhX1PpSw47Yx2jhn3UPUfEKjlLQO
- malalcahuello: null  (no hay fotos compartidas → usar template -cream)
- villarrica: null  (próximamente → usar template -cream)
- red: 1OEpCeITp2DsjlbOjWB2GKeDbZeIWH-qh
- aéreas/dron: 1T_Fe0qnpDyJqK6e77oVo7-BbWr59DL6-

photo_keywords: 3-6 palabras clave en minúsculas que ayuden a elegir foto (ej: ["atardecer","lago","motorhome"]). Pensá en lo que el brief evoca, no metas palabras genéricas como "naturaleza".

Devuelve SOLO el JSON, sin envolverlo en \`\`\` ni texto extra.`;

export async function briefToSpec(brief, { format, model = 'claude-opus-4-7' } = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY env var not set');
  const client = new Anthropic({ apiKey });

  const manualPath = path.join(__dirname, '..', 'brand', 'MANUAL.md');
  const manual = await fs.readFile(manualPath, 'utf8');

  // If a format hint is passed (from the workflow input), inject it into the user message
  const userContent = format && format !== 'auto'
    ? `Formato pedido: ${format}\n\nBrief: ${brief}`
    : brief;

  const msg = await client.messages.create({
    model,
    max_tokens: 3000,
    system: [
      { type: 'text', text: SYSTEM },
      { type: 'text', text: `\n\n--- MANUAL DE MARCA (referencia) ---\n${manual}`, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: userContent }],
  });

  const text = msg.content.find(c => c.type === 'text')?.text ?? '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Claude no devolvió JSON parseable. Output:\n' + text);
  const spec = JSON.parse(jsonMatch[0]);

  // Normalization layer: defensive cleanup of common Claude mistakes
  return normalizeSpec(spec);
}

function stripMarkdown(s) {
  if (typeof s !== 'string') return s;
  // [text](url) → text
  return s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();
}

function normalizeSpec(spec) {
  if (!spec.format) {
    // Backwards compat: if template starts with post-, format=post
    if (spec.template?.startsWith('story-')) spec.format = 'story';
    else if (spec.slides) spec.format = 'carrusel';
    else spec.format = 'post';
  }

  const cleanFields = ['eyebrow', 'title', 'subtitle', 'body', 'hand', 'handle', 'cta'];
  for (const f of cleanFields) if (spec[f]) spec[f] = stripMarkdown(spec[f]);

  if (spec.handle && !/@RUTA\.CAMP/i.test(spec.handle)) {
    spec.handle = '@RUTA.CAMP · RUTACAMP.CL';
  } else if (spec.handle) {
    spec.handle = spec.handle.toUpperCase();
  }

  if (spec.slides) {
    for (const slide of spec.slides) {
      for (const f of cleanFields) if (slide[f]) slide[f] = stripMarkdown(slide[f]);
    }
  }

  return spec;
}
