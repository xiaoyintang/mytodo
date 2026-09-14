import type { Aspiration, ISODate, Task, TimeEntry } from "./types";

export type EntryHistoryChoice = {
  title: string;
  aspirationId?: string;
  taskId?: string;
  taskLabel?: string;
  goalLabel: string;
  source?: "task" | "history";
};

/** 计时可沿用今天的任务，即使它还没有产生记录；不按同名猜关联。 */
export function buildTimerChoices(entries: TimeEntry[], goals: Aspiration[], tasks: Task[], today: ISODate): EntryHistoryChoice[] {
  const planned = tasks.filter(task => task.date === today).slice().sort((a, b) =>
    Number(a.status === "done") - Number(b.status === "done") || (a.startTime ?? "99:99").localeCompare(b.startTime ?? "99:99"));
  const taskChoices: EntryHistoryChoice[] = planned.filter(task => task.title.trim()).map(task => {
    const goal = goals.find(goal => goal.id === task.aspirationId);
    return { title: task.title.trim(), taskId: task.id, taskLabel: task.title, aspirationId: task.aspirationId,
      goalLabel: goal ? `${goal.title}${goal.archived ? "（已归档）" : ""}` : task.aspirationId ? "原目标已删除" : "未归属目标", source: "task" };
  });
  const history = buildEntryHistory(entries, goals, tasks, today).filter(choice =>
    !taskChoices.some(task => task.taskId === choice.taskId && task.title === choice.title));
  return [...taskChoices, ...history.map(choice => ({ ...choice, source: "history" as const }))];
}

/** 只同步明确计入该任务的记录；日期、名称、时长、大类都不变。 */
export function reassignTaskEntries(entries: TimeEntry[], task: Pick<Task, "id" | "aspirationId">): TimeEntry[] {
  let changed = false;
  const next = entries.map(entry => {
    if (entry.taskId !== task.id || entry.taskLinkMode === "none" || entry.aspirationId === task.aspirationId) return entry;
    changed = true;
    return { ...entry, aspirationId: task.aspirationId };
  });
  return changed ? next : entries;
}

/** 只展示今天做过的事项；同名但计入不同任务或目标的事项分别保留。 */
export function buildEntryHistory(entries: TimeEntry[], goals: Aspiration[], tasks: Task[], today: ISODate): EntryHistoryChoice[] {
  const seen = new Set<string>();
  return entries.map((entry, index) => ({ entry, index })).filter(({ entry }) => entry.date === today)
    .sort((a, b) => b.entry.date.localeCompare(a.entry.date)
      || (b.entry.startTime ?? "").localeCompare(a.entry.startTime ?? "") || b.index - a.index)
    .flatMap(({ entry }) => {
      const title = entry.title.trim();
      const task = entry.taskLinkMode !== "none" ? tasks.find((item) => item.id === entry.taskId) : undefined;
      const aspirationId = task ? task.aspirationId : entry.aspirationId;
      const key = JSON.stringify([title, aspirationId ?? null, task?.id ?? null]);
      if (!title || seen.has(key)) return [];
      seen.add(key);
      const goal = goals.find((g) => g.id === aspirationId);
      return [{
        title,
        aspirationId,
        taskId: task?.id,
        taskLabel: task?.title,
        goalLabel: goal ? `${goal.title}${goal.archived ? "（已归档）" : ""}`
          : aspirationId ? "原目标已删除" : "未归属目标",
      }];
    });
}

/** 用户明确选择沿用该事项的目标和任务；不复用日期、时长或完成状态。 */
export function historyEntryFields(choice: Pick<EntryHistoryChoice, "aspirationId" | "taskId">) {
  return { aspirationId: choice.aspirationId, taskId: choice.taskId, taskLinkMode: choice.taskId ? "manual" as const : "none" as const };
}
