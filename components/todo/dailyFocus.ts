import type { DayPlan, ISODate, Task } from "./types";

/** Only a task actually scheduled on this date can be its daily focus. */
export function dailyFocusTask(date: ISODate, plans: Record<string, DayPlan>, tasks: Task[]): Task | undefined {
  const id = plans[date]?.mustDoTaskId;
  return id ? tasks.find((task) => task.id === id && task.date === date) : undefined;
}

export function setDailyFocus(plans: Record<string, DayPlan>, date: ISODate, taskId: string | null, tasks: Task[]): Record<string, DayPlan> {
  if (taskId && !tasks.some((task) => task.id === taskId && task.date === date)) return plans;
  if ((plans[date]?.mustDoTaskId ?? null) === taskId) return plans;
  return { ...plans, [date]: { ...plans[date], date, primaryAspirationIds: plans[date]?.primaryAspirationIds ?? [], mustDoTaskId: taskId ?? undefined } };
}

/** Moving or deleting a task clears its designation, never overwrites another day. */
export function clearDailyFocus(plans: Record<string, DayPlan>, taskId: string): Record<string, DayPlan> {
  let changed = false;
  const next = Object.fromEntries(Object.entries(plans).map(([date, plan]) => {
    if (plan.mustDoTaskId !== taskId) return [date, plan];
    changed = true;
    return [date, { ...plan, mustDoTaskId: undefined }];
  }));
  return changed ? next : plans;
}

export function moveDailyFocus(plans: Record<string, DayPlan>, task: Task, date: ISODate, restore = false): Record<string, DayPlan> {
  const next = task.date === date ? plans : clearDailyFocus(plans, task.id);
  // Undo may restore the original choice, but must not replace a newer choice.
  if (restore && !next[date]?.mustDoTaskId) return setDailyFocus(next, date, task.id, [{ ...task, date }]);
  return next;
}
