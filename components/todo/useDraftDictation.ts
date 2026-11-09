import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { dictate, type SpeechPhase } from "@/components/todo/cloudDictation";

// Speech is an input method only. Parsing, saving and timer commands stay with the caller.
export function useDraftDictation(date: string, setInput: Dispatch<SetStateAction<string>>) {
  const session = useRef<ReturnType<typeof dictate> | null>(null);
  const [phase, setPhase] = useState<SpeechPhase | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    setPhase(null); setNotice("");
    return () => { session.current?.cancel(); session.current = null; };
  }, [date]);
  function discard() {
    session.current?.cancel(); session.current = null; setPhase(null);
  }
  function toggle(onStart: () => void) {
    if (session.current && phase) { session.current.stop(); return; }
    onStart(); setNotice(""); setSeconds(0);
    session.current = dictate({
      phase: setPhase, elapsed: setSeconds,
      end: (text, message) => {
        if (text) setInput(old => [old, text].filter(Boolean).join("\n"));
        setPhase(null); setNotice(message); session.current = null;
      },
    });
  }
  const help = phase === "permission" ? "请允许使用麦克风" : phase === "listening"
    ? `正在录音 · ${seconds} 秒 / 60 秒`
    : phase === "ready" ? "录音已停止，尚未发送。" : phase === "finishing" ? "正在转写…" : notice || "点「说完了」后才发给硅基流动转写。";
  return { phase, toggle, discard, help,
    label: phase === "listening" ? "说完了" : phase === "ready" ? "转写录音" : phase === "finishing" ? "转写中…" : phase ? "取消" : "云端听写",
    aria: phase === "permission" ? "取消听写" : phase === "ready" ? "转写录音" : phase ? "结束听写" : "开始云端听写" };
}
