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
  const qaBadge = document.getElementById("qa-badge");

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

    resetAdvice();
    connectWebSocket(data.session_id);
  });

  // Analysis ready (from upload auto-analyze)
  document.addEventListener("analysis-ready", (e) => {
    pres.setAnalysis(e.detail);
    const totalQ = e.detail.slides.reduce((sum, s) => sum + (s.questions || []).length, 0);
    if (totalQ > 0) {
      qaBadge.textContent = `❓${totalQ}`;
    }
    // Show key points tab content
    renderKeyPointsOnSlide();
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
        addAdviceItem("⚠️ Tu navegador no soporta reconocimiento de voz. Usa Chrome o Edge.", "off-topic");
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
    renderKeyPointsOnSlide();
  });
  document.getElementById("next-slide").addEventListener("click", () => {
    pres.nextSlide();
    sendSlideChange();
    renderKeyPointsOnSlide();
  });
  pres.onSlideChange(() => {
    sendSlideChange();
    renderKeyPointsOnSlide();
  });

  // Tab switching
  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
      tab.classList.add("active");
      const panel = document.getElementById(`panel-${tab.dataset.tab}`);
      if (panel) panel.classList.add("active");
    });
  });

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
        addAdviceItem("✅ Conexión establecida. Presiona el micrófono para comenzar.", "good");
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

      const confidence = data.confidence || 0;
      confidenceFill.style.width = `${Math.round(confidence * 100)}%`;
      confidenceFill.className = "confidence-fill" +
        (confidence > 0.7 ? " high" : confidence > 0.4 ? " medium" : " low");
      confidenceBar.classList.add("visible");

      let style = "good";
      if (data.is_question) style = "question";

      let icon = "📖";
      if (data.is_question) icon = "❓";

      let adviceText = `${icon} ${data.advice}`;

      // Extra info
      if (data.extra_info && data.extra_info.length > 0) {
        adviceText += '<div class="key-points"><div class="key-points-title">📌 Más información:</div>';
        for (const info of data.extra_info) {
          adviceText += `<div class="key-point done" style="color:var(--text2)">${info}</div>`;
        }
        adviceText += "</div>";
      }

      // Suggested questions
      if (data.suggested_questions && data.suggested_questions.length > 0) {
        adviceText += '<div class="key-points"><div class="key-points-title">❓ Posibles preguntas:</div>';
        for (const q of data.suggested_questions) {
          adviceText += `<div class="key-point missed">${q}</div>`;
        }
        adviceText += "</div>";
      }

      // Q&A answer
      if (data.is_question && data.qa_answer) {
        adviceText += `<div class="advice-item qa-answer" style="margin-top:6px">${data.qa_answer}</div>`;
        qaBadge.textContent = "💬";
      }

      addAdviceItem(adviceText, style);
      updateCoachingTab(data);

    } else if (data.type === "slide_changed") {
      pres.updateCurrentSlide(data.current_slide);
    } else if (data.type === "error") {
      addAdviceItem(`⚠️ ${data.message}`, "off-topic");
    } else if (data.type === "search_results") {
      addAdviceItem(`🔍 Resultados de búsqueda para "${data.query}":<br>${data.results.slice(0,3).map(r => `• ${r}`).join("<br>")}`, "good");
    }
  }

  function addAdviceItem(html, style) {
    const item = document.createElement("div");
    item.className = `advice-item ${style || ""}`;
    item.innerHTML = html;

    const welcome = adviceBody.querySelector(".advice-welcome");
    if (welcome) welcome.remove();

    adviceBody.insertBefore(item, adviceBody.firstChild);

    while (adviceBody.children.length > 8) {
      adviceBody.removeChild(adviceBody.lastChild);
    }
  }

  function updateCoachingTab(data) {
    const panel = document.getElementById("panel-coaching");
    let html = "";

    if (data.extra_info && data.extra_info.length > 0) {
      html += '<div class="kp-section"><div class="kp-section-title">📌 Información adicional</div><ul class="kp-list">';
      for (const info of data.extra_info) {
        html += `<li>${info}</li>`;
      }
      html += "</ul></div>";
    }

    if (data.suggested_questions && data.suggested_questions.length > 0) {
      html += '<div class="kp-section"><div class="kp-section-title">❓ Posibles preguntas</div><ul class="kp-list">';
      for (const q of data.suggested_questions) {
        html += `<li style="color:var(--warning)">${q}</li>`;
      }
      html += "</ul></div>";
    }

    if (data.is_question && data.qa_answer) {
      html += `<div class="kp-section"><div class="kp-section-title">💬 Respuesta sugerida</div><div style="font-size:13px;color:var(--text2);padding:0 8px">${data.qa_answer}</div></div>`;
    }

    if (!html) {
      html = '<p class="placeholder-sm">Habla para recibir información enriquecida sobre el tema.</p>';
    }

    panel.innerHTML = html;
  }

  function renderKeyPointsOnSlide() {
    pres._renderKeyPointsTab();
    pres._renderQATab();
  }

  function resetAdvice() {
    adviceBody.innerHTML = '<div class="advice-welcome"><p>Activa el micrófono y comienza a hablar.</p></div>';
    document.getElementById("panel-coaching").innerHTML = '<p class="placeholder-sm">Esperando datos del coach...</p>';
    confidenceBar.classList.remove("visible");
    confidenceFill.style.width = "0%";
    qaBadge.textContent = "❓";
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

  // Toggle advice panel (collapse/expand)
  let adviceCollapsed = false;
  document.getElementById("toggle-advice").addEventListener("click", () => {
    adviceCollapsed = !adviceCollapsed;
    document.querySelector(".advice-tabs").classList.toggle("hidden", adviceCollapsed);
    document.querySelector(".advice-tab-content").classList.toggle("hidden", adviceCollapsed);
    document.getElementById("toggle-advice").textContent = adviceCollapsed ? "+" : "−";
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
