import type { Aspiration, TimeEntry } from "./types";

export type EntryHistoryChoice = {
  title: string;
  aspirationId?: string;
  goalLabel: string;
};

/** 按最近发生的顺序去重；同名但不同目标的事项保留为不同选项。 */
export function buildEntryHistory(entries: TimeEntry[], goals: Aspiration[]): EntryHistoryChoice[] {
  const seen = new Set<string>();
  return entries.map((entry, index) => ({ entry, index }))
    .sort((a, b) => b.entry.date.localeCompare(a.entry.date)
      || (b.entry.startTime ?? "").localeCompare(a.entry.startTime ?? "") || b.index - a.index)
    .flatMap(({ entry }) => {
      const title = entry.title.trim();
      const key = JSON.stringify([title, entry.aspirationId ?? null]);
      if (!title || seen.has(key)) return [];
      seen.add(key);
      const goal = goals.find((g) => g.id === entry.aspirationId);
      return [{
        title,
        aspirationId: entry.aspirationId,
        goalLabel: goal ? `${goal.title}${goal.archived ? "（已归档）" : ""}`
          : entry.aspirationId ? "原目标已删除" : "未归属目标",
      }];
    });
}

/** 复用归属快照，不复用历史任务、日期、时长或完成状态。 */
export function historyEntryFields(choice: Pick<EntryHistoryChoice, "aspirationId">) {
  return { aspirationId: choice.aspirationId, taskId: undefined, taskLinkMode: "none" as const };
}
