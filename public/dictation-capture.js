// A silent output keeps the node processing without playing the mic back.
class DictationCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(2048);
    this.used = 0;
    this.done = false;
    this.port.onmessage = () => {
      this.done = true;
      if (this.used) this.port.postMessage(this.buffer.slice(0, this.used));
      this.port.postMessage("stopped");
    };
  }
  process(inputs) {
    if (this.done) return false;
    const samples = inputs[0]?.[0];
    if (samples) for (const sample of samples) {
      this.buffer[this.used++] = sample;
      if (this.used === this.buffer.length) {
        this.port.postMessage(this.buffer, [this.buffer.buffer]);
        this.buffer = new Float32Array(2048);
        this.used = 0;
      }
    }
    return true;
  }
}
registerProcessor("dictation-capture", DictationCapture);
