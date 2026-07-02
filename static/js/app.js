(function() {
  const upload = new UploadManager();
  const speech = new SpeechManager();
  const pres = new PresentationManager();

  let ws = null;
  let wsReconnectTimer = null;
  let lastTranscriptSend = 0;
  let transcriptBuffer = "";

  // DOM refs
  const uploadScreen = document.getElementById("upload-screen");
  const presScreen = document.getElementById("presentation-screen");
  const presTitle = document.getElementById("pres-title");
  const statusDot = document.getElementById("status-dot");
  const statusText = document.getElementById("status-text");
  const btnMic = document.getElementById("btn-mic");
  const btnMicText = document.getElementById("btn-mic-text");
  const adviceBody = document.getElementById("advice-body");
  const transcriptText = document.getElementById("transcript-text");
  const confidenceBar = document.getElementById("confidence-bar");
  const confidenceFill = document.getElementById("confidence-fill");
  const toggleAdvice = document.getElementById("toggle-advice");
  const advicePanel = document.getElementById("advice-panel");

  // Init
  upload.init();
  speech.init();

  // Upload -> Presentation transition
  upload.onSessionReady((data) => {
    pres.load(data);
    presTitle.textContent = data.title;

    uploadScreen.classList.remove("active");
    uploadScreen.classList.add("hidden");
    presScreen.classList.remove("hidden");
    presScreen.classList.add("active");

    connectWebSocket(data.session_id);
  });

  // Speech events
  speech.onTranscript(({ final, interim }) => {
    const display = interim || final || "—";
    transcriptText.textContent = display;

    if (final) {
      transcriptBuffer += (transcriptBuffer ? " " : "") + final;
      const now = Date.now();
      if (now - lastTranscriptSend > 1500 && transcriptBuffer.trim()) {
        sendTranscript(transcriptBuffer.trim());
        transcriptBuffer = "";
        lastTranscriptSend = now;
      }
    }
  });

  speech.onStateChange(({ status, message }) => {
    statusDot.className = "status-dot";
    switch (status) {
      case "listening":
        statusDot.classList.add("listening");
        statusText.textContent = "Escuchando...";
        btnMic.classList.add("active");
        btnMicText.textContent = "Detener";
        break;
      case "stopped":
        statusText.textContent = "Detenido";
        btnMic.classList.remove("active");
        btnMicText.textContent = "Iniciar micrófono";
        break;
      case "unsupported":
        statusDot.classList.add("error");
        statusText.textContent = "No soportado";
        btnMic.disabled = true;
        btnMicText.textContent = "Micrófono no disponible";
        adviceBody.innerHTML = '<div class="advice-item off-topic">⚠️ Tu navegador no soporta reconocimiento de voz. Usa Chrome o Edge en un celular/PC.</div>';
        break;
      case "error":
        statusDot.classList.add("error");
        statusText.textContent = "Error: " + (message || "desconocido");
        btnMic.classList.remove("active");
        btnMicText.textContent = "Reintentar";
        break;
    }
  });

  // Mic button
  btnMic.addEventListener("click", () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      statusText.textContent = "Conectando...";
      return;
    }
    speech.toggle();
  });

  // Slide navigation
  document.getElementById("prev-slide").addEventListener("click", () => {
    pres.prevSlide();
    sendSlideChange();
  });
  document.getElementById("next-slide").addEventListener("click", () => {
    pres.nextSlide();
    sendSlideChange();
  });
  pres.onSlideChange(() => sendSlideChange());

  // WebSocket
  function connectWebSocket(sessionId) {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/ws/${sessionId}`;

    ws = new WebSocket(url);

    ws.onopen = () => {
      statusText.textContent = "Conectado";
      statusDot.className = "status-dot";
      const groqKey = localStorage.getItem("groq_key");
      if (groqKey) {
        ws.send(JSON.stringify({ action: "set_key", key: groqKey }));
      }
      if (speech.supported && !speech.listening) {
        adviceBody.innerHTML = '<div class="advice-item good">✅ Conexión establecida. Presiona el micrófono para comenzar.</div>';
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleWsMessage(data);
      } catch (e) {}
    };

    ws.onclose = () => {
      statusDot.className = "status-dot";
      statusText.textContent = "Desconectado";
      btnMic.classList.remove("active");
      btnMicText.textContent = "Iniciar micrófono";
      if (speech.listening) speech.stop();

      if (wsReconnectTimer) clearTimeout(wsReconnectTimer);
      wsReconnectTimer = setTimeout(() => {
        if (pres.sessionId) connectWebSocket(pres.sessionId);
      }, 3000);
    };

    ws.onerror = () => {
      statusText.textContent = "Error de conexión";
      statusDot.classList.add("error");
    };
  }

  function handleWsMessage(data) {
    if (data.type === "advice") {
      pres.updateCurrentSlide(data.current_slide);

      let adviceClass = "advice-item";
      if (data.off_topic) adviceClass += " off-topic";
      else if (data.slide_match) adviceClass += " good";

      const confidence = data.confidence || 0;
      confidenceFill.style.width = `${Math.round(confidence * 100)}%`;
      confidenceFill.className = "confidence-fill" +
        (confidence > 0.7 ? " high" : confidence > 0.4 ? " medium" : " low");
      confidenceBar.classList.add("visible");

      const item = document.createElement("div");
      item.className = adviceClass;

      let icon = "💡";
      if (data.off_topic) icon = "⚠️";
      else if (data.slide_match && confidence > 0.7) icon = "✅";
      item.innerHTML = `${icon} ${data.advice}`;

      const welcome = adviceBody.querySelector(".advice-welcome");
      if (welcome) welcome.remove();

      adviceBody.insertBefore(item, adviceBody.firstChild);

      while (adviceBody.children.length > 5) {
        adviceBody.removeChild(adviceBody.lastChild);
      }
    } else if (data.type === "slide_changed") {
      pres.updateCurrentSlide(data.current_slide);
    } else if (data.type === "error") {
      adviceBody.innerHTML = `<div class="advice-item off-topic">⚠️ ${data.message}</div>`;
    }
  }

  function sendTranscript(text) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ action: "transcribe", text }));
    }
  }

  function sendSlideChange() {
    if (ws && ws.readyState === WebSocket.OPEN && pres.sessionId) {
      ws.send(JSON.stringify({
        action: "set_slide",
        slide: pres.currentSlide + 1,
      }));
    }
  }

  // Toggle advice panel
  let adviceCollapsed = false;
  toggleAdvice.addEventListener("click", () => {
    adviceCollapsed = !adviceCollapsed;
    advicePanel.classList.toggle("collapsed", adviceCollapsed);
    toggleAdvice.textContent = adviceCollapsed ? "+" : "−";
  });

  // Back button
  document.getElementById("btn-back").addEventListener("click", () => {
    if (speech.listening) speech.stop();
    if (ws) { ws.close(); ws = null; }
    presScreen.classList.remove("active");
    presScreen.classList.add("hidden");
    uploadScreen.classList.remove("hidden");
    uploadScreen.classList.add("active");
  });
})();
