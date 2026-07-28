"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ISODate, TimeEntry } from "./types";
import { toISODate } from "./date";

// 正在进行的计时（跨刷新/重开持久化）。历史上字段名是 category，这里兼容读取。
const RUN_KEY = "mytodo.timer.v1";

export type RunningTimer = { title: string; startedAt: number };

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
function hhmm(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * 计时状态管理。支持任意标题（三类按钮传 "正事/娱乐/休息"，自然语言传 "养号" 等）。
 * 停止时按真实毫秒差算时长（跨午夜/超长都正确），标题即记录标题，无需事后改名。
 */
export function useTimer(onRecord: (entry: Omit<TimeEntry, "id">) => void) {
  const [running, setRunning] = useState<RunningTimer | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  // 用 ref 存回调，让 start/stop 保持稳定，不随父组件每次渲染重建
  const onRecordRef = useRef(onRecord);
  onRecordRef.current = onRecord;

  // 恢复正在进行的计时（兼容旧字段 category）
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(RUN_KEY);
      if (!raw) return;
      const p = JSON.parse(raw) as { title?: string; category?: string; startedAt?: number };
      const title = p.title ?? p.category;
      if (title && typeof p.startedAt === "number") {
        setRunning({ title, startedAt: p.startedAt });
      }
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

  const start = useCallback((title: string) => {
    const t = title.trim();
    if (!t) return;
    setRunning((cur) => {
      if (cur) return cur; // 已在计时，不覆盖
      const r: RunningTimer = { title: t, startedAt: Date.now() };
      try {
        window.localStorage.setItem(RUN_KEY, JSON.stringify(r));
      } catch {
        /* ignore */
      }
      return r;
    });
    setNowMs(Date.now());
  }, []);

  const stop = useCallback(() => {
    setRunning((cur) => {
      if (!cur) return null;
      const startD = new Date(cur.startedAt);
      const endD = new Date();
      let minutes = Math.round((endD.getTime() - startD.getTime()) / 60000);
      if (minutes < 1) minutes = 1; // 不足 1 分钟按 1 分钟
      onRecordRef.current({
        date: toISODate(endD) as ISODate,
        title: cur.title,
        minutes,
        startTime: hhmm(startD),
        endTime: hhmm(endD),
      });
      try {
        window.localStorage.removeItem(RUN_KEY);
      } catch {
        /* ignore */
      }
      return null;
    });
  }, []);

  const elapsedMs = running ? nowMs - running.startedAt : 0;
  return { running, elapsedMs, start, stop };
}
