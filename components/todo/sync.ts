"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Aspiration, BehaviorCard, DayPlan, Habit, HabitLog, Task, TimeEntry } from "./types";
import type { TimerState } from "./useTimer";

export type SyncStatus = "off" | "syncing" | "synced" | "error" | "not_configured";

const CODE_KEY = "mytodo.sync.code";
const DIRTY_KEY = "mytodo.sync.dirty"; // "1"=本地有改动还没确认传上云

// 按 id 合并两个列表（并集）：本地未同步时用，绝不丢任何一边的记录，
// 同 id 冲突时以本地为准（本地带着还没传上去的最新改动）。
function mergeById<T extends { id: string }>(cloud: T[], local: T[]): T[] {
  const map = new Map<string, T>();
  for (const it of cloud) map.set(it.id, it);
  for (const it of local) map.set(it.id, it);
  return Array.from(map.values());
}

/** 除了 tasks/entries，习惯实验室那几张表也要同步——否则手机上看不到目标和习惯 */
export type LabData = {
  aspirations: Aspiration[];
  behaviors: BehaviorCard[];
  habits: Habit[];
  habitLogs: HabitLog[];
  dayPlans: Record<string, DayPlan>;
};

type Args = {
  hydrated: boolean;
  tasks: Task[];
  entries: TimeEntry[];
  lab: LabData;
  /** 正在跑的计时。只传"什么时候开始的"，各设备自己算过了多久 */
  timer: TimerState;
  setTasks: (t: Task[]) => void;
  setEntries: (e: TimeEntry[]) => void;
  setLab: (patch: Partial<LabData>) => void;
  adoptTimer: (t: TimerState) => void;
};

/** DayPlan 按日期 key 合并（同一天以本地为准，本地带着还没传上去的改动） */
function mergePlans(
  cloud: Record<string, DayPlan> | null,
  local: Record<string, DayPlan>,
): Record<string, DayPlan> {
  return { ...(cloud ?? {}), ...local };
}

