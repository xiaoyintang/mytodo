import type { BehaviorCard, DayPlan, ISODate, Task } from "./types";

/** Source identity, never title alone: equally named manual tasks remain separate. */
export function weekTaskSourceKey(task: Task): string | undefined {
  const source = task.sourceHabitId ? ["habit", task.sourceHabitId]
    : task.sourceTemplateId && task.sourceTemplateItemId ? ["template", task.sourceTemplateId, task.sourceTemplateItemId]
    : task.sourceBehaviorId ? ["behavior", task.sourceBehaviorId] : undefined;
  return source ? JSON.stringify([...source, task.title.trim(), task.aspirationId ?? "", task.resultId ?? ""]) : undefined;
}

export function buildWeekOverview(tasks: Task[], dates: ISODate[], plans: Record<string, DayPlan>,
  mainlines: Record<string, string[]>, behaviors: BehaviorCard[]) {
  const dateSet = new Set(dates);
  const weekTasks = tasks.filter(task => dateSet.has(task.date));
  const sourceDates = new Map<string, Set<string>>();
  for (const task of weekTasks) {
    const key = weekTaskSourceKey(task);
    if (key) sourceDates.set(key, new Set([...(sourceDates.get(key) ?? []), task.date]));
  }
  const behaviorTypes = new Map(behaviors.map(item => [item.id, item.type]));
  const isRoutine = (task: Task) => Boolean(task.sourceHabitId || task.sourceTemplateId
    || ["habit", "stop"].includes(behaviorTypes.get(task.sourceBehaviorId ?? "") ?? "")
    || (sourceDates.get(weekTaskSourceKey(task) ?? "")?.size ?? 0) > 1);
  const isFocus = (task: Task) => plans[task.date]?.mustDoTaskId === task.id;
  const isMainline = (task: Task) => !!task.aspirationId && (mainlines[task.date] ?? []).includes(task.aspirationId);
  const rank = (task: Task) => isFocus(task) ? 0 : task.priority === "high" ? 1 : isMainline(task) ? 2 : 3;
  const compare = (a: Task, b: Task) => rank(a) - rank(b)
    || Number(a.status === "done") - Number(b.status === "done")
    || (a.startTime ?? "99:99").localeCompare(b.startTime ?? "99:99");
  const days = dates.map(date => {
    const all = weekTasks.filter(task => task.date === date).sort(compare);
    const important = all.filter(task => isFocus(task) || task.priority === "high" || (isMainline(task) && !isRoutine(task)));
    const importantIds = new Set(important.map(task => task.id));
    const rest = all.filter(task => !importantIds.has(task.id));
    return { date, all, important, routine: rest.filter(isRoutine), other: rest.filter(task => !isRoutine(task)) };
  });
  const groups = new Map<string, { key: string; title: string; tasks: Task[] }>();
  for (const task of days.flatMap(day => day.routine)) {
    const key = weekTaskSourceKey(task) ?? `task:${task.id}`;
    const group = groups.get(key) ?? { key, title: task.title, tasks: [] };
    group.tasks.push(task); groups.set(key, group);
  }
  return { days, routines: [...groups.values()], important: days.flatMap(day => day.important) };
}
