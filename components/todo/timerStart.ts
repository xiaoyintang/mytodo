import type { TimerState } from "./useTimer";

/** Edit this exact timer, without stopping it or emitting a second record. */
export function changeTimerStart(state: TimerState, expectedStart: number, startedAt: number, now: number): TimerState {
  if (!state.running || state.running.startedAt !== expectedStart || !Number.isFinite(startedAt)
    || !Number.isFinite(new Date(startedAt).getTime()) || startedAt > now || startedAt === expectedStart) return state;
  return {
    ...state,
    running: { ...state.running, startedAt },
    reward: state.reward?.activeStartedAt === expectedStart
      ? { ...state.reward, activeStartedAt: startedAt } : state.reward,
    updatedAt: Math.max(now, state.updatedAt + 1),
  };
}

/** An explicit date avoids silently turning a future clock time into yesterday. */
export function timerStartTimestamp(date: string, time: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const value = new Date(year, month - 1, day, hour, minute);
  if (value.getFullYear() !== year || value.getMonth() !== month - 1 || value.getDate() !== day
    || value.getHours() !== hour || value.getMinutes() !== minute) return null;
  return value.getTime();
}
