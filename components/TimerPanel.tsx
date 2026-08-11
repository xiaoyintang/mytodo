"use client";

import { Square, Timer as TimerIcon } from "lucide-react";
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
};

export default function TimerPanel({ running, elapsedMs, onStart, onStop }: Props) {
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
          className="w-full flex items-center gap-3 px-4 py-3 rounded-[12px] border-2"
          style={{ backgroundColor: style.bg, borderColor: style.solid }}
        >
          <div className="flex flex-col gap-0.5 min-w-0">
            <span
              className="truncate text-[13px] font-semibold"
              style={{ color: style.text }}
              data-full-text={`${running.title} 进行中`}
            >
              {running.title} 进行中
            </span>
            <span className="text-[11px] text-[var(--color-text-tertiary)]">
              从 {hhmm(new Date(running.startedAt))} 开始
            </span>
          </div>
          <span
            className="flex-1 text-center text-[28px] font-bold tabular-nums tracking-wide"
            style={{ color: style.text }}
          >
            {fmtElapsed(elapsedMs)}
          </span>
          <button
            type="button"
            onClick={onStop}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-white text-[14px] font-semibold transition-opacity hover:opacity-90 flex-shrink-0"
            style={{ backgroundColor: style.solid }}
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
              className="flex-1 flex items-center justify-center py-3 rounded-[12px] border-[1.5px] text-[15px] font-semibold transition-colors"
              style={{ backgroundColor: c.bg, borderColor: c.border, color: c.text }}
            >
              {c.key}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
