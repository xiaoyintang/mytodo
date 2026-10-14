"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Aspiration, BehaviorCard, DayPlan, GoalResult, Habit, HabitLog, Task, TaskTemplate, TimeEntry } from "./types";
import type { TimerState } from "./useTimer";
import { equalSync, mergeSync, type SyncChoices, type SyncConflict, type SyncDocument } from "./syncMerge";

export type SyncStatus = "off" | "syncing" | "synced" | "conflict" | "error" | "not_configured";
const CODE_KEY = "mytodo.sync.code";
const DIRTY_KEY = "mytodo.sync.dirty";
const BASE_KEY = "mytodo.sync.base.v2";
export type LabData = {
  aspirations: Aspiration[]; goalResults: GoalResult[]; behaviors: BehaviorCard[];
  habits: Habit[]; habitLogs: HabitLog[]; dayPlans: Record<string, DayPlan>; taskTemplates: TaskTemplate[];
};
type Args = {
  hydrated: boolean; tasks: Task[]; entries: TimeEntry[]; lab: LabData; timer: TimerState;
  setTasks: (t: Task[]) => void; setEntries: (e: TimeEntry[]) => void;
  setLab: (patch: Partial<LabData>) => void; adoptTimer: (t: TimerState) => void;
};
type Snapshot = LabData & { tasks: Task[]; entries: TimeEntry[]; timer: TimerState };

async function request(url: string, init?: RequestInit) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(url, { ...init, cache: "no-store", signal: controller.signal });
      if (res.status >= 500 && res.status !== 501 && attempt < 2) continue;
      return res;
    } catch (error) { if (attempt === 2) throw error; }
    finally { clearTimeout(timeout); }
  }
  throw new Error("sync_failed");
}

