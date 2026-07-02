class SpeechManager {
  constructor() {
    this.recognition = null;
    this.listening = false;
    this._onTranscript = null;
    this._onStateChange = null;
    this.supported = false;
    this.restartTimeout = null;
  }

  onTranscript(cb) { this._onTranscript = cb; }
  onStateChange(cb) { this._onStateChange = cb; }

  init() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      this.supported = false;
      this._onStateChange({ status: "unsupported" });
      return;
    }
    this.supported = true;
    this.recognition = new SpeechRecognition();
    this.recognition.lang = "es-MX";
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.maxAlternatives = 1;

    this.recognition.onresult = (event) => {
      let final = "";
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }
      if (this._onTranscript) {
        this._onTranscript({ final, interim });
      }
    };

    this.recognition.onerror = (event) => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      this._onStateChange({ status: "error", message: event.error });
      this.listening = false;
    };

    this.recognition.onend = () => {
      if (this.listening) {
        this.restartTimeout = setTimeout(() => {
          try { this.recognition.start(); } catch (e) {}
        }, 100);
      }
    };
  }

  start() {
    if (!this.recognition || this.listening) return;
    try {
      this.recognition.start();
      this.listening = true;
      this._onStateChange({ status: "listening" });
    } catch (e) {
      this._onStateChange({ status: "error", message: e.message });
    }
  }

  stop() {
    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }
    this.listening = false;
    try { this.recognition.stop(); } catch (e) {}
    this._onStateChange({ status: "stopped" });
  }

  toggle() {
    if (this.listening) this.stop();
    else this.start();
  }
}
