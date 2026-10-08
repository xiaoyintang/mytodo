import type { ISODate, Task } from "./types";
import { templateItemAlreadyExists } from "./taskTemplate";

/** Local undo receipts contain only tasks actually created by this application. */
export type TemplateBatch = {
  id: string;
  name: string;
  date: ISODate;
  tasks: Task[];
  removed?: Task[];
  notice?: string;
};

export function undoTemplateBatch(batch: TemplateBatch, tasks: Task[], protectedIds: Set<string>) {
  const originals = new Map(batch.tasks.map(task => [task.id, task]));
  const removed = tasks.filter(task => originals.has(task.id) && !protectedIds.has(task.id)
    && task.status === "todo" && JSON.stringify(task) === JSON.stringify(originals.get(task.id)));
  const ids = new Set(removed.map(task => task.id));
  const kept = tasks.filter(task => originals.has(task.id) && !ids.has(task.id)).length;
  return {
    tasks: tasks.filter(task => !ids.has(task.id)),
    batch: { ...batch, removed,
      notice: `已撤回 ${removed.length} 项${kept ? `，保留 ${kept} 项已修改、已开始或有关联的任务` : ""}` },
  };
}

export function restoreTemplateBatch(batch: TemplateBatch, tasks: Task[]) {
  const next = [...tasks];
  const restored: Task[] = [];
  for (const task of batch.removed ?? []) {
    // Do not resurrect a duplicate if the template was applied again after undo.
    if (next.some(current => current.id === task.id) || templateItemAlreadyExists(
      { ...task, id: task.sourceTemplateItemId ?? task.id }, task.date, next,
    )) continue;
    restored.push(task);
    next.push(task);
  }
  return { tasks: next, batch: { ...batch, tasks: restored, removed: undefined,
    notice: `已恢复 ${restored.length} 项${restored.length < (batch.removed?.length ?? 0) ? "，跳过已存在的任务" : ""}` } };
}
