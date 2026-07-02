import os
import json
import uuid
import shutil
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Asistente de Presentación")

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

sessions = {}

class PresentationSession:
    def __init__(self):
        self.slides = []
        self.current_slide = 0
        self.title = ""
        self.transcript_history = []
        self.groq_key = None

    def extract_slides(self, filepath: str):
        ext = Path(filepath).suffix.lower()
        if ext == ".pdf":
            self._extract_pdf(filepath)
        elif ext == ".pptx":
            self._extract_pptx(filepath)

    def _extract_pdf(self, filepath: str):
        import fitz
        doc = fitz.open(filepath)
        for page in doc:
            text = page.get_text().strip()
            if text:
                self.slides.append({"number": len(self.slides) + 1, "content": text})
        doc.close()

    def _extract_pptx(self, filepath: str):
        from pptx import Presentation
        prs = Presentation(filepath)
        for slide in prs.slides:
            parts = []
            for shape in slide.shapes:
                if shape.has_text_frame:
                    for para in shape.text_frame.paragraphs:
                        t = para.text.strip()
                        if t:
                            parts.append(t)
            text = "\n".join(parts)
            if text:
                self.slides.append({"number": len(self.slides) + 1, "content": text})


@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    session_id = str(uuid.uuid4())
    ext = Path(file.filename).suffix.lower()
    if ext not in (".pdf", ".pptx"):
        return JSONResponse({"error": "Solo PDF y PPTX son soportados"}, status_code=400)

    dest = UPLOAD_DIR / f"{session_id}{ext}"
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)

    session = PresentationSession()
    session.title = Path(file.filename).stem
    session.extract_slides(str(dest))

    if not session.slides:
        return JSONResponse({"error": "No se pudo extraer texto de la presentación"}, status_code=400)

    sessions[session_id] = session
    return {
        "session_id": session_id,
        "title": session.title,
        "total_slides": len(session.slides),
        "slides": session.slides,
    }


@app.get("/session/{session_id}")
async def get_session(session_id: str):
    session = sessions.get(session_id)
    if not session:
        return JSONResponse({"error": "Sesión no encontrada"}, status_code=404)
    return {
        "session_id": session_id,
        "title": session.title,
        "total_slides": len(session.slides),
        "current_slide": session.current_slide,
        "slides": session.slides,
    }


@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    await websocket.accept()
    session = sessions.get(session_id)
    if not session:
        await websocket.send_json({"error": "Sesión no encontrada"})
        await websocket.close()
        return

    client = None

    try:
        while True:
            data = await websocket.receive_json()
            action = data.get("action")

            if action == "set_key":
                key = data.get("key", "").strip()
                if key:
                    session.groq_key = key
                    await websocket.send_json({"type": "key_set"})

            elif action == "transcribe":
                if not client:
                    api_key = session.groq_key or GROQ_API_KEY
                    if not api_key:
                        await websocket.send_json({"type": "error", "message": "Configura tu API key de Groq primero"})
                        continue
                    from groq import AsyncGroq
                    client = AsyncGroq(api_key=api_key)
                transcript = data.get("text", "").strip()
                if not transcript:
                    continue

                session.transcript_history.append(transcript)
                session.transcript_history = session.transcript_history[-20:]

                current = session.current_slide
                slide_content = session.slides[current]["content"] if current < len(session.slides) else ""

                recent = " ".join(session.transcript_history[-5:])
                all_summaries = [
                    f"Slide {s['number']}: {s['content'][:200]}"
                    for s in session.slides
                ]

                system_prompt = """Eres un coach de presentaciones en tiempo real. Analizas lo que el presentador dice y el slide actual.
Responde ÚNICAMENTE con JSON sin formato, sin markdown, sin etiquetas.

Formato exacto:
{"advice":"texto breve de consejo","slide_match":true/false,"suggested_slide":numero o null,"off_topic":true/false,"confidence":0.0-1.0}

- advice: consejo útil y corto (máx 2 oraciones). Si va bien, da ánimo. Si se desvía, sugiere retomar. Si omite puntos clave, menciónalos.
- slide_match: true si lo que dijo corresponde al slide actual
- suggested_slide: si lo que dijo coincide más con OTRO slide, pon su número (1-indexed). Si no, null.
- off_topic: true si se está desviando del tema del slide actual
- confidence: qué tan seguro estás de tu análisis (0.0 = nada, 1.0 = totalmente)"""

                user_msg = json.dumps({
                    "current_slide": current + 1,
                    "total_slides": len(session.slides),
                    "slide_content": slide_content[:1500],
                    "recent_transcript": recent,
                    "presentation_title": session.title,
                    "all_slides_summary": all_summaries,
                })

                try:
                    completion = await client.chat.completions.create(
                        model="llama3-8b-8192",
                        messages=[
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_msg},
                        ],
                        temperature=0.3,
                        max_tokens=300,
                    )

                    raw = completion.choices[0].message.content.strip()
                    raw = raw.replace("```json", "").replace("```", "").strip()
                    result = json.loads(raw)

                    if result.get("suggested_slide") and result["suggested_slide"] != current + 1:
                        session.current_slide = result["suggested_slide"] - 1

                    result["current_slide"] = session.current_slide + 1
                    await websocket.send_json({"type": "advice", **result})

                except Exception as e:
                    await websocket.send_json({"type": "error", "message": str(e)})

            elif action == "set_slide":
                slide_num = data.get("slide", 1) - 1
                if 0 <= slide_num < len(session.slides):
                    session.current_slide = slide_num
                    await websocket.send_json({
                        "type": "slide_changed",
                        "current_slide": slide_num + 1,
                    })

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except:
            pass


if not GROQ_API_KEY:
    print("⚠️  ADVERTENCIA: GROQ_API_KEY no está configurada. Usa el archivo .env")

app.mount("/", StaticFiles(directory="static", html=True), name="static")
