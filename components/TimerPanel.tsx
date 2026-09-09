"use client";

import { useRef, useState } from "react";
import { Pencil, Square, Timer as TimerIcon } from "lucide-react";
import type { RunningTimer } from "@/components/todo/useTimer";
import { CATEGORY_LIST, CATEGORY_STYLE } from "@/components/todo/category";

// 三类计时快捷按钮，配色与汇总饼图共用一套
const CATEGORIES = CATEGORY_LIST.map((key) => ({ key, ...CATEGORY_STYLE[key] }));

// 自定义标题（如"养号"）用一套中性配色
const CUSTOM_STYLE = { bg: "#EEF2FF", border: "#C7D2FE", text: "#4F46E5", solid: "#4F46E5" };

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function hhmm(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function fmtElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(sec)}` : `${pad2(m)}:${pad2(sec)}`;
}

type Props = {
  running: RunningTimer | null;
  elapsedMs: number;
  onStart: (title: string) => void;
  onStop: () => void;
  onRename: (title: string, startedAt: number) => void;
};

export default function TimerPanel({ running, elapsedMs, onStart, onStop, onRename }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const editingRef = useRef(false);
  function saveName() {
    if (!editingRef.current || !running) return;
    editingRef.current = false;
    onRename(draft, running.startedAt);
    setEditing(false);
  }
  const style = running
    ? CATEGORIES.find((c) => c.key === running.title) ?? CUSTOM_STYLE
    : undefined;

  return (
    <div className="w-full flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <TimerIcon className="w-4 h-4 text-[var(--color-primary)]" />
        <span className="text-[var(--color-text-primary)] text-[16px] font-semibold">计时</span>
        <span className="text-[var(--color-text-tertiary)] text-[12px]">点类别或说「现在 X」，停止即记一笔</span>
      </div>

      {running && style ? (
        <div
          className="timer-running w-full flex items-center gap-3 px-4 py-3"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            {editing ? <input
              autoFocus
              aria-label="正在计时的事件名称"
              value={draft}
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={saveName}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing || event.keyCode === 229) return;
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.blur();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  editingRef.current = false;
                  setEditing(false);
                }
              }}
              className="w-full min-w-0 rounded-md border border-[var(--color-primary)] bg-[var(--color-bg-white)] px-1.5 py-0.5 text-[13px] font-semibold text-[var(--color-text-primary)] outline-none"
            /> : <button type="button"
              aria-label={`修改计时名称：${running.title}`}
              onClick={() => { setDraft(running.title); editingRef.current = true; setEditing(true); }}
              className="group flex min-w-0 items-center gap-1 rounded-md text-left text-[13px] font-semibold hover:bg-white/50 focus-visible:outline-[var(--color-primary)]"
              style={{ color: style.text }}
              data-full-text={`${running.title} · 点击改名`}
            >
              <span className="truncate">{running.title}</span>
              <Pencil className="h-3 w-3 shrink-0 opacity-50 group-hover:opacity-100" />
            </button>}
            <span className="text-[11px] text-[var(--color-text-tertiary)]">
              {editing ? "回车或点空白保存 · Esc 取消" : `从 ${hhmm(new Date(running.startedAt))} 开始`}
            </span>
          </div>
          <span
            className="shrink-0 text-center text-[24px] font-bold tabular-nums tracking-wide sm:text-[28px]"
            style={{ color: style.text }}
          >
            {fmtElapsed(elapsedMs)}
          </span>
          <button
            type="button"
            onClick={onStop}
            className="ui-press flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-[var(--color-primary)] text-white text-[14px] font-semibold flex-shrink-0"
          >
            <Square className="w-4 h-4" fill="currentColor" strokeWidth={0} />
            停止
          </button>
        </div>
      ) : (
        <div className="w-full flex gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => onStart(c.key)}
              className="timer-choice ui-press flex-1 flex items-center justify-center gap-2 py-3 text-[14px] font-medium text-[var(--color-text-primary)]"
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.solid }} />
              {c.key}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
