# Asistente de Presentacion

Asistente inteligente para presentaciones que escucha al expositor via microfono, analiza el contenido de las diapositivas (PDF/PPTX) y proporciona informacion enriquecida en tiempo real usando Groq (Llama 3.1) y busqueda web (DuckDuckGo).

[![Python](https://img.shields.io/badge/Python-3.11-blue?logo=python)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?logo=fastapi)](https://fastapi.tiangolo.com)
[![Groq](https://img.shields.io/badge/Groq-Llama%203.1-1a9e5f)](https://groq.com)
[![PWA](https://img.shields.io/badge/PWA-Enabled-5A0FC8)](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

## Caracteristicas

- **Carga de presentaciones** - Sube archivos PDF o PPTX y extrae el texto automaticamente
- **Analisis con IA** - Cada diapositiva es analizada por Groq para generar puntos clave, preguntas y respuestas
- **Busqueda web** - DuckDuckGo busca informacion adicional relevante para cada tema
- **Transcripcion en vivo** - Usa la Web Speech API para reconocer lo que dices en tiempo real
- **Consejos contextuales** - Recibe informacion enriquecida basada en lo que estas diciendo y la diapositiva actual
- **Deteccion de preguntas** - Si alguien pregunta, el asistente sugiere una respuesta
- **PWA** - Funciona en cualquier dispositivo movil o desktop como una app nativa

## Tecnologias

| Componente | Tecnologia |
|---|---|
| Backend | FastAPI (Python) |
| Frontend | HTML + CSS + JS vanilla |
| IA | Groq API (Llama 3.1 8B) |
| Busqueda | DuckDuckGo Search |
| Voz | Web Speech API |
| PDF | PyMuPDF |
| PPTX | python-pptx |
| Despliegue | Render |

## Instalacion y uso local

```bash
# Clonar
git clone https://github.com/Litios0912/asistente-presentacion.git
cd asistente-presentacion

# Dependencias
pip install -r requirements.txt

# Configurar API key
echo "GROQ_API_KEY=gsk_tu_key_aqui" > .env

# Iniciar servidor
uvicorn main:app --reload --host=0.0.0.0 --port=8000
```

Abrir `http://localhost:8000` en Chrome o Edge.

## API Endpoints

| Ruta | Metodo | Descripcion |
|---|---|---|
| `/upload` | POST | Subir PDF o PPTX |
| `/analyze/{session_id}` | POST | Analizar presentacion con IA |
| `/ws/{session_id}` | WebSocket | Transcripcion y consejos en tiempo real |
| `/` | GET | Frontend PWA |

## Variables de entorno

| Variable | Obligatoria | Descripcion |
|---|---|---|
| `GROQ_API_KEY` | Si | API key de Groq (consigue gratis en console.groq.com) |

## Despliegue en Render

1. Crear Web Service en [render.com](https://render.com)
2. Conectar repositorio de GitHub
3. Build command: `pip install -r requirements.txt`
4. Start command: `uvicorn main:app --host=0.0.0.0 --port=$PORT`
5. Agregar variable de entorno: `GROQ_API_KEY`

## Estructura del proyecto

```
asistente-presentacion/
  main.py              # Backend FastAPI
  requirements.txt     # Dependencias Python
  Procfile             # Configuracion Render
  runtime.txt          # Version Python
  static/
    index.html         # Frontend PWA
    manifest.json      # Config PWA
    sw.js              # Service Worker
    css/style.css      # Estilos dark theme
    js/
      app.js           # Logica principal
      upload.js        # Carga de archivos
      speech.js        # Reconocimiento de voz
      presentation.js  # Gestion de diapositivas
```

## Licencia

MIT