export function useCloudSync(args: Args) {
  const { hydrated, tasks, entries, lab, timer } = args;
  const [code, setCodeState] = useState("");
  const [status, setStatus] = useState<SyncStatus>("off");
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  // Inline setters / live timer renders must not restart the polling countdown.
  const argsRef = useRef(args); argsRef.current = args;
  const current = useRef<Snapshot>({ tasks, entries, ...lab, timer });
  current.current = { tasks, entries, ...lab, timer };
  const codeRef = useRef(code); codeRef.current = code;
  const baseline = useRef<SyncDocument>({});
  const observed = useRef<SyncDocument>(current.current);
  const epoch = useRef(0);
  const ready = useRef(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busy = useRef<Promise<void> | null>(null);
  const queued = useRef(false);
  const choices = useRef<SyncChoices>({});
  const blocked = useRef(false);
  const runRef = useRef<() => Promise<void>>(async () => {});

  const dirty = useCallback((value: boolean) => {
    try {
      if (value) window.localStorage.setItem(DIRTY_KEY, "1");
      else window.localStorage.removeItem(DIRTY_KEY);
    } catch { /* In-memory data remains available. */ }
  }, []);
  const saveBase = useCallback((data: SyncDocument, c: string) => {
    window.localStorage.setItem(BASE_KEY, JSON.stringify({ code: c, data }));
    baseline.current = data;
  }, []);
  const apply = useCallback((data: SyncDocument) => {
    const next = data as Snapshot;
    const previous = current.current;
    current.current = next;
    const a = argsRef.current;
    if (!equalSync(previous.tasks, next.tasks)) a.setTasks(next.tasks);
    if (!equalSync(previous.entries, next.entries)) a.setEntries(next.entries);
    const patch: Partial<LabData> = {};
    for (const key of ["aspirations", "goalResults", "behaviors", "habits", "habitLogs", "dayPlans", "taskTemplates"] as const) {
      if (!equalSync(previous[key], next[key])) Object.assign(patch, { [key]: next[key] });
    }
    if (Object.keys(patch).length) a.setLab(patch);
    if (next.timer && !equalSync(previous.timer, next.timer)) a.adoptTimer(next.timer);
  }, []);

  const run = useCallback((): Promise<void> => {
    if (!ready.current || !codeRef.current || blocked.current) return Promise.resolve();
    if (busy.current) { queued.current = true; return busy.current; }
    const c = codeRef.current, generation = epoch.current;
    const valid = () => epoch.current === generation && codeRef.current === c;
    setStatus("syncing");
    const work = async () => {
      try {
        for (let attempt = 0; attempt < 4; attempt++) {
          const response = await request(`/api/sync?code=${encodeURIComponent(c)}`);
          if (!valid()) return;
          if (response.status === 501) { setStatus("not_configured"); return; }
          if (!response.ok) throw new Error("read_failed");
          const remote = await response.json();
          if (!valid()) return;
          if (!(remote.revision === null || typeof remote.revision === "string")) throw new Error("server_needs_update");
          const cloud: SyncDocument = { ...(remote.data ?? {}) };
          delete cloud.updatedAt;
          const merged = mergeSync(baseline.current, current.current, cloud, choices.current);
          if (merged.conflicts.length) {
            blocked.current = true;
            setConflicts(merged.conflicts);
            dirty(true);
            setStatus("conflict");
            return;
          }
          // Save the read baseline before applying: failed uploads remain a local delta.
          saveBase({ ...baseline.current, ...cloud }, c);
          apply(merged.data);
          if (!equalSync(merged.data, cloud)) {
            dirty(true);
            const saved = await request("/api/sync", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ code: c, expectedRevision: remote.revision, payload: { ...merged.data, updatedAt: Date.now() } }),
            });
            if (!valid()) return;
            if (saved.status === 409) continue;
            if (saved.status === 501) { setStatus("not_configured"); return; }
            if (!saved.ok) throw new Error("write_failed");
          }
          saveBase(merged.data, c);
          choices.current = {};
          setConflicts([]);
          if (!equalSync(current.current, merged.data)) {
            dirty(true); queued.current = true; setStatus("syncing");
          } else {
            dirty(false); setStatus("synced"); setLastSyncedAt(Date.now());
          }
          return;
        }
        throw new Error("concurrent_changes");
      } catch {
        if (valid()) setStatus("error");
      }
    };
    const promise = work().finally(() => {
      if (busy.current !== promise) return;
      busy.current = null;
      if (queued.current && valid() && !blocked.current) {
        queued.current = false;
        void runRef.current();
      }
    });
    busy.current = promise;
    return promise;
  }, [apply, dirty, saveBase]);
  runRef.current = run;

  useEffect(() => {
    try { setCodeState(window.localStorage.getItem(CODE_KEY) ?? ""); } catch { /* local only */ }
  }, []);

  useEffect(() => {
    epoch.current++;
    busy.current = null; queued.current = false; blocked.current = false;
    choices.current = {}; setConflicts([]); ready.current = false;
    setLastSyncedAt(null);
    if (!hydrated || !code) { setStatus("off"); return; }
    try {
      const saved = JSON.parse(window.localStorage.getItem(BASE_KEY) ?? "null");
      if (saved?.code === code && saved.data) baseline.current = saved.data;
      else {
        // Upgrade preserves a backup. An old dirty bit cannot identify changed fields;
        // require a choice for divergent versions instead of guessing which is newer.
        const backupKey = `mytodo.sync.upgrade-backup.v2:${code}`;
        if (!window.localStorage.getItem(backupKey)) window.localStorage.setItem(backupKey, JSON.stringify(current.current));
        baseline.current = window.localStorage.getItem(DIRTY_KEY) === "1" ? {} : current.current;
      }
      ready.current = true;
      void run();
    } catch { setStatus("error"); }
    return () => {
      epoch.current++; ready.current = false;
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [code, hydrated, run]);

  useEffect(() => {
    if (equalSync(observed.current, current.current)) return;
    observed.current = current.current;
    if (!ready.current || !code || equalSync(current.current, baseline.current)) return;
    dirty(true);
    if (blocked.current) return;
    setStatus("syncing");
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => void run(), 800);
  }, [tasks, entries, lab, timer, code, dirty, run]);

  useEffect(() => {
    if (!hydrated || !code) return;
    let cancelled = false;
    let handle: ReturnType<typeof setTimeout>;
    const schedule = () => {
      handle = setTimeout(async () => {
        if (cancelled) return;
        if (document.visibilityState === "visible") await run();
        if (!cancelled) schedule();
      }, current.current.timer.running ? 15000 : 60000);
    };
    schedule();
    const resume = () => {
      if (document.visibilityState === "visible" || !equalSync(current.current, baseline.current)) void run();
    };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    window.addEventListener("focus", resume);
    return () => {
      cancelled = true; clearTimeout(handle);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("focus", resume);
    };
  }, [hydrated, code, run]);

  const setCode = useCallback((c: string) => {
    epoch.current++; codeRef.current = c;
    setCodeState(c);
    try {
      if (c) window.localStorage.setItem(CODE_KEY, c);
      else window.localStorage.removeItem(CODE_KEY);
    } catch { /* local only */ }
  }, []);
  const resolveConflict = useCallback((signature: string, choice: "local" | "cloud") => {
    choices.current[signature] = choice;
    blocked.current = false;
    void run();
  }, [run]);
  return { code, setCode, status, lastSyncedAt, conflicts, resolveConflict, refresh: run, disconnect: () => setCode("") };
}
