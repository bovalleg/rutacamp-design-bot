# Ruta Camp — Design System

> **Ruta Camp** es una red chilena de campings para casas rodantes, motorhomes y campers, con conexiones completas de agua, luz y desagüe en destinos de la Patagonia y la Araucanía.
>
> Tagline: **"Vive la aventura."**

This design system powers the **Ruta Camp Instagram BOT** — a tool that generates on-brand posts, reels, stories and carousels from the brand's content (copy + Google Drive image library).

---

## Company context

- **Industry:** outdoor / travel / hospitality. Not gear, not tours — *infrastructure* for self-driven motorhome travel.
- **Region:** Chile (Patagonia, Araucanía, Los Ríos, Los Lagos).
- **Current locations (4 active + 1 soon):**
  - Malalcahuello (Warara)
  - Melipeuco — Conguillío (Llaima Domo)
  - Puerto Fuy (Huilo-Huilo)
  - Lago Tagua Tagua (Base Puelo)
  - *Próximamente:* Villarrica
- **Partner:** Kunstmann Outdoors (motorhome importer).
- **Founded:** 2023 (Ruta Camp SpA).
- **Audience:** Chilean rodanteros — families and couples who own or rent a motorhome/camper and want nature + comfort. Spanish-speaking, adventure-leaning but **not** extreme; "aventura con enchufe".

---

## Sources referenced

| Source | URL / path | Notes |
|---|---|---|
| Website | https://www.rutacamp.cl | Wix site. Hero, destinos, partner section, copy. |
| Instagram | https://www.instagram.com/ruta.camp/ | Handle `@ruta.camp`. Primary content channel. |
| Reel reference | https://www.instagram.com/reel/DEqM6SMp6dc/ | Provided by client as content-style reference. |
| Logo (dark on light) | `assets/logo-dark.png` | From `uploads/Con Zoom - LN - FBT.png` |
| Logo (light on dark) | `assets/logo-light.png` | From `uploads/Con Zoom - LB - FBT.png` (transparent, white fill) |
| Contact | reservas@rutacamp.cl · +56 9 81380809 | — |

*Readers: the client does not assume you have access to the site — everything you need is copied or extracted into this folder.*

---

## Content Fundamentals

**Language:** Spanish (Chile). Never English except for the word *"camp"* which is embedded in the name.

**Voice.** Warm, invitational, a little poetic. Writes *to* the reader as a future traveler, not as a vendor selling a product. Not corporate, not overly casual. **"Nosotros"** for the brand, **"tú"** for the reader (Chilean informal, never "usted").

**Tone attributes:**
- Aventura — *"Embárcate en una aventura única por Chile."*
- Naturaleza — references to volcanoes, lakes, forests, "la grandeza de Chile"
- Comodidad/tranquilidad — "todas las conexiones que necesitas"
- Autenticidad — real places, real photos, no stock

**Casing.** Sentence case for body copy. ALL CAPS only for headings/eyebrows in design, never in prose. Exclamation marks used sparingly — reserve for the hero moments (¡Vive la aventura!). Never more than one "!" in a row.

**Emoji.** **Sparingly.** If used, only these: 🏕️ ⛰️ 🔥 🚐 🌲 🌊. Never hearts, never ✨, never trending trash. Prefer to carry personality via typography + imagery.

**Hashtags (social).** Bundled at the *end* of the caption, lowercase, Chile-first:
`#rutacamp #vivelaaventura #motorhome #casarodante #campingchile #patagonia #araucania`

**Vocabulary to use:** ruta, aventura, conexión, naturaleza, rodantero, campers, destino, volcán, lago, bosque, cordillera.
**Vocabulary to avoid:** glamping, luxury, premium, exclusive. Ruta Camp is *accessible* adventure.

**Example copy (real, from site):**
> "Ruta Camp es una red de campings para casas rodantes, motorhomes y camper, que cuenta con servicios de conexión completos de agua, luz y desagüe."

> "Embárcate en una aventura única por Chile con nuestra red de campings para casas rodantes, estratégicamente situados en lugares asombrosos."

> "Donde la Ruta comienza."

---

## Visual Foundations

### Color vibe
Warm, **earthy and organic**. Low-saturation naturals, never neons. Palette pulled from the Chilean south: volcanic charcoal, canvas cream, forest moss, glacial-lake teal, campfire ember, golden-hour amber.

Two canonical modes:
1. **Cream mode** (default) — cream paper bg, ink text, ember/forest accents. Warm, editorial, "field notebook."
2. **Ink mode** — near-black bg, cream text, amber accents. Evokes night sky / around-the-fire.

Avoid blue-purple gradients, pastel mint, or anything that reads digital/SaaS.

### Typography
- **Display/serif:** Playfair Display (Google Fonts substitute for the custom wedge serif in the logo — *flag: please share the original logo typeface if available*).
- **Eyebrow/caps:** Oswald (condensed, all caps, tracked). Carries the "VIVE LA AVENTURA" rhythm.
- **Body:** Nunito Sans (warm humanist, very readable at Instagram-caption sizes).
- **Hand/accent:** Caveat (script flourish for callouts like "¡vive la aventura!" or handwritten map labels).

Rules of thumb: display serif for headlines, Oswald eyebrow above it, Nunito body below. Hand script used at most **once per composition**, as ornament.

### Imagery
- **Real, warm, outdoors.** Motorhomes in wild places: forests, lakes, volcanoes. Soft natural light, golden hour preferred.
- **Color grade:** warm, slight fade, keep greens and browns rich; avoid cold/blue grading.
- **Grain:** OK. A touch of film grain fits the vintage-badge vibe.
- **Never:** stock-looking glamour shots, tight product-catalog crops, people posing for camera. Prefer candid + landscape.
- Full-bleed photography is the strongest move. Reserve for hero moments.

