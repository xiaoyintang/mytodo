import type { SubTask, Task } from "./types";

/**
 * 给任务和步骤记"什么时候完成的"——成长记录和项目复盘都靠它，**而且没法事后补**。
 * 只在"从未完成变成完成"那一刻打时间戳；取消完成就清掉，避免点错留下假记录。
 * 之前就已完成、没有时间戳的老数据保持原样，不猜一个时间。
 * 云同步拉下来的数据**不走这里**（那是别的设备的事实，不是此刻发生的完成）。
 */
function stampOne<T extends { completedAt?: number }>(
  next: T, wasDone: boolean | undefined, previousStamp: number | undefined, isDone: boolean, now: number,
): T {
  if (!isDone) {
    if (next.completedAt === undefined) return next;
    const rest = { ...next };
    delete rest.completedAt;
    return rest;
  }
  if (next.completedAt !== undefined) return next;
  if (wasDone === false) return { ...next, completedAt: now };
  return previousStamp !== undefined ? { ...next, completedAt: previousStamp } : next;
}

function stampSubtasks(next: SubTask[] | undefined, previous: SubTask[] | undefined, now: number): SubTask[] | undefined {
  if (!next) return next;
  const before = new Map((previous ?? []).map((step) => [step.id, step]));
  let changed = false;
  const result = next.map((step) => {
    const old = before.get(step.id);
    const stamped = stampOne(step, old ? old.done : undefined, old?.completedAt, step.done, now);
    if (stamped !== step) changed = true;
    return stamped;
  });
  return changed ? result : next;
}

export function stampCompletion(previous: Task[], next: Task[], now = Date.now()): Task[] {
  const before = new Map(previous.map((task) => [task.id, task]));
  let changed = false;
  const result = next.map((task) => {
    const old = before.get(task.id);
    let stamped = stampOne(task, old ? old.status === "done" : undefined, old?.completedAt, task.status === "done", now);
    const subtasks = stampSubtasks(stamped.subtasks, old?.subtasks, now);
    if (subtasks !== stamped.subtasks) stamped = { ...stamped, subtasks };
    if (stamped !== task) changed = true;
    return stamped;
  });
  return changed ? result : next;
}
