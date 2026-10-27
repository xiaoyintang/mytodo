import type { RunningTimer, TimerState } from "./useTimer";
import type { TimeEntry } from "./types";
import { toISODate } from "./date";
import { historyEntryFields } from "./entryHistory";

export type RewardConfig = {
  focusMinutes: number;
  rewardMinutes: number;
  title: string;
  category: "娱乐" | "休息";
  focusSound: boolean;
  rewardSound: boolean;
};
export type RewardCycle = {
  id: string;
  config: RewardConfig;
  phase: "focus" | "reward" | "finished";
  focus: Pick<RunningTimer, "title" | "attribution">;
  creditedMs: number;
  /** 未建立台账关联的旧进度；新轮次为 0。关联记录的贡献从台账动态计算。 */
  ledgerBaseMs?: number;
  activeStartedAt?: number;
};
export const DEFAULT_REWARD: RewardConfig = {
  focusMinutes: 30, rewardMinutes: 10, title: "自由活动", category: "娱乐",
  focusSound: false, rewardSound: true,
};

export function validRewardConfig(config: RewardConfig): boolean {
  return Number.isInteger(config.focusMinutes) && config.focusMinutes >= 1 && config.focusMinutes <= 180
    && Number.isInteger(config.rewardMinutes) && config.rewardMinutes >= 1 && config.rewardMinutes <= 60
    && typeof config.title === "string" && config.title.trim().length > 0 && config.title.length <= 80
    && (config.category === "娱乐" || config.category === "休息")
    && typeof config.focusSound === "boolean" && typeof config.rewardSound === "boolean";
}

/** 可选字段兼容旧计时存档；坏的奖励配置不影响原计时恢复。 */
export function readRewardCycle(value: unknown): RewardCycle | undefined {
  if (!value || typeof value !== "object") return undefined;
  const r = value as RewardCycle;
  if (!r.config || !validRewardConfig(r.config) || !r.focus || typeof r.focus.title !== "string"
    || typeof r.id !== "string" || !["focus", "reward", "finished"].includes(r.phase)
    || !Number.isFinite(r.creditedMs) || r.creditedMs < 0
    || (r.ledgerBaseMs !== undefined && (!Number.isFinite(r.ledgerBaseMs) || r.ledgerBaseMs < 0))
    || (r.activeStartedAt !== undefined && !Number.isFinite(r.activeStartedAt))) return undefined;
  return r;
}

/** 派生展示/达标值，不回写 timer，避免台账编辑覆盖其他设备正在跑的计时。 */
export function rewardWithEntries(cycle: RewardCycle | undefined, entries?: readonly TimeEntry[]): RewardCycle | undefined {
  if (!cycle || cycle.ledgerBaseMs === undefined || !entries) return cycle;
  const creditedMs = entries.reduce((total, entry) => {
    const credit = entry.focusCredit;
    if (!credit || credit.cycleId !== cycle.id || !Number.isFinite(entry.minutes) || entry.minutes < 0
      || !Number.isFinite(credit.elapsedMs) || credit.elapsedMs < 0) return total;
    return total + (entry.minutes === credit.originalMinutes ? credit.elapsedMs : entry.minutes * 60000);
  }, cycle.ledgerBaseMs);
  return creditedMs === cycle.creditedMs ? cycle : { ...cycle, creditedMs };
}

export function rewardProgress(state: TimerState, now: number, entries?: readonly TimeEntry[]) {
  const cycle = rewardWithEntries(state.reward, entries);
  const active = Boolean(cycle && state.running && cycle.activeStartedAt === state.running.startedAt);
  const elapsed = active ? Math.max(0, now - state.running!.startedAt) : 0;
  const focusMs = (cycle?.creditedMs ?? 0) + (cycle?.phase === "focus" ? elapsed : 0);
  return {
    active,
    focusMs,
    ready: Boolean(cycle?.phase === "focus" && focusMs >= cycle.config.focusMinutes * 60000),
    rewardMs: cycle?.phase === "reward" ? elapsed : 0,
    rewardOver: Boolean(cycle?.phase === "reward" && active && elapsed >= cycle.config.rewardMinutes * 60000),
  };
}

