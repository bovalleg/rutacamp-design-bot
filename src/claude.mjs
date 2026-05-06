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
| format    | templates disponibles                                                                |
|-----------|--------------------------------------------------------------------------------------|
| post      | post-photo, post-cream, post-quote, post-split                                       |
| story     | story-photo, story-cream                                                             |
| carrusel  | (en cada slide) carrusel-cover, carrusel-content, carrusel-content-photo, carrusel-end |

Cuándo usar cada post-template:
- "post-photo" → destino, mood, naturaleza. Foto full-bleed con copy abajo.
- "post-cream" → anuncios, fechas, citas cortas. Sin foto, postcard editorial.
- "post-quote" → testimonio o cita directa de un cliente o frase de marca, ink mode con comillas grandes. Title = la cita literal entre comillas; subtitle = autor o atribución (ej: "— Familia Rodríguez, Febrero 2026"). NO uses con tagline genérica; necesita una cita real.
- "post-split" → comparativa visual + datos: foto a la izquierda, copy a la derecha en cream. Ideal para presentar destino con datos concretos (servicios, ubicación, horarios). Subtitle = etiqueta corta debajo del logo (ej: "PUERTO FUY").

Diferencia entre los content de carrusel:
- "carrusel-content" → cream (sin foto). Para datos, instrucciones, servicios, fechas, listas.
- "carrusel-content-photo" → foto full-bleed con copy abajo. Para visual/mood: paisaje, atardecer, descripción del lugar.
Si usás carrusel-content-photo el slide DEBE tener use_photo:true. Si usás carrusel-content (cream) el slide DEBE tener use_photo:false.

Reglas duras de copy y diseño:
1. Una **única** exclamación en TODA la pieza (suma title + body + hand + slides). En carrusel, máx 1 entre todos los slides.
2. Sin emoji en la pieza/diseño. En el caption, máximo 1-2 emojis del set: 🏕️ ⛰️ 🔥 🚐 🌲 🌊
3. handle SIEMPRE como texto plano: "@RUTA.CAMP · RUTACAMP.CL"  — NUNCA uses sintaxis Markdown como [texto](url) ni linkify nada. El renderer no procesa Markdown.
4. Vocabulario PROHIBIDO (palabras): glamping, luxury, premium, exclusive, crew, hub
5. **Español Chile (CRÍTICO)**: el público es 100% chileno. Tuteo informal: "tú vives", "tú recorres", "tú llegas". NUNCA voseo rioplatense (vivís/recorrés/sos/querés/podés/tenés/sabés/llegás/decís/hacés). NUNCA "usted". Si dudas, usá tercera persona impersonal ("se vive", "se recorre"). Modismos chilenos suaves OK ("po", "weón" → NO; "harto", "rico", "bacán" → con cuidado y solo si calzan con el tono editorial).
6. Tagline literal preferida: "Vive la aventura." (con punto, imperativo tú). Variante hand/script: "¡vive la aventura!" (la única exclamación permitida si la usás en hand).
7. Hashtags al final del caption, lowercase, separados por espacio: #rutacamp #vivelaaventura #motorhome #casarodante #campingchile #patagonia #araucania + 1-2 del destino (#puertofuy #conguillio #huilohuilo #taguatagua #losrios #losrios)
8. **Fotos en carrusel**: si hay drive_folder_id válido, marcá use_photo:true en al menos 2 slides — el cover SIEMPRE, y 1-2 content slides cuando el tema sea visual ("paisaje", "mood", "atardecer", "destino", "cerca de"). Los content slides puramente informativos (servicios, datos, instrucciones, fechas) van sin foto (use_photo:false) para mantener legibilidad. Apuntá a un carrusel mixto: cover-foto + 2 cream + end-ink, o cover-foto + 1 content-foto + 1 cream + end.

Reglas tipográficas (cumplir o el title se corta):
- "post-photo": title máx 18 chars, title_size 110-140
- "post-cream": title máx 28 chars, title_size 110-140 (puede ser 2 líneas con un \\n explícito si llega a ~14 chars/línea)
- "post-quote": title = la cita (máx 110 chars), title_size 56-72; subtitle = atribución
- "post-split": title máx 22 chars, title_size 70-90 (mitad derecha más angosta); subtitle = etiqueta de destino corta (≤14 chars)
- "story-photo": title máx 22 chars, title_size 130-180
- "story-cream": title máx 30 chars, title_size 130-180
- "carrusel-cover": title máx 20 chars, title_size 120-150
- "carrusel-content" / "carrusel-content-photo": title máx 30 chars, title_size 70-100; body máx 220 chars
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

