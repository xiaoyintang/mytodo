"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ISODate, TimeEntry } from "./types";
import { toISODate } from "./date";

// 正在进行的计时（跨刷新/重开持久化，并跟着云同步跨设备）。
// 历史上字段名是 category，这里兼容读取。
const RUN_KEY = "mytodo.timer.v1";

export type RunningTimer = { title: string; startedAt: number };

/**
 * 计时状态。带 updatedAt 是为了跨设备合并时能分清
 * "我刚停了还没传上去" 和 "别的设备刚开始还没拉下来"——
 * 光看 running 是不是 null 分不出来，谁的时间戳新听谁的。
 */
export type TimerState = { running: RunningTimer | null; updatedAt: number };

const EMPTY: TimerState = { running: null, updatedAt: 0 };

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
function hhmm(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function read(): TimerState {
  try {
    const raw = window.localStorage.getItem(RUN_KEY);
    if (!raw) return EMPTY;
    const p = JSON.parse(raw) as Record<string, unknown>;
    // 新格式 { running, updatedAt }
    if ("updatedAt" in p) {
      const r = p.running as { title?: string; startedAt?: number } | null;
      const running =
        r && typeof r.startedAt === "number" && r.title ? { title: r.title, startedAt: r.startedAt } : null;
      return { running, updatedAt: Number(p.updatedAt) || 0 };
    }
    // 旧格式：直接存的 RunningTimer（还可能是更早的 category 字段）
    const title = (p.title ?? p.category) as string | undefined;
    const startedAt = p.startedAt as number | undefined;
    if (title && typeof startedAt === "number") {
      return { running: { title, startedAt }, updatedAt: startedAt };
    }
    return EMPTY;
  } catch {
    return EMPTY;
  }
}

function write(state: TimerState) {
  try {
    window.localStorage.setItem(RUN_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

/**
 * 计时状态管理。支持任意标题（三类按钮传 "正事/娱乐/休息"，自然语言传 "养号" 等）。
 * 停止时按真实毫秒差算时长（跨午夜/超长都正确），标题即记录标题，无需事后改名。
 */
export function useTimer(onRecord: (entry: Omit<TimeEntry, "id">) => void) {
  const [state, setState] = useState<TimerState>(EMPTY);
  const [nowMs, setNowMs] = useState(() => Date.now());
  // 用 ref 存回调，让 start/stop 保持稳定，不随父组件每次渲染重建
  const onRecordRef = useRef(onRecord);
  onRecordRef.current = onRecord;
  // 也用 ref 跟一份当前状态：**副作用绝不能写在 setState 的更新函数里**——
  // 严格模式会把更新函数跑两次，记一笔就会重复。
  const stateRef = useRef(state);
  stateRef.current = state;

  function commit(next: TimerState) {
    stateRef.current = next;
    write(next);
    setState(next);
  }
  const commitRef = useRef(commit);
  commitRef.current = commit;

  // 恢复正在进行的计时
  useEffect(() => {
    const saved = read();
    stateRef.current = saved;
    setState(saved);
  }, []);

  // 运行时每秒滴答
  useEffect(() => {
    if (!state.running) return;
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [state.running]);

  const start = useCallback((title: string) => {
    const t = title.trim();
    if (!t) return;
    if (stateRef.current.running) return; // 已在计时，不覆盖
    const now = Date.now();
    commitRef.current({ running: { title: t, startedAt: now }, updatedAt: now });
    setNowMs(now);
  }, []);

  const stop = useCallback(() => {
    const cur = stateRef.current;
    if (!cur.running) return;
    const startD = new Date(cur.running.startedAt);
    const endD = new Date();
    let minutes = Math.round((endD.getTime() - startD.getTime()) / 60000);
    if (minutes < 1) minutes = 1; // 不足 1 分钟按 1 分钟
    // 先落状态再记一笔：记录本身在更新函数外面，严格模式双跑也只会记一次
    commitRef.current({ running: null, updatedAt: endD.getTime() });
    onRecordRef.current({
      date: toISODate(endD) as ISODate,
      title: cur.running.title,
      minutes,
      startTime: hhmm(startD),
      endTime: hhmm(endD),
    });
  }, []);

  /**
   * 云同步用：直接采纳别的设备的计时状态。
   * **不会记一笔**——那笔记录是在按下停止的那台设备上产生的，会自己同步过来，
   * 这里再记一次就重复了。
   */
  const adopt = useCallback((next: TimerState) => {
    if (next.updatedAt <= stateRef.current.updatedAt) return; // 不比本地新，忽略
    commitRef.current(next);
    setNowMs(Date.now());
  }, []);

  const elapsedMs = state.running ? nowMs - state.running.startedAt : 0;
  return { running: state.running, elapsedMs, start, stop, state, adopt };
}
