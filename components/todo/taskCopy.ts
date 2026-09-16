import type { ISODate, StartAction, Task } from "./types";

export function validCopyDate(value: string): value is ISODate {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.getTime()) && date.getFullYear() === Number(value.slice(0, 4)) &&
    date.getMonth() + 1 === Number(value.slice(5, 7)) && date.getDate() === Number(value.slice(8, 10));
}

/** Independent execution copies: retain the user's progress, never duplicate logs or notes. */
export function copyTaskToDates(source: Task, dates: ISODate[], makeId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`): Task[] {
  return [...new Set(dates)].filter(date => validCopyDate(date) && date !== source.date).sort().map(date => {
    const stepIds = new Map(source.subtasks?.map(step => [step.id, `st-copy-${makeId()}`]));
    function copyStart(action?: StartAction, ownStepId?: string): StartAction | undefined {
      return action ? { ...action, targetStepId: ownStepId ?? (action.targetStepId ? stepIds.get(action.targetStepId) : undefined) } : undefined;
    }
    return {
      id: `t-copy-${makeId()}`, title: source.title, date, status: "todo",
      aspirationId: source.aspirationId, resultId: source.resultId,
      sourceHabitId: source.sourceHabitId, sourceBehaviorId: source.sourceBehaviorId,
      sourceTemplateId: source.sourceTemplateId, sourceTemplateItemId: source.sourceTemplateItemId,
      startTime: source.startTime, endTime: source.endTime, targetMinutes: source.targetMinutes,
      priority: source.priority,
      tag: source.tag === "已完成" || source.tag === "进行中" ? undefined : source.tag,
      progress: source.progress ?? (source.status === "done" && !source.targetMinutes ? 100 : undefined),
      subtasks: source.subtasks?.map(step => ({ ...step, id: stepIds.get(step.id)!, startAction: copyStart(step.startAction, stepIds.get(step.id)) })),
      startAction: copyStart(source.startAction),
    };
  });
}
