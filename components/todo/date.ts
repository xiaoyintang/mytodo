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

