export type SpeechPhase = "permission" | "listening" | "ready" | "finishing";
type Events = {
  phase: (state: SpeechPhase) => void;
  elapsed: (seconds: number) => void;
  end: (words: string, notice: string) => void;
};
const rate = 16000;
function toWav(frames: Float32Array[]) {
  const samples = new Float32Array(frames.reduce((sum, frame) => sum + frame.length, 0));
  let offset = 0;
  for (const frame of frames) { samples.set(frame, offset); offset += frame.length; }
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const tag = (at: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(at + i, text.charCodeAt(i));
  };
  tag(0, "RIFF"); view.setUint32(4, buffer.byteLength - 8, true); tag(8, "WAVE");
  tag(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, 16000, true); view.setUint32(28, 32000, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); tag(36, "data");
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((v, i) => view.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, Math.round(v * 32768))), true));
  return new Blob([buffer], { type: "audio/wav" });
}

export function dictate(events: Events) {
  let closed = false, stopping = false, finalizing = false;
  let stream: MediaStream | undefined, context: AudioContext | undefined, node: AudioWorkletNode | undefined;
  const frames: Float32Array[] = [], finalRequest = new AbortController();
  let count = 0, seconds = 0, submit = false, ready = false;
  let limit: ReturnType<typeof setTimeout> | undefined;
  let drain: ReturnType<typeof setTimeout> | undefined;
  function releaseMic() {
    clearTimeout(limit); clearTimeout(drain);
    if (node) { node.port.onmessage = null; node.disconnect(); node = undefined; }
    stream?.getTracks().forEach(t => t.stop());
    stream = undefined;
    if (context && context.state !== "closed") void context.close().catch(() => {});
    context = undefined;
  }
  function cancel() {
    if (closed) return;
    closed = true; finalRequest.abort();
    releaseMic(); frames.length = 0;
    window.removeEventListener("pagehide", cancel);
  }
  function end(text = "", message = "") {
    if (!closed) { cancel(); events.end(text, message); }
  }
  async function recognize(audio: Float32Array[], signal: AbortSignal) {
    const response = await fetch("/api/task-dictation", { method: "POST", body: toWav(audio), signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "转写失败，请重试。");
    return String(data.text ?? "").trim();
  }
  async function finish() {
    if (closed || finalizing) return;
    finalizing = true;
    if (!count) { end("", "没有录到声音，请再试一次。"); return; }
    try {
      const text = await recognize(frames, finalRequest.signal);
      end(text, text ? "" : "没有听清，可以再说一次。");
    } catch (e) {
      end("", e instanceof Error ? e.message : "转写失败，请再试一次。");
    }
  }
  function drained() {
    if (closed || ready || finalizing) return;
    releaseMic();
    if (submit) void finish();
    else { ready = true; events.phase("ready"); }
  }
  function halt() {
    if (closed || stopping || !node) return;
    stopping = true; clearTimeout(limit);
    node.port.postMessage("stop");
    drain = setTimeout(drained, 300);
  }
  function stop() {
    if (closed || submit) return;
    if (!ready && !node) { end(); return; }
    submit = true; events.phase("finishing");
    if (ready) void finish(); else halt();
  }
  async function start() {
    try {
      events.phase("permission");
      if (!navigator.mediaDevices?.getUserMedia || typeof AudioWorkletNode === "undefined") {
        end("", "当前页面无法录音，请用 Chrome 或 Safari 在 localhost 或 HTTPS 下打开。"); return;
      }
      context = new AudioContext({ sampleRate: rate });
      const resume = context.resume();
      await Promise.all([resume, context.audioWorklet.addModule("/dictation-capture.js")]);
      if (closed) return;
      const mic = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 }, video: false });
      if (closed) { mic.getTracks().forEach(t => t.stop()); return; }
      stream = mic;
      node = new AudioWorkletNode(context, "dictation-capture");
      node.port.onmessage = ({ data }: MessageEvent<Float32Array | "stopped">) => {
        if (closed || finalizing) return;
        if (data === "stopped") { drained(); return; }
        const left = 60 * rate - count;
        const frame = data.length > left ? data.subarray(0, left) : data;
        if (frame.length) { frames.push(frame); count += frame.length; }
        const elapsed = Math.floor(count / rate);
        if (elapsed !== seconds) { seconds = elapsed; events.elapsed(seconds); }
        if (count >= 60 * rate) halt();
      };
      node.onprocessorerror = halt;
      context.createMediaStreamSource(mic).connect(node); node.connect(context.destination);
      mic.getAudioTracks()[0]?.addEventListener("ended", halt, { once: true });
      events.phase("listening"); limit = setTimeout(halt, 60000);
    } catch (e) {
      end("", e instanceof DOMException && e.name === "NotAllowedError"
        ? "请在浏览器地址栏允许麦克风权限，然后重试。" : "无法开始录音，请检查麦克风。");
    }
  }
  window.addEventListener("pagehide", cancel);
  void start();
  return { stop, cancel };
}
