"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Task, TimeEntry } from "./types";

export type SyncStatus = "off" | "syncing" | "synced" | "error" | "not_configured";

const CODE_KEY = "mytodo.sync.code";

type Args = {
  hydrated: boolean;
  tasks: Task[];
  entries: TimeEntry[];
  setTasks: (t: Task[]) => void;
  setEntries: (e: TimeEntry[]) => void;
};

// 同步码云同步：
// - 设了码：进入页面拉云端（以云端为准替换本地），本地改动 800ms 防抖推送
// - 云端为空：把本地数据上传（首台设备）
// 不做实时推送，切换设备刷新即可拿到最新。
export function useCloudSync({ hydrated, tasks, entries, setTasks, setEntries }: Args) {
  const [code, setCodeState] = useState("");
  const [status, setStatus] = useState<SyncStatus>("off");
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

  const codeRef = useRef(code);
  codeRef.current = code;
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const pulledRef = useRef(false);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 读取已保存的同步码
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(CODE_KEY);
      if (saved) setCodeState(saved);
    } catch {
      /* ignore */
    }
  }, []);

  const setCode = useCallback((c: string) => {
    setCodeState(c);
    try {
      if (c) window.localStorage.setItem(CODE_KEY, c);
      else window.localStorage.removeItem(CODE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const push = useCallback(async () => {
    const c = codeRef.current;
    if (!c) return;
    setStatus("syncing");
    const body = JSON.stringify({
      code: c,
      payload: { tasks: tasksRef.current, entries: entriesRef.current, updatedAt: Date.now() },
    });
    // 10 秒超时 + 失败重试两次，抗 VPN 抖动（避免一次抽风就同步失败）
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10000);
        const res = await fetch("/api/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (res.status === 501) return setStatus("not_configured");
        if (res.ok) {
          setStatus("synced");
          setLastSyncedAt(Date.now());
          return;
        }
      } catch {
        // 超时/网络中断 → 重试
      }
    }
    setStatus("error");
  }, []);

  // 拉取并应用云端数据（以云端为准）
  const pull = useCallback(
    async (): Promise<"has_data" | "empty" | "error" | "not_configured"> => {
      const c = codeRef.current;
      if (!c) return "error";
      // 记录拉取前的本地数据引用，用于检测"拉取期间用户改了本地"
      const t0 = tasksRef.current;
      const e0 = entriesRef.current;
      try {
        // 10 秒超时 + 失败重试两次，抗 VPN 抖动
        let res: Response | null = null;
        for (let attempt = 0; attempt < 3 && !res; attempt++) {
          try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 10000);
            const r = await fetch(`/api/sync?code=${encodeURIComponent(c)}`, {
              cache: "no-store",
              signal: controller.signal,
            });
            clearTimeout(timer);
            res = r;
          } catch {
            // 超时/网络中断 → 重试
          }
        }
        if (!res) {
          setStatus("error");
          return "error";
        }
        if (res.status === 501) {
          setStatus("not_configured");
          return "not_configured";
        }
        if (!res.ok) {
          setStatus("error");
          return "error";
        }
        const json = await res.json();
        const data = json?.data;
        // 拉取期间用户改动过本地（如刚停止计时新增一条）→ 不要用云端覆盖，
        // 保住本地改动，交给防抖推送同步上去（否则会把刚加的记录冲掉）
        if (tasksRef.current !== t0 || entriesRef.current !== e0) {
          setStatus("synced");
          setLastSyncedAt(Date.now());
          return "has_data";
        }
        if (data && (Array.isArray(data.tasks) || Array.isArray(data.entries))) {
          setTasks(Array.isArray(data.tasks) ? data.tasks : []);
          setEntries(Array.isArray(data.entries) ? data.entries : []);
          setStatus("synced");
          setLastSyncedAt(Date.now());
          return "has_data";
        }
        return "empty";
      } catch {
        setStatus("error");
        return "error";
      }
    },
    [setTasks, setEntries],
  );

  // 进入页面时初始拉取
  useEffect(() => {
    if (!hydrated) return;
    if (!code) {
      setStatus("off");
      pulledRef.current = false;
      return;
    }
    let cancelled = false;
    pulledRef.current = false;
    setStatus("syncing");
    (async () => {
      const result = await pull();
      if (cancelled) return;
      pulledRef.current = true;
      if (result === "empty") await push(); // 云端空 → 上传本地
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, hydrated]);

  // 本地改动防抖推送
  useEffect(() => {
    if (!hydrated || !code || !pulledRef.current) return;
    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => void push(), 800);
    return () => {
      if (pushTimer.current) clearTimeout(pushTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, entries]);

  // 切回页面自动同步：离开时把本地改动推上去，回来时拉最新
  // （比如刚用 Siri / 快捷指令记了一笔，切回 app 就能看到，不用退出重进）
  useEffect(() => {
    if (!hydrated || !code) return;
    function onVisibility() {
      if (!pulledRef.current) return;
      if (document.visibilityState === "hidden") {
        void push(); // 离开前先冲一次，避免丢本地改动
      } else {
        void pull(); // 回来拉云端最新
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [hydrated, code, push, pull]);

  const refresh = useCallback(async () => {
    setStatus("syncing");
    await pull();
  }, [pull]);

  return { code, setCode, status, lastSyncedAt, refresh, disconnect: () => setCode("") };
}
