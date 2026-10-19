import type { Habit, HabitLog, Task, TimeEntry } from "./types";

/**
 * 目标经验值：原子习惯"每次行动都是为想成为的人投一票"。
 * **全部从已有数据算，不新增任何输入**——任务/习惯/记录上本来就挂着目标。
 * 只涨不掉：断几天等级还在（和"不做 streak"同一个理由）。
 * 时间投入占大头，件数只给少量经验，避免"把任务拆碎刷分"。
 */
export const XP = { task: 10, step: 3, start: 3, habit: 5, perTenMinutes: 1 } as const;

export type XpData = { tasks: Task[]; habits: Habit[]; habitLogs: HabitLog[]; entries: TimeEntry[] };
export type GoalLevel = { xp: number; level: number; into: number; need: number };

function startsDone(task: Task): number {
  const steps = task.subtasks ?? [];
  const own = task.startAction;
  const duplicated = own?.targetStepId && steps.some((step) => step.id === own.targetStepId && step.startAction);
  return steps.filter((step) => step.startAction?.done).length + (own?.done && !duplicated ? 1 : 0);
}

export function goalXp(goalId: string, data: XpData): number {
  let xp = 0;
  for (const task of data.tasks) {
    if (task.aspirationId !== goalId) continue;
    if (task.status === "done") xp += XP.task;
    xp += (task.subtasks ?? []).filter((step) => step.done).length * XP.step;
    xp += startsDone(task) * XP.start;
  }
  const habitIds = new Set(data.habits.filter((habit) => habit.aspirationId === goalId).map((habit) => habit.id));
  // 由任务完成回写的打卡已经按任务算过，不重复计。
  xp += data.habitLogs.filter((log) => habitIds.has(log.habitId) && !log.taskId).length * XP.habit;
  const minutes = data.entries.reduce((sum, entry) => sum + (entry.aspirationId === goalId ? entry.minutes : 0), 0);
  xp += Math.floor(minutes / 10) * XP.perTenMinutes;
  return xp;
}

/** 升到下一级需要的经验：60、90、120……越往后越难。 */
export function xpToNext(level: number): number {
  return 30 + 30 * level;
}

export function levelOf(xp: number): GoalLevel {
  let level = 1;
  let into = Math.max(0, xp);
  while (into >= xpToNext(level)) {
    into -= xpToNext(level);
    level += 1;
  }
  return { xp, level, into, need: xpToNext(level) };
}

export function goalLevels(goalIds: string[], data: XpData): Record<string, GoalLevel> {
  return Object.fromEntries(goalIds.map((id) => [id, levelOf(goalXp(id, data))]));
}
