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
        self.analysis = None

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


@app.post("/analyze/{session_id}")
async def analyze_presentation(session_id: str, data: dict):
    session = sessions.get(session_id)
    if not session:
        return JSONResponse({"error": "Sesión no encontrada"}, status_code=404)

    groq_key = data.get("groq_key") or session.groq_key or GROQ_API_KEY
    if not groq_key:
        return JSONResponse({"error": "GROQ_API_KEY no configurada"}, status_code=400)

    from groq import AsyncGroq
    client = AsyncGroq(api_key=groq_key)
    session.groq_key = groq_key

    slides_text = "\n\n".join(
        f"--- Slide {s['number']} ---\n{s['content'][:1000]}"
        for s in session.slides
    )

    try:
        completion = await client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[
                {"role": "system", "content": """Eres un analista de presentaciones. Dado el contenido completo de una presentación, extrae:
1. Para cada slide: 2-4 puntos clave que el presentador DEBE mencionar
2. 1-3 preguntas potenciales que la audiencia podría hacer sobre cada slide
3. Una respuesta sugerida concisa para cada pregunta (basada en el contenido)

Responde ÚNICAMENTE con JSON, sin markdown:

{
  "slides": [
    {
      "number": 1,
      "key_points": ["texto del punto clave 1", "punto clave 2"],
      "questions": [
        {"q": "pregunta que haría la audiencia", "a": "respuesta sugerida basada en el contenido"}
      ]
    }
  ]
}"""},
                {"role": "user", "content": f"Título: {session.title}\n\n{slides_text}"},
            ],
            temperature=0.2,
            max_tokens=2000,
        )

        raw = completion.choices[0].message.content.strip()
        raw = raw.replace("```json", "").replace("```", "").strip()
        session.analysis = json.loads(raw)
        return {"status": "ok", "analysis": session.analysis}

    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


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
                slide = session.slides[current] if current < len(session.slides) else None
                slide_content = slide["content"] if slide else ""

                recent = " ".join(session.transcript_history[-5:])
                all_summaries = [
                    f"Slide {s['number']}: {s['content'][:200]}"
                    for s in session.slides
                ]

                is_question = bool(transcript.strip().endswith("?"))

                slide_analysis = None
                if session.analysis:
                    for sa in session.analysis.get("slides", []):
                        if sa["number"] == current + 1:
                            slide_analysis = sa
                            break

                key_points_text = ""
                qa_text = ""
                if slide_analysis:
                    kp = slide_analysis.get("key_points", [])
                    if kp:
                        key_points_text = "Puntos clave de este slide:\n" + "\n".join(f"- {p}" for p in kp)
                    qs = slide_analysis.get("questions", [])
                    if qs:
                        qa_text = "Preguntas esperadas para este slide:\n" + "\n".join(f"Q: {q['q']}\nA: {q['a']}" for q in qs)

                if is_question:
                    system_prompt = f"""Eres un coach de presentaciones. El presentador acaba de recibir una PREGUNTA del público.
Responde ÚNICAMENTE con JSON, sin markdown:

{{"advice":"sugerencia de respuesta","slide_match":true/false,"suggested_slide":numero o null,"off_topic":false,"confidence":0.0-1.0,"key_points_covered":[],"key_points_missed":[],"is_question":true,"qa_answer":"respuesta recomendada para la pregunta del público"}}

- advice: cómo abordar la pregunta (mantén la calma, conecta con tu contenido, etc.)
- qa_answer: la mejor respuesta basada en el contenido de la presentación (máx 3 oraciones)
- Si hay preguntas preparadas para este slide y alguna coincide, usa esa respuesta
- confidence: qué tan seguro estás de la respuesta"""

                    user_msg = json.dumps({
                        "current_slide": current + 1,
                        "total_slides": len(session.slides),
                        "slide_content": slide_content[:1500],
                        "pregunta_recibida": transcript,
                        "presentation_title": session.title,
                        "all_slides_summary": all_summaries,
                        **({"puntos_clave_slide": kp} if slide_analysis else {}),
                        **({"qa_preparados": qs} if slide_analysis else {}),
                    })
                else:
                    system_prompt = f"""Eres un coach de presentaciones en tiempo real. Analizas lo que el presentador dice vs el slide actual y los puntos clave esperados.
Responde ÚNICAMENTE con JSON, sin markdown:

{{"advice":"consejo breve (máx 2 oraciones)","slide_match":true/false,"suggested_slide":numero o null,"off_topic":true/false,"confidence":0.0-1.0,"key_points_covered":["puntos que ya mencionó"],"key_points_missed":["puntos que faltan"],"is_question":false,"qa_answer":null}}

- advice: consejo útil. Si va bien, da ánimo. Si se desvía, sugiere retomar. Si faltan puntos clave, menciónalos.
- key_points_covered: lista de puntos clave (del análisis) que ya cubrió en lo que dijo
- key_points_missed: lista de puntos clave que aún no ha mencionado
- slide_match: true si lo que dijo corresponde al slide actual
- suggested_slide: si coincide más con OTRO slide, pon su número
- off_topic: si se está saliendo del tema"""

                    user_msg = json.dumps({
                        "current_slide": current + 1,
                        "total_slides": len(session.slides),
                        "slide_content": slide_content[:1500],
                        "recent_transcript": recent,
                        "presentation_title": session.title,
                        "all_slides_summary": all_summaries,
                        **({"key_points_esperados": slide_analysis["key_points"]} if slide_analysis else {}),
                        **({"qa_disponibles": qs} if slide_analysis else {}),
                    })

                try:
                    completion = await client.chat.completions.create(
                        model="llama-3.1-8b-instant",
                        messages=[
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_msg},
                        ],
                        temperature=0.3,
                        max_tokens=400,
                    )

                    raw = completion.choices[0].message.content.strip()
                    raw = raw.replace("```json", "").replace("```", "").strip()
                    result = json.loads(raw)

                    if result.get("suggested_slide") and isinstance(result["suggested_slide"], (int, float)):
                        suggested = int(result["suggested_slide"])
                        if suggested != current + 1 and 1 <= suggested <= len(session.slides):
                            session.current_slide = suggested - 1
                            result["current_slide"] = suggested

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
