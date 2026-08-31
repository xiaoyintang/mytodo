import type {
  ISODate,
  StartAction,
  SubTask,
  Task,
  TaskTemplate,
  TaskTemplateItem,
} from "./types";

function cleanStartAction(
  action: StartAction | undefined,
  targetId?: string,
): StartAction | undefined {
  if (!action?.title.trim()) return undefined;
  return {
    kind: "minimum",
    title: action.title.trim(),
    targetStepId: targetId,
    done: false,
  };
}

/** 把已经排好的一天保存成纯结构模板；历史完成状态绝不带进模板。 */
export function tasksToTemplateItems(tasks: Task[]): TaskTemplateItem[] {
  const stamp = Date.now();
  return tasks.map((task, taskIndex) => {
    const itemId = `tti-${stamp}-${taskIndex}-${Math.random().toString(36).slice(2, 6)}`;
    const stepIdMap = new Map<string, string>();
    task.subtasks?.forEach((step, stepIndex) => {
      stepIdMap.set(step.id, `tts-${itemId}-${stepIndex}`);
    });
    const subtasks = task.subtasks?.map((step) => {
      const id = stepIdMap.get(step.id)!;
      return {
        id,
        title: step.title,
        done: false,
        sourceBehaviorStepId: step.sourceBehaviorStepId,
        startAction: cleanStartAction(step.startAction, id),
      } satisfies SubTask;
    });
    return {
      id: itemId,
      title: task.title,
      aspirationId: task.aspirationId,
      resultId: task.resultId,
      sourceHabitId: task.sourceHabitId,
      sourceBehaviorId: task.sourceBehaviorId,
      startTime: task.startTime,
      endTime: task.endTime,
      priority: task.priority,
      tag: task.tag,
      targetMinutes: task.targetMinutes,
      subtasks: subtasks?.length ? subtasks : undefined,
      startAction: cleanStartAction(
        task.startAction,
        task.startAction?.targetStepId
          ? stepIdMap.get(task.startAction.targetStepId)
          : undefined,
      ),
    };
  });
}

/**
 * 精确来源优先；手动建过同名同时间任务时也视为已经存在，
 * 避免第一次套用模板就把当天计划复制两份。
 */
export function templateItemAlreadyExists(
  item: TaskTemplateItem,
  date: ISODate,
  tasks: Task[],
): boolean {
  const title = item.title.trim();
  return tasks.some(
    (task) =>
      task.date === date &&
      (task.sourceTemplateItemId === item.id ||
        (task.title.trim() === title &&
          (task.startTime ?? "") === (item.startTime ?? "") &&
          (task.endTime ?? "") === (item.endTime ?? ""))),
  );
}

/** 套用模板时复制出真正的 Task；每个步骤也获得自己的完成状态和 id。 */
export function instantiateTemplateTasks(
  template: TaskTemplate,
  itemIds: string[],
  date: ISODate,
  existingTasks: Task[],
): { tasks: Task[]; skipped: number } {
  const selected = new Set(itemIds);
  const stamp = Date.now();
  let skipped = 0;
  const tasks: Task[] = [];

  template.items.forEach((item, itemIndex) => {
    if (!selected.has(item.id)) return;
    if (templateItemAlreadyExists(item, date, existingTasks)) {
      skipped += 1;
      return;
    }

    const stepIdMap = new Map<string, string>();
    item.subtasks?.forEach((step, stepIndex) => {
      stepIdMap.set(
        step.id,
        `st-template-${stamp}-${itemIndex}-${stepIndex}-${Math.random().toString(36).slice(2, 6)}`,
      );
    });
    const subtasks = item.subtasks?.map((step) => {
      const id = stepIdMap.get(step.id)!;
      return {
        id,
        title: step.title,
        done: false,
        sourceBehaviorStepId: step.sourceBehaviorStepId,
        startAction: cleanStartAction(step.startAction, id),
      } satisfies SubTask;
    });

    tasks.push({
      id: `t-template-${stamp}-${itemIndex}-${Math.random().toString(36).slice(2, 7)}`,
      title: item.title,
      date,
      status: "todo",
      aspirationId: item.aspirationId,
      resultId: item.resultId,
      sourceHabitId: item.sourceHabitId,
      sourceBehaviorId: item.sourceBehaviorId,
      sourceTemplateId: template.id,
      sourceTemplateItemId: item.id,
      startTime: item.startTime,
      endTime: item.endTime,
      priority: item.priority,
      tag: item.tag,
      targetMinutes: item.targetMinutes,
      subtasks: subtasks?.length ? subtasks : undefined,
      startAction: cleanStartAction(
        item.startAction,
        item.startAction?.targetStepId
          ? stepIdMap.get(item.startAction.targetStepId)
          : undefined,
      ),
    });
  });

  return { tasks, skipped };
}