### Backgrounds
- Solid cream or ink are the **default**. Let imagery and type do the work.
- Full-bleed photo with a **darkened gradient protection** at bottom/top for type legibility (vertical linear from rgba(30,28,24,0) → 0.55).
- Paper grain overlay at very low opacity (~10%) is on-brand when bg is plain cream.
- Avoid colored gradients. If any, use warm cream→sand or ink→volcano only.

### Animation
- Slow, **cinematic**. Ken Burns slow zooms on photos. Fade + gentle upward translate (12–20px) for text. Never bounce, never rubber-band.
- Easing: `cubic-bezier(.2,.7,.2,1)` (soft ease-out) or standard `ease-out`. Durations 500–900ms for narrative beats, 150–250ms for UI feedback.

### Hover / press states
- **Hover:** opacity to 0.85 OR 1px inset border darken. Never glow.
- **Press:** scale(.98), optional darken by 6%. No shrink below .96.
- **Focus:** 2px solid `--accent` outline with 2px offset.

### Borders, shadows, radii
- **Borders:** thin (1px) in `rgba(30,28,24,0.18)`. For emphasis use 2px solid ink. The logo badge uses a **double-stroke circle** — echo this motif sparingly (e.g. framing hero titles).
- **Shadows:** warm, soft, long. Never pure black. Use `--shadow-md` / `--shadow-lg`. For accent buttons use `--shadow-ember`.
- **Radii:** mostly **slight to zero** — the brand is vintage/editorial. `--r-sm` (4px) for most UI. Full `--r-pill` only for badges/CTAs. Cards can be 0 radius with a 1px border for a "postcard" feel, or `--r-lg` (14px) for softer social cards.

### Layout rules
- Generous whitespace. Cream breathes.
- Strong horizontal rules (1px ink, or double rule) to separate sections — like a zine.
- Compositions often centered with symmetrical margins (matches the circular-badge logo).
- For IG posts, safe area is 60px inset from each edge.

### Transparency / blur
- Avoid frosted-glass. Use **solid color blocks** or **gradient protection** over imagery instead.
- One exception: a 40% ink overlay on full-bleed photos for headline legibility.

### Cards
- **Cream postcard:** cream bg, 1px ink border, no radius, 32px padding, optional inner dashed divider. The default.
- **Photo card:** full-bleed image, bottom gradient protection, title in serif white, eyebrow in amber above.
- **Field-note card:** cream with a torn/dashed top border, hand script accent.

---

## Iconography

**Primary icon vocabulary comes from the logo badge itself:**
🏕️ tent · 🔥 fire · ⛏️ pickaxe · 🪓 axe · 🚐 vintage bus/van. These can be extracted from the logo SVG/PNG and reused as standalone ornaments (black-filled, silhouette style).

**System icons (UI):** for interface elements we use **[Lucide](https://lucide.dev/)** via CDN — thin 1.75px stroke icons. Chosen because they match the clean, editorial feel without competing with the vintage logo.

```html
<script src="https://unpkg.com/lucide@latest"></script>
<!-- then -->
<i data-lucide="map-pin"></i>
<script>lucide.createIcons()</script>
```

Allowed lucide icons for Ruta Camp: `map-pin`, `mountain`, `tent`, `flame`, `caravan`, `droplet`, `zap`, `waves`, `trees`, `compass`, `sun`, `moon`, `calendar`, `phone`, `mail`, `instagram`, `facebook`.

**Silhouette ornaments** (from the badge, black-filled): tent, fire, crossed pickaxe+axe, vintage bus. Use at large sizes as decorative background elements — never at small UI sizes (the badge is too detailed).

**Emoji:** avoid in product/design surfaces. OK *very* sparingly in IG caption text — see Content Fundamentals.

**Unicode dingbats:** avoid. Use Lucide or extracted logo silhouettes.

**⚠️ Substitution flag:** Ruta Camp does not ship a proprietary icon set. Lucide is a substitute chosen for aesthetic consistency. If the brand adopts a custom icon set later, swap it in and update this doc.

---

## Files in this folder

| Path | What it is |
|---|---|
| `README.md` | This file — context, content rules, visual foundations, iconography. |
| `SKILL.md` | Agent-skill entry point. Cross-compatible with Claude Code skills. |
| `colors_and_type.css` | Design tokens (CSS custom properties) + semantic element defaults. |
| `assets/` | Logos, brand imagery, extracted ornaments. |
| `fonts/` | (Empty — all fonts loaded from Google Fonts CDN. Swap in `.woff2` if custom files arrive.) |
| `preview/` | Small HTML cards that populate the Design System review tab. |
| `ui_kits/instagram/` | Instagram post / story / reel-cover / carousel templates (the primary surface). |
| `ui_kits/instagram/index.html` | Live preview of all templates with tabs for posts, stories, and carousel. |
| `ui_kits/instagram/PostTemplate.jsx` | 4 post variants: photo, cream, split, quote. |
| `ui_kits/instagram/StoryTemplate.jsx` | 3 story variants: photo, cream, announce. |
| `ui_kits/instagram/CarouselTemplate.jsx` | Cover / content slide / end-card. |

---

## Quick ask to the user

Some things we substituted or guessed — flag if wrong:
1. **Custom logo typeface.** Replaced with Playfair Display. Please share the original font file if available.
2. **Brand color specifics.** Palette was *derived* from the logo + site + Patagonian setting, not a published palette guide. If Ruta Camp has defined brand hex codes, share them.
3. **Official hashtag set.** Pulled from convention; confirm the official list.
4. **Photography.** No stock photos from the Google Drive yet — the UI kit uses warm gradient placeholders with a note. When you connect the Drive to the bot, real photos plug in directly.
