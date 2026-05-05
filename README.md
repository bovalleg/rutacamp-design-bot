# Ruta Camp — Design Bot

Bot que genera posts de Instagram on-brand para [@ruta.camp](https://www.instagram.com/ruta.camp/) a partir de un brief en español. Combina **Claude API** (decide el diseño según el manual de marca), **Google Drive** (elige una foto del destino) y **Playwright** (renderiza el PNG final 1080×1080).

> Tagline: **"Vive la aventura."**

---

## Cómo se usa

Una vez configurado (ver [Setup](#setup)):

```bash
gh workflow run design.yml \
  -f brief="post para Puerto Fuy, mood golden hour, abrimos reservas verano, CTA link en bio" \
  -f upload_to_drive=true
```

El workflow:

1. Manda el brief + el manual de marca a Claude → recibe una *spec* JSON.
2. Si la spec pide foto, lista la carpeta de Drive del destino, filtra por calidad, y elige una.
3. Renderiza con Playwright a PNG 1080×1080 @2x (efectivo 2160px) usando uno de los templates HTML.
4. Sube el PNG al folder de outputs en Drive (opcional) y lo expone como artifact del workflow.
5. Escribe un `.caption.txt` paralelo con el caption sugerido para IG.

También se puede correr local:

```bash
npm install
npm run install-browser
BRIEF="post para Conguillío, anuncio temporada, sin foto" \
ANTHROPIC_API_KEY=sk-ant-... \
GOOGLE_SERVICE_ACCOUNT_JSON="$(cat sa.json)" \
node src/index.mjs
# → out/rutacamp_conguillio_2026-XX-XX.png
```

---

## Arquitectura

```
brief
  ↓
src/claude.mjs       → llama Claude API con el manual como system prompt
  ↓ (spec JSON)
src/photo-picker.mjs → lista Drive folder del destino, filtra y elige
  ↓ (file id)
src/drive.mjs        → descarga la foto a out/photo.jpg
  ↓
src/render.mjs       → Playwright + template HTML → PNG 1080×1080
  ↓
src/index.mjs        → orquesta + sube a Drive + emite caption
```

Templates en `templates/`:
- `post-photo.html` — foto full-bleed con gradiente protección, eyebrow + título Playfair italic, hand script
- `post-cream.html` — postcard editorial sin foto, logo centrado, doble línea horizontal

Brand assets en `brand/`:
- `colors_and_type.css` — tokens de marca (paleta, tipografías, escalas)
- `MANUAL.md` — manual completo (lo lee Claude en cada llamada)
- `assets/logo-dark.png`, `assets/logo-light.png`

---

## Setup

### 1. GitHub CLI (en tu máquina)

Instalar `gh` (si todavía no lo tenés):

- Windows: `winget install --id GitHub.cli`
- O descargar desde https://cli.github.com/

Después:

```bash
gh auth login
```

### 2. Crear el repo público

Desde el directorio del proyecto:

```bash
cd "rutacamp-design-bot"
git init
git add .
git commit -m "Initial commit: Ruta Camp design bot scaffold"
gh repo create rutacamp-design-bot --public --source=. --push
```

### 3. Anthropic API key

1. Andá a https://console.anthropic.com/settings/keys
2. Creá una key nueva, copiá el `sk-ant-...`
3. Agregala como secret en el repo:

```bash
gh secret set ANTHROPIC_API_KEY
# pegá la key cuando pida
```

### 4. Google Drive service account

El bot necesita un *service account* (cuenta robot de Google) con permiso para leer las carpetas de fotos y escribir en la carpeta de outputs.

**Crear el service account:**

1. Andá a https://console.cloud.google.com/ y creá un proyecto nuevo (`ruta-camp-bot`).
2. APIs y Servicios → habilitá **Google Drive API**.
3. IAM y Administración → Cuentas de servicio → Crear cuenta de servicio.
   - Nombre: `rutacamp-bot`
   - Rol: ninguno (no le des permisos a nivel proyecto)
4. Una vez creada, andá a la cuenta → Claves → Agregar clave → JSON. Se descarga `<algo>.json`.

**Compartir las carpetas con el service account:**

Abrí el JSON descargado, copiá el campo `client_email` (algo como `rutacamp-bot@ruta-camp-bot.iam.gserviceaccount.com`).

En Drive, click derecho en cada carpeta → Compartir → pegá ese email como **Lector** (Viewer):

- "Selección Fotos Ruta Camp" (`1OEpCeITp2DsjlbOjWB2GKeDbZeIWH-qh`)
- "Dron Ruta Camp" (`1T_Fe0qnpDyJqK6e77oVo7-BbWr59DL6-`)

Y creá una carpeta nueva en Drive llamada **"Ruta Camp · Outputs Bot"**, compartila con ese mismo email pero como **Editor** (para que pueda subir). Copiá el ID de esa carpeta (de la URL).

**Cargar los secrets en GitHub:**

```bash
# Service account JSON entero (el archivo descargado)
gh secret set GOOGLE_SERVICE_ACCOUNT_JSON < ruta-al-archivo.json

# ID de la carpeta donde se suben los outputs
gh secret set OUTPUT_DRIVE_FOLDER_ID
# pegá el ID cuando pida
```

### 5. Probar end-to-end

```bash
gh workflow run design.yml -f brief="post para Puerto Fuy mood naturaleza, conexión completa, link en bio"
```

Verlo correr:

```bash
gh run list --workflow=design.yml --limit 5
gh run view --log
```

Cuando termine, descargar los artifacts:

```bash
gh run download --name rutacamp-design
# → out/rutacamp_*.png + out/rutacamp_*.caption.txt
```

O abrir el PNG directo en Drive (folder de outputs).

---

## Template del brief

Lo más útil para Claude es ser específico:

```
post para [destino], [tipo: post|story|carrusel],
mood [aventura|golden hour|noche|invierno|familiar|...],
mensaje [el copy clave en una línea],
CTA [reservas|link en bio|fechas|contacto|nada]
```

Ejemplos:

- `post para Puerto Fuy, mood golden hour, abrimos reservas verano, CTA reservas en bio`
- `post para Conguillío, anuncio temporada invierno, sin foto, CTA link en bio`
- `post para Tagua Tagua, mood familiar atardecer, mensaje "el lago es nuestro patio", CTA reservas`

---

## Modificar el manual de marca

Si cambian los colores, las tipografías, los hashtags oficiales, las reglas de copy:

1. Editar `brand/MANUAL.md` y/o `brand/colors_and_type.css`.
2. Editar también el `SKILL.md` de la skill local en `~/.claude/skills/ruta-camp-design/` para mantenerlos en sync (esa skill es lo que uso yo cuando me pedís diseños desde acá en chat).
3. Commit + push: el próximo run del bot usa la versión nueva.

---

## Lo que NO hace (todavía)

- Stories 1080×1920 — fácil de agregar copiando el template y cambiando dimensiones.
- Carruseles multi-slide — requiere extender `claude.mjs` para devolver un array de specs.
- Subida directa a Canva — requiere OAuth de Canva en CI; por ahora subimos a Drive y vos lo importás manual.
- Posteo automático a Instagram — fuera de scope; usar Buffer / Meta API en otro workflow si se quiere.

---

## Estructura

```
rutacamp-design-bot/
├── .github/workflows/design.yml   # GitHub Action — punto de entrada
├── brand/
│   ├── MANUAL.md                   # manual de marca (lo lee Claude)
│   ├── colors_and_type.css         # tokens de diseño
│   └── assets/
│       ├── logo-dark.png
│       └── logo-light.png
├── templates/
│   ├── post-photo.html
│   └── post-cream.html
├── src/
│   ├── index.mjs                   # orquestador
│   ├── claude.mjs                  # brief → JSON spec
│   ├── photo-picker.mjs            # elige foto de Drive folder
│   ├── drive.mjs                   # download / upload Drive
│   └── render.mjs                  # Playwright → PNG
├── package.json
├── .gitignore
└── README.md
```
