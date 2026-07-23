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
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: c,
          payload: { tasks: tasksRef.current, entries: entriesRef.current, updatedAt: Date.now() },
        }),
      });
      if (res.status === 501) return setStatus("not_configured");
      if (!res.ok) return setStatus("error");
      setStatus("synced");
      setLastSyncedAt(Date.now());
    } catch {
      setStatus("error");
    }
  }, []);

  // 拉取并应用云端数据（以云端为准）
  const pull = useCallback(
    async (): Promise<"has_data" | "empty" | "error" | "not_configured"> => {
      const c = codeRef.current;
      if (!c) return "error";
      try {
        const res = await fetch(`/api/sync?code=${encodeURIComponent(c)}`, { cache: "no-store" });
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
