import type { ISODate, StartAction, Task } from "./types";

/**
 * 福格：做了最小版本就算成功，后面继续是额外加分。
 * 项目任务的完成标准不变，但"启动"本身单独算一次赢，并且当场给反馈。
 */

/** 一个任务上所有最小启动（任务级 + 各步骤）；迁移到步骤上的任务级启动不重复计。 */
function startActionsOf(task: Task): StartAction[] {
  const steps = task.subtasks ?? [];
  const stepActions = steps.flatMap((step) => (step.startAction ? [step.startAction] : []));
  const own = task.startAction;
  const duplicated = own?.targetStepId && steps.some((step) => step.id === own.targetStepId && step.startAction);
  return own && !duplicated ? [own, ...stepActions] : stepActions;
}

/** 这次更新里刚被标成"已启动"的那一条；没有就返回 undefined。 */
export function newlyStartedAction(before: Task, after: Task): StartAction | undefined {
  const done = new Set(startActionsOf(before).filter((action) => action.done).map((action) => action.title + "\u0000" + (action.targetStepId ?? "")));
  return startActionsOf(after).find((action) => action.done && !done.has(action.title + "\u0000" + (action.targetStepId ?? "")));
}

/** 某一天已经赢下的启动次数。 */
export function startWinsOn(date: ISODate, tasks: Task[]): number {
  return tasks
    .filter((task) => task.date === date)
    .reduce((sum, task) => sum + startActionsOf(task).filter((action) => action.done).length, 0);
}

/** 任务还没完成、但至少启动过一次——日视图上给一个"已启动"的小标记。 */
export function hasStartWin(task: Task): boolean {
  return task.status !== "done" && startActionsOf(task).some((action) => action.done);
}
