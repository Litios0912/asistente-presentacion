class PresentationManager {
  constructor() {
    this.slides = [];
    this.currentSlide = 0;
    this.totalSlides = 0;
    this.sessionId = null;
    this._onSlideChange = null;
    this._onAdvice = null;
  }

  onSlideChange(cb) { this._onSlideChange = cb; }
  onAdvice(cb) { this._onAdvice = cb; }

  load(data) {
    this.slides = data.slides;
    this.totalSlides = data.total_slides;
    this.sessionId = data.session_id;
    this.currentSlide = 0;
    this._renderSlideDots();
    this._showSlide(0);
  }

  setSlide(index) {
    if (index < 0 || index >= this.totalSlides) return;
    this.currentSlide = index;
    this._showSlide(index);
    this._renderSlideDots();
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
    }
  }

  addAdvice(data) {
    if (this._onAdvice) this._onAdvice(data);
  }
}
