"use client";

import { useEffect, useState } from "react";
import type { ISODate } from "./types";

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` as ISODate;
}

export function parseISODate(iso: string): Date {
  // Parse as local date to avoid timezone shift.
  const [y, m, d] = iso.split("-").map((x) => Number(x));
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function startOfWeek(date: Date, weekStartsOnMonday = true): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0 Sun .. 6 Sat
  const shift = weekStartsOnMonday ? (day === 0 ? -6 : 1 - day) : -day;
  return addDays(d, shift);
}

export const CN_WEEKDAY: readonly string[] = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"] as const;

export function formatCNDateTitle(date: Date): string {
  // e.g. 2026年2月1日 · 周日
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 · ${CN_WEEKDAY[date.getDay()]}`;
}


/**
 * "今天"必须是活的。**别用 `useMemo(() => toISODate(new Date()), [])`**——
 * 依赖数组是空的，挂载时算一次就永远不变了。手机上 app 挂后台过一夜，
 * 顶上的「今天主线」还停在昨天，而周视图里每次渲染重算的"今天"已经跳到今天，
 * 两个"今天"当场对不上（真实踩过）。
 *
 * 一分钟查一次够了（只是比字符串，不重渲染），另外切回页面时立刻查一次——
 * 手机锁屏一夜再点开，靠定时器要等最多一分钟才对，切回来查是即时的。
 */
export function useToday(): ISODate {
  const [today, setToday] = useState<ISODate>(() => toISODate(new Date()));
  useEffect(() => {
    const check = () => {
      const now = toISODate(new Date());
      setToday((prev) => (prev === now ? prev : now));
    };
    const timer = setInterval(check, 60_000);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, []);
  return today;
}
