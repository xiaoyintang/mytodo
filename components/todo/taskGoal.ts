import type { BehaviorCard, GoalResult, Habit, Task } from "@/components/todo/types";

/**
 * 新任务会直接保存 resultId；旧数据再从来源行为/习惯补推一次。
 * 用户在任务详情里手动改过归属时，以任务自己的选择为准。
 */
export function resolveTaskGoalResult(
  task: Task,
  goalResults: GoalResult[],
  behaviors: BehaviorCard[],
  habits: Habit[],
): GoalResult | undefined {
  if (!task.aspirationId) return undefined;

  const directBehavior = behaviors.find((behavior) => behavior.taskId === task.id);
  const sourceHabit = task.sourceHabitId
    ? habits.find((habit) => habit.id === task.sourceHabitId)
    : undefined;
  const habitBehavior = sourceHabit?.behaviorId
    ? behaviors.find((behavior) => behavior.id === sourceHabit.behaviorId)
    : undefined;
  const resultId = task.resultId ?? directBehavior?.resultId ?? habitBehavior?.resultId;

  return goalResults.find(
    (result) => result.aspirationId === task.aspirationId && result.id === resultId,
  );
}