// ---- Vision: choose best photo + focal point ----
// candidates: [{ id, name, base64, mimeType }]
// alreadyChosen: [{ id, name, base64, mimeType, rationale }] — para diversidad en multi-pick
// returns { chosen_index, focal_point: { x: 0-100, y: 0-100 }, rationale } — chosen_index = -1 si NINGUNA es buena
export async function visionPickPhoto(brief, candidates, { template, alreadyChosen = [], model = 'claude-opus-4-7' } = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY env var not set');
  const client = new Anthropic({ apiKey });

  const copyArea = {
    'post-photo': 'bottom 40% of the square (logo top-left, eyebrow top-right, title+body bottom-left, hand bottom-left, handle bottom-right)',
    'story-photo': 'bottom third of the vertical (logo+eyebrow top, title+body bottom; safe areas of 250-300px top and bottom for IG UI)',
    'carrusel-cover': 'center horizontally + bottom-right swipe indicator (title centered horizontally over the photo, gradient protection both ends)',
    'carrusel-content-photo': 'bottom 35% of the square (eyebrow + index top, title+body bottom)',
    'post-split': 'left half is photo only; the right half is cream with copy. Subject of the photo should NOT be in the right half — it gets cropped (the photo only fills 540px wide).',
  }[template] || 'bottom half (text overlays the bottom)';

  // Detect subject hints in the brief: motorhome / casa rodante / fogón / lago / etc.
  const briefLower = brief.toLowerCase();
  const subjectHints = [];
  if (/motorhome|casa rodante|rodantero|camper|rv|veh/.test(briefLower)) subjectHints.push('un motorhome / casa rodante / camper claramente visible');
  if (/conex|enchufe|servic|agua.*luz|electric/.test(briefLower)) subjectHints.push('infraestructura del camping (sitios, conexiones, baños) visible');
  if (/fogón|fogon|fuego|noche/.test(briefLower)) subjectHints.push('fogón, fuego, escena nocturna o de atardecer');
  if (/lago|laguna|agua/.test(briefLower)) subjectHints.push('cuerpo de agua (lago, río, laguna) protagonista');
  if (/bosque|árbol|nativo|cordillera|volcán/.test(briefLower)) subjectHints.push('vegetación / paisaje natural protagonista');
  if (/familia|niñ|junto|grup/.test(briefLower)) subjectHints.push('escena humana / familiar (sin caer en stock)');

  let intro = `Brief del post: ${brief}\nTemplate destino: ${template}\nÁrea de copy en la pieza: ${copyArea}\n`;
  if (subjectHints.length) {
    intro += `\n⚠️ El brief implica que el SUJETO IDEAL de la foto es: ${subjectHints.join(' / ')}. Si alguna candidata muestra ese sujeto, ELEGILA aunque haya otras "más bonitas" sin él. Si NINGUNA muestra el sujeto del brief, devolvé chosen_index: -1 con un rationale claro ("ninguna calza con el sujeto X") — el bot caerá a un layout sin foto.\n`;
  }
  if (alreadyChosen.length) {
    intro += `\n⚠️ DIVERSIDAD: ya elegiste ${alreadyChosen.length} foto(s) anteriormente en este mismo carrusel. Las muestro al final como referencia. Elegí UNA VISUALMENTE DIFERENTE — distinto ángulo, distinto sujeto, distinta luz, distinto encuadre. NO repitas la misma escena aunque sea "la mejor candidata".\n`;
  }
  intro += `\nMirá las ${candidates.length} fotos numeradas (0 a ${candidates.length - 1}) y devolvé EXCLUSIVAMENTE un JSON:\n{\n  "chosen_index": <0-${candidates.length - 1} | -1 si ninguna calza>,\n  "focal_point": { "x": <0-100>, "y": <0-100> },\n  "rationale": "<una línea explicando el por qué>"\n}\nfocal_point = posición del sujeto principal en la foto elegida (50,50 = centro). Para que el sujeto NO quede tapado por el copy, movelo hacia la zona OPUESTA al área de copy.`;

  const userBlocks = [{ type: 'text', text: intro }];
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    userBlocks.push({ type: 'text', text: `Foto ${i}:` });
    userBlocks.push({
      type: 'image',
      source: { type: 'base64', media_type: c.mimeType || 'image/jpeg', data: c.base64 },
    });
  }
  if (alreadyChosen.length) {
    userBlocks.push({ type: 'text', text: `\n--- FOTOS YA ELEGIDAS (no repetir visualmente) ---` });
    for (let i = 0; i < alreadyChosen.length; i++) {
      const c = alreadyChosen[i];
      userBlocks.push({ type: 'text', text: `Ya elegida ${i + 1} (${c.rationale || 'sin rationale'}):` });
      userBlocks.push({
        type: 'image',
        source: { type: 'base64', media_type: c.mimeType || 'image/jpeg', data: c.base64 },
      });
    }
  }

  const msg = await client.messages.create({
    model,
    max_tokens: 500,
    system: 'Sos director de arte de Ruta Camp, una red chilena de campings para motorhomes y casas rodantes. Tu prioridad cuando elegís fotos: (1) que el SUJETO calce con el brief — si el brief habla de motorhomes, la foto DEBE tener un motorhome visible; si habla del lago, el lago debe ser protagonista. (2) recién después: composición, luz, mood, compatibilidad con el área de copy. Si ninguna foto calza con el sujeto pedido, decilo: chosen_index = -1 es una respuesta válida y preferible a forzar una foto que no muestra lo que el brief pide. Respondés SOLO con un JSON válido sin markdown.',
    messages: [{ role: 'user', content: userBlocks }],
  });

  const text = msg.content.find(c => c.type === 'text')?.text ?? '';
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('Vision no devolvió JSON parseable: ' + text);
  return JSON.parse(m[0]);
}

