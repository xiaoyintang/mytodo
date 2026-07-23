"use client";

import { useState, useEffect } from "react";
import { Square, Timer as TimerIcon } from "lucide-react";
import type { ISODate, TimeEntry } from "@/components/todo/types";
import { toISODate } from "@/components/todo/date";
import { timeToMinutes } from "@/components/todo/time";

// 三类计时。颜色用于按钮和运行态。
const CATEGORIES = [
  { key: "正事", bg: "#EFF6FF", border: "#BFDBFE", text: "#2563EB", solid: "#2563EB" },
  { key: "娱乐", bg: "#FFF7ED", border: "#FED7AA", text: "#EA580C", solid: "#EA580C" },
  { key: "休息", bg: "#F0FDF4", border: "#BBF7D0", text: "#16A34A", solid: "#16A34A" },
] as const;

const RUN_KEY = "mytodo.timer.v1"; // { category, startedAt }

type Running = { category: string; startedAt: number };

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
  onAdd: (entry: Omit<TimeEntry, "id">) => void;
};

export default function TimerPanel({ onAdd }: Props) {
  const [running, setRunning] = useState<Running | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // 恢复正在进行的计时（刷新/重开不丢）
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(RUN_KEY);
      if (raw) setRunning(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  // 运行时每秒滴答
  useEffect(() => {
    if (!running) return;
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  function start(category: string) {
    if (running) return;
    const r: Running = { category, startedAt: Date.now() };
    setRunning(r);
    setNowMs(Date.now());
    try {
      window.localStorage.setItem(RUN_KEY, JSON.stringify(r));
    } catch {
      /* ignore */
    }
  }

  function stop() {
    if (!running) return;
    const startD = new Date(running.startedAt);
    const endD = new Date();
    const startTime = hhmm(startD);
    const endTime = hhmm(endD);
    // 时长按分钟差算，保证起止时间与时长一致；不足 1 分钟按 1 分钟
    let minutes = timeToMinutes(endTime) - timeToMinutes(startTime);
    if (minutes < 1) minutes = 1;
    onAdd({
      date: toISODate(endD) as ISODate,
      title: running.category,
      minutes,
      startTime,
      endTime,
    });
    setRunning(null);
    try {
      window.localStorage.removeItem(RUN_KEY);
    } catch {
      /* ignore */
    }
  }

  const activeCat = running ? CATEGORIES.find((c) => c.key === running.category) : undefined;

  return (
    <div className="w-full flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <TimerIcon className="w-4 h-4 text-[var(--color-primary)]" />
        <span className="text-[var(--color-text-primary)] text-[16px] font-semibold">计时</span>
        <span className="text-[var(--color-text-tertiary)] text-[12px]">点类别开始，停止即记一笔</span>
      </div>

      {running && activeCat ? (
        <div
          className="w-full flex items-center gap-3 px-4 py-3 rounded-[12px] border-2"
          style={{ backgroundColor: activeCat.bg, borderColor: activeCat.solid }}
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-[13px] font-semibold" style={{ color: activeCat.text }}>
              {activeCat.key}进行中
            </span>
            <span className="text-[11px] text-[var(--color-text-tertiary)]">
              从 {hhmm(new Date(running.startedAt))} 开始
            </span>
          </div>
          <span
            className="flex-1 text-center text-[28px] font-bold tabular-nums tracking-wide"
            style={{ color: activeCat.text }}
          >
            {fmtElapsed(nowMs - running.startedAt)}
          </span>
          <button
            type="button"
            onClick={stop}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-white text-[14px] font-semibold transition-opacity hover:opacity-90"
            style={{ backgroundColor: activeCat.solid }}
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
              onClick={() => start(c.key)}
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
