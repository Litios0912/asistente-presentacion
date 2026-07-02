class UploadManager {
  constructor() {
    this.zone = document.getElementById("upload-zone");
    this.input = document.getElementById("file-input");
    this.status = document.getElementById("upload-status");
    this.groqModal = document.getElementById("groq-modal");
    this.groqInput = document.getElementById("groq-key-input");
    this.setupGroq = document.getElementById("setup-groq");
    this._onSessionReady = null;
  }

  onSessionReady(cb) { this._onSessionReady = cb; }

  init() {
    this.zone.addEventListener("click", () => this.input.click());
    this.zone.addEventListener("dragover", (e) => {
      e.preventDefault();
      this.zone.classList.add("dragover");
    });
    this.zone.addEventListener("dragleave", () => this.zone.classList.remove("dragover"));
    this.zone.addEventListener("drop", (e) => {
      e.preventDefault();
      this.zone.classList.remove("dragover");
      const file = e.dataTransfer.files[0];
      if (file) this.upload(file);
    });
    this.input.addEventListener("change", () => {
      if (this.input.files[0]) this.upload(this.input.files[0]);
    });

    document.getElementById("show-groq-form").addEventListener("click", () => {
      this.groqModal.classList.remove("hidden");
    });
    document.getElementById("cancel-groq").addEventListener("click", () => {
      this.groqModal.classList.add("hidden");
    });
    document.getElementById("save-groq").addEventListener("click", () => {
      const key = this.groqInput.value.trim();
      if (key) {
        localStorage.setItem("groq_key", key);
        this.groqModal.classList.add("hidden");
        this.setupGroq.classList.add("hidden");
      }
    });

    if (localStorage.getItem("groq_key")) {
      this.setupGroq.classList.add("hidden");
    }
  }

  async upload(file) {
    const ext = file.name.split(".").pop().toLowerCase();
    if (!["pdf", "pptx"].includes(ext)) {
      this._showStatus("Solo archivos PDF o PPTX", "error");
      return;
    }

    this._showStatus("Subiendo presentación...", "loading");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (data.error) {
        this._showStatus(data.error, "error");
        return;
      }
      this._showStatus(`"${data.title}" cargada (${data.total_slides} diapositivas)`, "success");
      if (this._onSessionReady) this._onSessionReady(data);
    } catch (err) {
      this._showStatus("Error de conexión con el servidor", "error");
    }
  }

  _showStatus(msg, type) {
    this.status.textContent = msg;
    this.status.className = type;
    this.status.classList.remove("hidden");
    if (type === "success") {
      setTimeout(() => {
        this.status.classList.add("hidden");
      }, 3000);
    }
  }
}
