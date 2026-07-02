# Asistente de Presentación

Asistente inteligente para presentaciones que escucha al expositor vía micrófono, analiza el contenido de las diapositivas (PDF/PPTX) y proporciona información enriquecida en tiempo real usando Groq (Llama 3.1) y búsqueda web (DuckDuckGo).

## Arquitectura

```
┌──────────┐     ┌──────────────┐     ┌───────────┐
│ Frontend │────▶│  FastAPI     │────▶│   Groq    │
│ (PWA)    │◀───▶│  (WebSocket) │     │   API     │
└──────────┘     └──────┬───────┘     └───────────┘
                        │
                        ▼
                  ┌───────────┐
                  │ DuckDuckGo│
                  │  Search   │
                  └───────────┘
```

## Estructura del proyecto

```
asistente-presentacion/
├── main.py              # Backend FastAPI (314 líneas)
├── requirements.txt     # Python dependencies
├── runtime.txt         # Python 3.11
├── Procfile            # Render: uvicorn
├── start.sh            # Startup script
├── DEPLOY.md           # Deploy instructions
├── MEMORIA.md          # Este archivo
├── .env.example        # Template para API key
├── .gitignore
├── uploads/            # Archivos subidos (gitignored)
└── static/
    ├── index.html      # PWA principal (134 líneas)
    ├── manifest.json   # PWA manifest
    ├── sw.js           # Service Worker (no-op)
    ├── css/
    │   └── style.css   # Dark theme, mobile-first (312 líneas)
    └── js/
        ├── app.js           # Orquestador principal (340 líneas)
        ├── upload.js        # Upload + auto-analyze (116 líneas)
        ├── speech.js        # Web Speech API wrapper (84 líneas)
        └── presentation.js  # Gestión de diapositivas (71 líneas)
```

## Backend (`main.py`)

### Endpoints

| Ruta | Método | Propósito |
|------|--------|-----------|
| `/upload` | POST | Subir PDF/PPTX y extraer texto por diapositiva |
| `/analyze/{session_id}` | POST | Analizar toda la presentación con Groq + DuckDuckGo |
| `/ws/{session_id}` | WebSocket | Transcripción en tiempo real + advice |
| `/` | GET | Sirve la PWA (StaticFiles) |

### Flujo

1. **Upload**: El usuario sube PDF/PPTX → se extrae texto por slide → se guarda en `sessions` (memoria)
2. **Analyze**: Se envía todo el contenido a Groq con `response_format=json_object`. Groq devuelve:
   - `key_points` por slide
   - `search_terms` para búsqueda web
   - `questions` con respuestas sugeridas
   - Luego se buscan hasta 3 términos en DuckDuckGo
3. **WebSocket (tiempo real)**:
   - El frontend envía transcripciones cada ~600ms
   - El backend las agrupa (últimas 5), consulta a Groq
   - Groq devuelve advice + extra_info + suggested_questions + qa_answer
   - Se envía de vuelta al frontend como JSON

### Modelo

- **Groq**: `llama-3.1-8b-instant`
- **Temperatura**: 0.2 (consistente)
- **Max tokens**: 2000 (análisis), 500 (WebSocket)
- **Formato**: `response_format={"type": "json_object"}`

## Frontend

### Tecnologías
- Sin frameworks. JavaScript vanilla (ES6 classes)
- Web Speech API para reconocimiento de voz (`es-MX`)
- WebSocket nativo para comunicación bidireccional
- PWA con manifest.json + Service Worker (no-op para evitar caching)

### Pantallas

1. **Upload** (`#upload-screen`): Zona de upload con drag & drop, configuración de Groq API key (modal)
2. **Presentación** (`#presentation-screen`):
   - Header con título y estado de conexión
   - Main tabs: **📖 Diapositiva** | **💡 Consejos**
   - Slide panel: contenido textual del slide actual + navegador de slides
   - Advice panel: scroll de consejos + subtabs (Info | Extra | Q&A)
   - Mic section: botón micrófono, barra de confianza, transcripción en vivo

### Clases JS

| Clase | Archivo | Responsabilidad |
|-------|---------|-----------------|
| `UploadManager` | `upload.js` | Upload file, auto-analyze, Groq key management |
| `SpeechManager` | `speech.js` | Web Speech API wrapper, restart automático |
| `PresentationManager` | `presentation.js` | Slides, dots, slide navigation |
| (IIFE) | `app.js` | WebSocket, tab switching, advice rendering |

## Bugs encontrados y fixes

### 1. JS roto por referencias DOM obsoletas
- **Problema**: `presentation.js` referenciaba `panel-keypoints`, `slide-number` que ya no existían tras el rediseño de HTML
- **Fix**: Eliminar referencias a elementos que ya no están en el DOM

### 2. Service Worker cacheando versión vieja
- **Problema**: SW en producción cacheaba `index.html` y JS, mostrando siempre versión antigua
- **Fix**: SW no-op (solo passthrough) + `unregister()` en `index.html` y `app.js`

### 3. JSON malformado de Groq
- **Problema**: Groq a veces devolvía JSON con strings sin cerrar o texto adicional fuera del JSON
- **Fix**: Usar `response_format={"type": "json_object"}` + aumentar `max_tokens` de 200 a 500

## Deploy

- **GitHub**: `https://github.com/Litios0912/asistente-presentacion`
- **Render**: `https://asistente-presentacion.onrender.com`
- **Free tier**: Render duerme después de 15min sin actividad (10-30s de wake-up)

## Variables de entorno

| Variable | Descripción |
|----------|-------------|
| `GROQ_API_KEY` | API key de Groq (también configurable desde el frontend) |

## Dependencias clave

- `fastapi` + `uvicorn` - Servidor web
- `PyMuPDF` (fitz) - Extracción de texto de PDF
- `python-pptx` - Extracción de texto de PPTX
- `groq` - Cliente para Groq API (compatible con OpenAI)
- `duckduckgo_search` - Búsqueda web sin API key

## Historial de commits

```
7fce9b9 Fix: increase max_tokens to 500 for json_object mode
fc9239d Fix: use response_format json_object to prevent malformed JSON from Groq
82dab7c Fix: disable Service Worker caching, unregister on load
c898a90 Fix: remove references to non-existent DOM elements that broke JS
8a4cbf0 Fix: force SW cache refresh with new version
4310c7b Major UI redesign: two main tabs (Slide | Advice), faster detection
fc96b01 Redesign: enrichment assistant + web search, no more evaluation/coaching
```

## Notas técnicas

- Web Speech API requiere HTTPS (o localhost). Render provee HTTPS automáticamente.
- El reconocimiento de voz funciona mejor en Chrome/Edge (escritorio y Android).
- El análisis previo (`/analyze`) puede tomar 10-20s en Render free tier por el wake-up.
- Las sesiones se almacenan en memoria (dict de Python) — se pierden al reiniciar el servidor.
- El buffer de transcripción acumula texto y envía cada 600ms para balancear velocidad vs. tokens.
