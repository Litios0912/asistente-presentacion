# Deploy en Railway (recomendado - gratis)

1. Crea cuenta en https://railway.com (con GitHub)
2. Instala CLI: `npm i -g @railway/cli`
3. En la carpeta del proyecto:
```bash
railway login
railway init
railway variables --set GROQ_API_KEY=gsk_tu_key_aqui
railway up
```
4. Railway te da una URL `https://tu-proyecto.up.railway.app`

# Deploy en Render

1. Crea cuenta en https://render.com
2. "New +" → "Web Service" → conecta tu repo de GitHub
3. Configura:
   - **Runtime**: Python 3
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host=0.0.0.0 --port=$PORT`
4. Añade variable de entorno: `GROQ_API_KEY`
5. Deploy

# Deploy en tu propio VPS

```bash
git clone <repo> && cd asistente-presentacion
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
export GROQ_API_KEY=gsk_tu_key_aqui
uvicorn main:app --host=0.0.0.0 --port=8000
```

Usa nginx como reverse proxy para HTTPS (necesario para Web Speech API y PWA).
