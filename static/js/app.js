(function() {
  const upload = new UploadManager();
  const speech = new SpeechManager();
  const pres = new PresentationManager();

  let ws = null;
  let wsReconnectTimer = null;
  let lastTranscriptSend = 0;
  let transcriptBuffer = "";
  let lastAdvice = null;

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

  // Init
  upload.init();
  speech.init();

  // ===== MAIN TAB SWITCHING =====
  document.querySelectorAll(".main-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".main-tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".main-panel").forEach(p => p.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById(`panel-${tab.dataset.panel}`).classList.add("active");
    });
  });

  // ===== SUBTAB SWITCHING (inside advice) =====
  document.querySelectorAll(".subtab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".subtab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".subpanel").forEach(p => p.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById(`sub-${tab.dataset.sub}`).classList.add("active");
    });
  });

  // ===== UPLOAD -> PRESENTATION =====
  upload.onSessionReady((data) => {
    pres.load(data);
    presTitle.textContent = data.title;

    uploadScreen.classList.remove("active");
    uploadScreen.classList.add("hidden");
    presScreen.classList.remove("hidden");
    presScreen.classList.add("active");

    resetAdvice();
    connectWebSocket(data.session_id);
    // Show slide panel by default
    document.querySelector('.main-tab[data-panel="slide"]').click();
  });

  // ===== ANALYSIS READY =====
  document.addEventListener("analysis-ready", (e) => {
    pres.setAnalysis(e.detail);
    const totalQ = e.detail.slides.reduce((sum, s) => sum + (s.questions || []).length, 0);
    if (totalQ > 0) {
      document.querySelector('.subtab[data-sub="qa"]').textContent = `❓ Q&A (${totalQ})`;
    }
    renderQASubPanel();
  });

  // ===== SPEECH =====
  speech.onTranscript(({ final, interim }) => {
    transcriptText.textContent = interim || final || "—";

    if (final) {
      transcriptBuffer += (transcriptBuffer ? " " : "") + final;
      const now = Date.now();
      // Send every 600ms for faster response
      if (now - lastTranscriptSend > 600 && transcriptBuffer.trim()) {
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
        statusText.textContent = "Escuchando";
        btnMic.classList.add("active");
        btnMicText.textContent = "Detener";
        break;
      case "stopped":
        statusText.textContent = "Detenido";
        btnMic.classList.remove("active");
        btnMicText.textContent = "Iniciar";
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
        statusText.textContent = "Error";
        btnMic.classList.remove("active");
        btnMicText.textContent = "Reintentar";
        break;
    }
  });

  btnMic.addEventListener("click", () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      statusText.textContent = "Conectando...";
      return;
    }
    speech.toggle();
  });

  // ===== SLIDE NAV =====
  document.getElementById("prev-slide").addEventListener("click", () => {
    pres.prevSlide();
    sendSlideChange();
    renderQASubPanel();
  });
  document.getElementById("next-slide").addEventListener("click", () => {
    pres.nextSlide();
    sendSlideChange();
    renderQASubPanel();
  });
  pres.onSlideChange(() => {
    sendSlideChange();
    renderQASubPanel();
  });

  // ===== BACK BUTTON =====
  document.getElementById("btn-back").addEventListener("click", () => {
    if (speech.listening) speech.stop();
    if (ws) { ws.close(); ws = null; }
    presScreen.classList.remove("active");
    presScreen.classList.add("hidden");
    uploadScreen.classList.remove("hidden");
    uploadScreen.classList.add("active");
  });

  // ===== WEBSOCKET =====
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
      btnMicText.textContent = "Iniciar";
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

  // ===== HANDLE MESSAGES =====
  function handleWsMessage(data) {
    if (data.type === "advice") {
      lastAdvice = data;
      pres.updateCurrentSlide(data.current_slide);

      const confidence = data.confidence || 0;
      confidenceFill.style.width = `${Math.round(confidence * 100)}%`;
      confidenceFill.className = "confidence-fill" +
        (confidence > 0.7 ? " high" : confidence > 0.4 ? " medium" : " low");
      confidenceBar.classList.add("visible");

      let style = data.is_question ? "question" : "good";
      let icon = data.is_question ? "❓" : "📖";

      let html = `${icon} ${data.advice}`;

      if (data.extra_info && data.extra_info.length > 0) {
        html += '<div class="key-points"><div class="key-points-title">📌 Información adicional</div>';
        for (const info of data.extra_info) {
          html += `<div class="key-point done" style="color:var(--text2)">${info}</div>`;
        }
        html += "</div>";
      }

      if (data.suggested_questions && data.suggested_questions.length > 0) {
        html += '<div class="key-points"><div class="key-points-title">❓ Posibles preguntas</div>';
        for (const q of data.suggested_questions) {
          html += `<div class="key-point missed">${q}</div>`;
        }
        html += "</div>";
      }

      if (data.is_question && data.qa_answer) {
        html += `<div class="key-points" style="margin-top:6px;padding-top:6px;border-top:1px solid var(--surface2)"><div class="key-points-title">💬 Respuesta sugerida</div><div style="font-size:13px;color:#c084fc;padding:4px 0">${data.qa_answer}</div></div>`;
      }

      addAdviceItem(html, style);
      updateSubPanels(data);

      // Auto-switch to advice tab when advice arrives
      const adviceTab = document.querySelector('.main-tab[data-panel="advice"]');
      if (!adviceTab.classList.contains("active")) {
        adviceTab.click();
      }

    } else if (data.type === "slide_changed") {
      pres.updateCurrentSlide(data.current_slide);
    } else if (data.type === "error") {
      addAdviceItem(`⚠️ ${data.message}`, "off-topic");
    }
  }

  function addAdviceItem(html, style) {
    const item = document.createElement("div");
    item.className = `advice-item ${style || ""}`;
    item.innerHTML = html;

    const welcome = adviceBody.querySelector(".advice-welcome");
    if (welcome) welcome.remove();

    adviceBody.insertBefore(item, adviceBody.firstChild);

    while (adviceBody.children.length > 10) {
      adviceBody.removeChild(adviceBody.lastChild);
    }
  }

  function updateSubPanels(data) {
    // Subpanel: Info
    const infoPanel = document.getElementById("sub-info");
    if (data.advice) {
      infoPanel.innerHTML = `<div class="kp-section"><div class="kp-section-title">📖 Info</div><div style="font-size:13px;color:var(--text2);line-height:1.6">${data.advice}</div></div>`;
    }

    // Subpanel: Extra
    const extraPanel = document.getElementById("sub-extra");
    let extraHtml = "";
    if (data.extra_info && data.extra_info.length > 0) {
      extraHtml += '<div class="kp-section"><div class="kp-section-title">➕ Datos adicionales</div><ul class="kp-list">';
      for (const info of data.extra_info) {
        extraHtml += `<li>${info}</li>`;
      }
      extraHtml += "</ul></div>";
    }
    if (data.suggested_questions && data.suggested_questions.length > 0) {
      extraHtml += '<div class="kp-section"><div class="kp-section-title">❓ Preguntas</div><ul class="kp-list">';
      for (const q of data.suggested_questions) {
        extraHtml += `<li style="color:var(--warning)">${q}</li>`;
      }
      extraHtml += "</ul></div>";
    }
    extraPanel.innerHTML = extraHtml || '<p class="placeholder-sm">Aquí aparecerán datos adicionales y preguntas.</p>';

    // Subpanel: Q&A
    const qaPanel = document.getElementById("sub-qa");
    if (data.is_question && data.qa_answer) {
      qaPanel.innerHTML = `<div class="kp-section"><div class="kp-section-title">💬 Respuesta</div><div style="font-size:13px;color:#c084fc;line-height:1.6">${data.qa_answer}</div></div>`;
    } else {
      // Show prepared Q&A
      renderQASubPanel();
    }
  }

  function renderQASubPanel() {
    const qaPanel = document.getElementById("sub-qa");
    const slideAnalysis = pres.analysis?.slides?.find(s => s.number === pres.currentSlide + 1);
    if (slideAnalysis?.questions?.length > 0) {
      let html = '<div class="kp-section"><div class="kp-section-title">❓ Q&A preparados</div>';
      for (const qa of slideAnalysis.questions) {
        html += `<div class="qa-item"><div class="qa-q">${qa.q}</div><div class="qa-a">${qa.a}</div></div>`;
      }
      html += "</div>";
      qaPanel.innerHTML = html;
    } else if (!qaPanel.innerHTML || qaPanel.innerHTML.includes("placeholder")) {
      qaPanel.innerHTML = '<p class="placeholder-sm">No hay Q&A preparados para esta diapositiva.</p>';
    }
  }

  function resetAdvice() {
    adviceBody.innerHTML = '<div class="advice-welcome"><p>Activa el micrófono para recibir información en tiempo real.</p></div>';
    ["sub-info", "sub-extra", "sub-qa"].forEach(id => {
      document.getElementById(id).innerHTML = '<p class="placeholder-sm">Esperando...</p>';
    });
    confidenceBar.classList.remove("visible");
    confidenceFill.style.width = "0%";
    lastAdvice = null;
  }

  function sendTranscript(text) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ action: "transcribe", text }));
    }
  }

  function sendSlideChange() {
    if (ws && ws.readyState === WebSocket.OPEN && pres.sessionId) {
      ws.send(JSON.stringify({ action: "set_slide", slide: pres.currentSlide + 1 }));
    }
  }
})();
