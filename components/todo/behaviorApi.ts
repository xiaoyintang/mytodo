"use client";

import type { BehaviorType } from "./types";

/** 习惯实验室的 AI 调用（判定 / 魔法棒 / 改小共用） */
export async function callBehaviorAPI(
  body: Record<string, unknown>,
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; noKey: boolean }> {
  try {
    const controller = new AbortController();
    // 开思考的重判最慢（6 条约 18 秒），留足余量
    const timer = setTimeout(() => controller.abort(), 45000);
    const res = await fetch("/api/behavior", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.status === 501) return { ok: false, noKey: true };
    if (!res.ok) return { ok: false, noKey: false };
    return { ok: true, data: await res.json() };
  } catch {
    return { ok: false, noKey: false };
  }
}

export type PendingItem = { text: string; type: BehaviorType; checked: boolean };

export function toPendingItems(raw: unknown): PendingItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((b) => {
    const o = b as { text?: string; type?: BehaviorType };
    return { text: String(o.text ?? ""), type: (o.type ?? "habit") as BehaviorType, checked: true };
  });
}