// 同步码云同步：
// - 设了码：进入页面拉云端（以云端为准替换本地），本地改动 800ms 防抖推送
// - 云端为空：把本地数据上传（首台设备）
// 不做实时推送，切换设备刷新即可拿到最新。
export function useCloudSync({
  hydrated,
  tasks,
  entries,
  lab,
  timer,
  setTasks,
  setEntries,
  setLab,
  adoptTimer,
}: Args) {
  const [code, setCodeState] = useState("");
  const [status, setStatus] = useState<SyncStatus>("off");
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

  const codeRef = useRef(code);
  codeRef.current = code;
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const labRef = useRef(lab);
  labRef.current = lab;
  const timerRef = useRef(timer);
  timerRef.current = timer;
  const pulledRef = useRef(false);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 本地是否有还没成功传上云的改动（跨刷新持久化，避免重开后被旧云端覆盖）
  const dirtyRef = useRef(false);

  const markDirty = useCallback((v: boolean) => {
    dirtyRef.current = v;
    try {
      if (v) window.localStorage.setItem(DIRTY_KEY, "1");
      else window.localStorage.removeItem(DIRTY_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  // 读取已保存的同步码 + 未同步标记
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(CODE_KEY);
      if (saved) setCodeState(saved);
      dirtyRef.current = window.localStorage.getItem(DIRTY_KEY) === "1";
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

  // 把指定数据推上云。成功且推的正是当前本地状态时，清掉未同步标记。
  const pushData = useCallback(
    async (tks: Task[], ents: TimeEntry[], lb: LabData) => {
      const c = codeRef.current;
      if (!c) return;
      setStatus("syncing");
      const body = JSON.stringify({
        code: c,
        payload: { tasks: tks, entries: ents, ...lb, timer: timerRef.current, updatedAt: Date.now() },
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
            // 期间本地没再变 → 已同步干净；否则保持 dirty，等下次推
            if (
              tasksRef.current === tks &&
              entriesRef.current === ents &&
              labRef.current === lb
            ) {
              markDirty(false);
            }
            return;
          }
        } catch {
          // 超时/网络中断 → 重试
        }
      }
      // 传不上去：保留 dirty，本地记录不动，等下次有机会再补传
      setStatus("error");
    },
    [markDirty],
  );

  const push = useCallback(
    () => pushData(tasksRef.current, entriesRef.current, labRef.current),
    [pushData],
  );

  // 拉取并应用云端数据（以云端为准）
  const pull = useCallback(
    async (): Promise<"has_data" | "empty" | "error" | "not_configured"> => {
      const c = codeRef.current;
      if (!c) return "error";
      // 记录拉取前的本地数据引用，用于检测"拉取期间用户改了本地"
      const t0 = tasksRef.current;
      const e0 = entriesRef.current;
      const l0 = labRef.current;
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
        const cloudTasks = Array.isArray(data?.tasks) ? (data.tasks as Task[]) : null;
        const cloudEntries = Array.isArray(data?.entries) ? (data.entries as TimeEntry[]) : null;
        // 云端没有这几个 key（老版本传上去的 payload）→ 一律按 null 处理，
        // 下面只在非 null 时才写本地。绝不能把"云端没有"当成"云端是空的"，那会删掉本地数据。
        const cloudAsp = Array.isArray(data?.aspirations) ? (data.aspirations as Aspiration[]) : null;
        const cloudBeh = Array.isArray(data?.behaviors) ? (data.behaviors as BehaviorCard[]) : null;
        const cloudHabits = Array.isArray(data?.habits) ? (data.habits as Habit[]) : null;
        const cloudLogs = Array.isArray(data?.habitLogs) ? (data.habitLogs as HabitLog[]) : null;
        const cloudPlans =
          data?.dayPlans && typeof data.dayPlans === "object"
            ? (data.dayPlans as Record<string, DayPlan>)
            : null;
        // 计时状态：谁的 updatedAt 新听谁的（adopt 内部还会再比一次）。
        // 采纳远端的"已停止"不会记一笔——那笔记录在按停止的那台设备上产生，会自己同步过来。
        const cloudTimer = data?.timer as TimerState | undefined;
        if (cloudTimer && typeof cloudTimer.updatedAt === "number") adoptTimer(cloudTimer);

        if (!cloudTasks && !cloudEntries && !cloudAsp && !cloudBeh) return "empty";

        // 本地有未上传的改动（含拉取期间刚新增的）→ 合并而不是覆盖，
        // 保证本地记录一条都不丢，合并后再把完整数据推上云。
        const localChanged =
          dirtyRef.current ||
          tasksRef.current !== t0 ||
          entriesRef.current !== e0 ||
          labRef.current !== l0;
        if (localChanged) {
          const mergedTasks = mergeById(cloudTasks ?? [], tasksRef.current);
          const mergedEntries = mergeById(cloudEntries ?? [], entriesRef.current);
          const mergedLab: LabData = {
            aspirations: mergeById(cloudAsp ?? [], labRef.current.aspirations),
            behaviors: mergeById(cloudBeh ?? [], labRef.current.behaviors),
            habits: mergeById(cloudHabits ?? [], labRef.current.habits),
            habitLogs: mergeById(cloudLogs ?? [], labRef.current.habitLogs),
            dayPlans: mergePlans(cloudPlans, labRef.current.dayPlans),
          };
          setTasks(mergedTasks);
          setEntries(mergedEntries);
          setLab(mergedLab);
          setStatus("synced");
          setLastSyncedAt(Date.now());
          void pushData(mergedTasks, mergedEntries, mergedLab);
          return "has_data";
        }

        // 本地干净 → 以云端为准（这样别的设备的删除也能同步过来）。
        // 但云端**没有**某个集合时跳过它，不能拿 [] 去覆盖本地。
        setTasks(cloudTasks ?? []);
        setEntries(cloudEntries ?? []);
        setLab({
          ...(cloudAsp ? { aspirations: cloudAsp } : {}),
          ...(cloudBeh ? { behaviors: cloudBeh } : {}),
          ...(cloudHabits ? { habits: cloudHabits } : {}),
          ...(cloudLogs ? { habitLogs: cloudLogs } : {}),
          ...(cloudPlans ? { dayPlans: cloudPlans } : {}),
        });
        setStatus("synced");
        setLastSyncedAt(Date.now());
        return "has_data";
      } catch {
        setStatus("error");
        return "error";
      }
    },
    [setTasks, setEntries, setLab, adoptTimer, pushData],
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

  // 本地改动 → 标记未同步 + 防抖推送
  useEffect(() => {
    if (!hydrated || !code || !pulledRef.current) return;
    markDirty(true); // 先记为"有未同步改动"，推成功才会清掉
    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => void push(), 800);
    return () => {
      if (pushTimer.current) clearTimeout(pushTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, entries, lab, timer]);

  // 定时轮询：光靠"打开页面/切回页面"不够——页面一直开着就永远不会去问云端，
  // 于是手机上开始的计时，电脑上死活看不到。
  // 有计时在跑时 15 秒一次（要看秒表跳），平时 60 秒一次。页面在后台完全不轮询。
  useEffect(() => {
    if (!hydrated || !code) return;
    let cancelled = false;
    let handle: ReturnType<typeof setTimeout> | null = null;

    const tick = () => {
      const gap = timerRef.current.running ? 15000 : 60000;
      handle = setTimeout(async () => {
        if (cancelled) return;
        // 后台标签页不打扰，等切回来那次 visibilitychange 会补上
        if (document.visibilityState === "visible" && pulledRef.current) await pull();
        if (!cancelled) tick();
      }, gap);
    };
    tick();

    return () => {
      cancelled = true;
      if (handle) clearTimeout(handle);
    };
  }, [hydrated, code, pull]);

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
