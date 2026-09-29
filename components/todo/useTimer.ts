"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TimeEntry } from "./types";
import { beginReward, configureReward, readRewardCycle, resumeFocus, rewardProgress, stopTimer, type RewardConfig, type RewardCycle, type TimerTransition } from "./timerReward";
import { playRewardSound, unlockRewardSound } from "./rewardSound";

// 正在进行的计时（跨刷新/重开持久化，并跟着云同步跨设备）。
// 历史上字段名是 category，这里兼容读取。
const RUN_KEY = "mytodo.timer.v1";

export type TimerAttribution = { aspirationId?: string; taskId?: string };
export type RunningTimer = { title: string; startedAt: number; attribution?: TimerAttribution };

/**
 * 计时状态。带 updatedAt 是为了跨设备合并时能分清
 * "我刚停了还没传上去" 和 "别的设备刚开始还没拉下来"——
 * 光看 running 是不是 null 分不出来，谁的时间戳新听谁的。
 */
export type TimerState = { running: RunningTimer | null; updatedAt: number; reward?: RewardCycle };

const EMPTY: TimerState = { running: null, updatedAt: 0 };

function read(): TimerState {
  try {
    const raw = window.localStorage.getItem(RUN_KEY);
    if (!raw) return EMPTY;
    const p = JSON.parse(raw) as Record<string, unknown>;
    // 新格式 { running, updatedAt }
    if ("updatedAt" in p) {
      const r = p.running as Partial<RunningTimer> | null;
      const running =
        r && typeof r.startedAt === "number" && r.title ? {
          title: r.title, startedAt: r.startedAt,
          ...(r.attribution && typeof r.attribution === "object" ? {
            attribution: {
              aspirationId: typeof r.attribution.aspirationId === "string" ? r.attribution.aspirationId : undefined,
              taskId: typeof r.attribution.taskId === "string" ? r.attribution.taskId : undefined,
            },
          } : {}),
        } : null;
      return { running, updatedAt: Number(p.updatedAt) || 0, reward: readRewardCycle(p.reward) };
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
  const notifiedRef = useRef(new Set<string>());
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

  function applyTransition(transition: TimerTransition) {
    if (transition.state === stateRef.current) return;
    commitRef.current(transition.state);
    setNowMs(Date.now());
    if (transition.entry) onRecordRef.current(transition.entry);
  }
  const transitionRef = useRef(applyTransition);
  transitionRef.current = applyTransition;

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

  // 提示只响一次；切换应用内 tab 不会停止检测。恢复页面时不补响过期提示。
  useEffect(() => {
    const cycle = state.reward;
    if (!cycle) return;
    const progress = rewardProgress(state, nowMs);
    const phase = progress.ready ? "focus" : progress.rewardOver ? "reward" : undefined;
    if (!phase) return;
    const key = `${cycle.id}:${phase}`;
    if (notifiedRef.current.has(key)) return;
    notifiedRef.current.add(key);
    try {
      const storageKey = `mytodo.reward.notified.${phase}`;
      if (window.sessionStorage.getItem(storageKey) === cycle.id) return;
      window.sessionStorage.setItem(storageKey, cycle.id);
    } catch { /* 内存去重仍有效 */ }
    const enabled = phase === "focus" ? cycle.config.focusSound : cycle.config.rewardSound;
    if (enabled) playRewardSound();
  }, [state, nowMs]);

  const start = useCallback((title: string) => {
    const t = title.trim();
    if (!t) return;
    if (stateRef.current.running) return; // 已在计时，不覆盖
    const now = Date.now();
    commitRef.current({ ...stateRef.current, running: { title: t, startedAt: now }, updatedAt: Math.max(now, stateRef.current.updatedAt + 1) });
    setNowMs(now);
  }, []);

  const stop = useCallback(() => {
    transitionRef.current(stopTimer(stateRef.current, Date.now()));
  }, []);

  const enableReward = useCallback((config: RewardConfig, startedAt?: number) => {
    if (stateRef.current.running?.startedAt !== startedAt) return;
    if (config.focusSound || config.rewardSound) unlockRewardSound();
    transitionRef.current({ state: configureReward(stateRef.current, config, Date.now()) });
  }, []);

  const startReward = useCallback((id: string) => {
    if (stateRef.current.reward?.id !== id) return;
    if (stateRef.current.reward.config.rewardSound) unlockRewardSound();
    transitionRef.current(beginReward(stateRef.current, Date.now()));
  }, []);

  const continueFocus = useCallback((id: string) => {
    if (stateRef.current.reward?.id !== id) return;
    if (stateRef.current.reward.config.focusSound || stateRef.current.reward.config.rewardSound) unlockRewardSound();
    transitionRef.current(resumeFocus(stateRef.current, Date.now()));
  }, []);

  const dismissReward = useCallback((id: string) => {
    const cur = stateRef.current;
    if (cur.reward?.id !== id) return;
    // 奖励正在进行时，先按实际用时记完它；不会留下失去分类的奖励计时。
    const stopped = cur.reward.phase === "reward" && cur.running?.startedAt === cur.reward.activeStartedAt
      ? stopTimer(cur, Date.now()) : { state: cur };
    transitionRef.current({ ...stopped, state: { ...stopped.state, reward: undefined, updatedAt: Math.max(Date.now(), stopped.state.updatedAt + 1) } });
  }, []);

  // 只修改本次计时的名称；保留 startedAt，不停止、不产生额外记录。
  // 编辑时若另一台设备已换了计时，不把旧草稿写到新的事件上。
  const rename = useCallback((title: string, startedAt: number, attribution?: TimerAttribution) => {
    const cur = stateRef.current;
    const nextTitle = title.trim();
    if (!cur.running || cur.running.startedAt !== startedAt || !nextTitle) return;
    if (cur.running.title === nextTitle && !attribution) return;
    commitRef.current({
      ...cur,
      running: { ...cur.running, title: nextTitle, attribution },
      reward: cur.reward?.phase === "focus" && cur.reward.activeStartedAt === startedAt
        ? { ...cur.reward, focus: { title: nextTitle, attribution } } : cur.reward,
      updatedAt: Math.max(Date.now(), cur.updatedAt + 1),
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
  return { running: state.running, elapsedMs, start, stop, rename, state, adopt,
    reward: state.reward, enableReward, startReward, continueFocus, dismissReward };
}

export type TimerRewardControls = Pick<ReturnType<typeof useTimer>, "reward" | "enableReward" | "startReward" | "continueFocus" | "dismissReward">;