function stamp(state: TimerState, now: number) { return Math.max(now, state.updatedAt + 1); }

/** 对现有计时启用，或从空闲直接开始正事；不追溯旧台账。 */
export function configureReward(state: TimerState, config: RewardConfig, now: number): TimerState {
  if (state.reward || !validRewardConfig(config)) return state;
  const running = state.running ?? { title: "正事", startedAt: now };
  return { ...state, running, updatedAt: stamp(state, now), reward: {
    id: `reward-${now}`, config: { ...config, title: config.title.trim() }, phase: "focus",
    focus: { title: running.title, attribution: running.attribution }, creditedMs: 0, ledgerBaseMs: 0, activeStartedAt: running.startedAt,
  } };
}

export type TimerTransition = { state: TimerState; entry?: Omit<TimeEntry, "id"> };

/** 停止只生成一笔记录；奖励与正事的归属、分类分开。 */
export function stopTimer(state: TimerState, now: number): TimerTransition {
  const running = state.running;
  if (!running) return { state };
  const cycle = state.reward;
  const active = cycle && cycle.activeStartedAt === running.startedAt;
  const elapsed = Math.max(0, now - running.startedAt);
  const minutes = Math.max(1, Math.round(elapsed / 60000));
  const startD = new Date(running.startedAt), endD = new Date(now);
  const clock = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const reward = active ? { ...cycle, activeStartedAt: undefined,
    creditedMs: cycle.creditedMs + (cycle.phase === "focus" ? elapsed : 0),
    ...(cycle.phase === "focus" ? { ledgerBaseMs: cycle.ledgerBaseMs ?? cycle.creditedMs } : {}),
    phase: cycle.phase === "reward" ? "finished" as const : cycle.phase,
  } : cycle;
  return {
    state: { ...state, running: null, reward, updatedAt: stamp(state, now) },
    entry: {
      date: toISODate(endD), dateAnchor: "end", title: running.title,
      minutes, startTime: clock(startD), endTime: clock(endD),
      ...(running.attribution ? historyEntryFields(running.attribution) : {}),
      ...(active && cycle.phase === "focus" ? {
        category: "正事" as const, categorySource: "user" as const,
        focusCredit: { cycleId: cycle.id, elapsedMs: elapsed, originalMinutes: minutes },
      } : {}),
      ...(active && cycle.phase === "reward" ? {
        ...historyEntryFields({}), category: cycle.config.category, categorySource: "user" as const,
      } : {}),
    },
  };
}

/** 达标本身不停止正事；用户点击时才结算并开始奖励。 */
export function beginReward(state: TimerState, now: number, entries?: readonly TimeEntry[]): TimerTransition {
  const cycle = state.reward, progress = rewardProgress(state, now, entries);
  if (!cycle || !progress.ready || (state.running && !progress.active)) return { state };
  const stopped = stopTimer(state, now);
  return { entry: stopped.entry, state: {
    ...stopped.state, updatedAt: stamp(stopped.state, now),
    running: { title: `奖励 · ${cycle.config.title}`, startedAt: now, attribution: {} },
    reward: { ...stopped.state.reward!, phase: "reward", activeStartedAt: now },
  } };
}

/** 暂停后接着累计；奖励结束后开始新一轮，不把上一轮重复兑换。 */
export function resumeFocus(state: TimerState, now: number): TimerTransition {
  const cycle = state.reward, progress = rewardProgress(state, now);
  if (!cycle || (state.running && !(cycle.phase === "reward" && progress.active))) return { state };
  const stopped = stopTimer(state, now);
  const newRound = cycle.phase !== "focus";
  return { entry: stopped.entry, state: {
    ...stopped.state, updatedAt: stamp(stopped.state, now),
    running: { ...cycle.focus, startedAt: now },
    reward: { ...cycle, id: newRound ? `reward-${now}` : cycle.id, phase: "focus",
      creditedMs: newRound ? 0 : cycle.creditedMs, ledgerBaseMs: newRound ? 0 : cycle.ledgerBaseMs, activeStartedAt: now },
  } };
}
