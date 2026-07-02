class PresentationManager {
  constructor() {
    this.slides = [];
    this.currentSlide = 0;
    this.totalSlides = 0;
    this.sessionId = null;
    this.analysis = null;
    this._onSlideChange = null;
  }

  onSlideChange(cb) { this._onSlideChange = cb; }

  load(data) {
    this.slides = data.slides;
    this.totalSlides = data.total_slides;
    this.sessionId = data.session_id;
    this.currentSlide = 0;
    this._renderSlideDots();
    this._showSlide(0);
  }

  setAnalysis(analysis) {
    this.analysis = analysis;
    this._renderKeyPointsTab();
    this._renderQATab();
  }

  setSlide(index) {
    if (index < 0 || index >= this.totalSlides) return;
    this.currentSlide = index;
    this._showSlide(index);
    this._renderSlideDots();
    this._renderKeyPointsTab();
    this._renderQATab();
    if (this._onSlideChange) this._onSlideChange(index);
  }

  nextSlide() { this.setSlide(this.currentSlide + 1); }
  prevSlide() { this.setSlide(this.currentSlide - 1); }

  _showSlide(index) {
    const slide = this.slides[index];
    document.getElementById("slide-number").textContent = `Diapositiva ${index + 1}`;
    document.getElementById("slide-indicator").textContent = `Diapositiva ${index + 1} / ${this.totalSlides}`;

    const body = document.getElementById("slide-body");
    if (slide && slide.content) {
      body.textContent = slide.content;
    } else {
      body.innerHTML = '<p class="placeholder">Esta diapositiva no tiene contenido textual.</p>';
    }
  }

  _renderSlideDots() {
    const container = document.getElementById("slide-selector");
    container.innerHTML = "";
    for (let i = 0; i < this.totalSlides; i++) {
      const dot = document.createElement("div");
      dot.className = `slide-dot${i === this.currentSlide ? " active" : ""}`;
      dot.textContent = i + 1;
      dot.addEventListener("click", () => this.setSlide(i));
      container.appendChild(dot);
    }
    const active = container.querySelector(".active");
    if (active) active.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }

  updateCurrentSlide(slideNum) {
    const idx = slideNum - 1;
    if (idx >= 0 && idx < this.totalSlides && idx !== this.currentSlide) {
      this.currentSlide = idx;
      this._showSlide(idx);
      this._renderSlideDots();
      this._renderKeyPointsTab();
    }
  }

  _renderKeyPointsTab() {
    const panel = document.getElementById("panel-keypoints");
    if (!this.analysis || !this.analysis.slides) {
      panel.innerHTML = '<p class="placeholder-sm">Sube una presentación para ver los puntos clave.</p>';
      return;
    }

    const slideAnalysis = this.analysis.slides.find(s => s.number === this.currentSlide + 1);
    if (!slideAnalysis || !slideAnalysis.key_points || slideAnalysis.key_points.length === 0) {
      panel.innerHTML = '<p class="placeholder-sm">No hay puntos clave para esta diapositiva.</p>';
      return;
    }

    let html = '<div class="kp-section"><div class="kp-section-title">🎯 Puntos clave de esta diapositiva</div><ul class="kp-list">';
    for (const kp of slideAnalysis.key_points) {
      html += `<li>${kp}</li>`;
    }
    html += '</ul></div>';
    panel.innerHTML = html;
  }

  _renderQATab() {
    const panel = document.getElementById("panel-qa");
    if (!this.analysis || !this.analysis.slides) {
      panel.innerHTML = '<p class="placeholder-sm">Sube una presentación para ver las preguntas preparadas.</p>';
      return;
    }

    const slideAnalysis = this.analysis.slides.find(s => s.number === this.currentSlide + 1);
    if (!slideAnalysis || !slideAnalysis.questions || slideAnalysis.questions.length === 0) {
      panel.innerHTML = '<p class="placeholder-sm">No hay preguntas preparadas para esta diapositiva.</p>';
      return;
    }

    let html = '<div class="kp-section"><div class="kp-section-title">❓ Preguntas que podrían hacer</div>';
    for (const qa of slideAnalysis.questions) {
      html += `<div class="qa-item"><div class="qa-q">${qa.q}</div><div class="qa-a">${qa.a}</div></div>`;
    }
    html += '</div>';
    panel.innerHTML = html;
  }
}
