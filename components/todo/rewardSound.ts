// 只在用户手势中解锁音频；不请求系统通知权限，也不承诺锁屏提醒。
let context: AudioContext | undefined;
export function unlockRewardSound() {
  try {
    context ??= new AudioContext();
    void context.resume().catch(() => {});
  } catch { /* 浏览器不支持时保留视觉提示 */ }
}

export function playRewardSound() {
  if (!context || context.state !== "running") return;
  try {
    const oscillator = context.createOscillator(), gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(660, context.currentTime);
    gain.gain.setValueAtTime(0, context.currentTime);
    gain.gain.linearRampToValueAtTime(0.12, context.currentTime + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.45);
    oscillator.connect(gain); gain.connect(context.destination);
    oscillator.start(); oscillator.stop(context.currentTime + 0.5);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  } catch { /* 声音失败不影响计时 */ }
}
