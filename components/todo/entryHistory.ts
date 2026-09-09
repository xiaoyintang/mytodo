import type { Aspiration, ISODate, Task, TimeEntry } from "./types";

export type EntryHistoryChoice = {
  title: string;
  aspirationId?: string;
  taskId?: string;
  taskLabel?: string;
  goalLabel: string;
};

/** 只展示今天做过的事项；同名但计入不同任务或目标的事项分别保留。 */
export function buildEntryHistory(entries: TimeEntry[], goals: Aspiration[], tasks: Task[], today: ISODate): EntryHistoryChoice[] {
  const seen = new Set<string>();
  return entries.map((entry, index) => ({ entry, index })).filter(({ entry }) => entry.date === today)
    .sort((a, b) => b.entry.date.localeCompare(a.entry.date)
      || (b.entry.startTime ?? "").localeCompare(a.entry.startTime ?? "") || b.index - a.index)
    .flatMap(({ entry }) => {
      const title = entry.title.trim();
      const task = tasks.find((item) => item.id === entry.taskId);
      const key = JSON.stringify([title, entry.aspirationId ?? null, task?.id ?? null]);
      if (!title || seen.has(key)) return [];
      seen.add(key);
      const goal = goals.find((g) => g.id === entry.aspirationId);
      return [{
        title,
        aspirationId: entry.aspirationId,
        taskId: task?.id,
        taskLabel: task?.title,
        goalLabel: goal ? `${goal.title}${goal.archived ? "（已归档）" : ""}`
          : entry.aspirationId ? "原目标已删除" : "未归属目标",
      }];
    });
}

/** 用户明确选择沿用该事项的目标和任务；不复用日期、时长或完成状态。 */
export function historyEntryFields(choice: Pick<EntryHistoryChoice, "aspirationId" | "taskId">) {
  return { aspirationId: choice.aspirationId, taskId: choice.taskId, taskLinkMode: choice.taskId ? "manual" as const : "none" as const };
}
