import type { BehaviorCard, GoalResult, ISODate, Task, TimeEntry } from "./types";

/**
 * 「目标」（底层仍是 GoalResult，原来叫关键结果）= 有终点的一件大事。
 * 它的计划就是一张**有顺序的清单**，进度 = 做完几件 / 一共几件。
 * 清单里的事是 AND（缺一不可），所以只排先后、不打分——打分只用于挑习惯（OR）。
 *
 * 清单从已有数据推出来，不另存一份：
 * - 挂在这个目标下的一次性/成果类推进项（BehaviorCard）——提前安排好的那部分
 * - 日视图里直接建、在详情里指到这个目标的任务——同名的算同一件事分几次做
 * 从习惯、可重复行为排出来的任务不算：它们是维持，不是推进到终点。
 */
export type GoalItem = {
  /** 稳定的排序 key：推进项用 behavior id，直接建的任务用 `task:标题`。 */
  key: string;
  title: string;
  behaviorId?: string;
  tasks: Task[];
  done: boolean;
  /** 最后一次完成的时刻；老数据没有时间戳时为 undefined。 */
  completedAt?: number;
  /** 最早排到的日期（未完成的优先）；没排就是 undefined。 */
  date?: ISODate;
  stepCount: number;
};

const ITEM_TYPES = new Set<BehaviorCard["type"]>(["onetime", "outcome"]);

export function isGoalItemBehavior(card: BehaviorCard): boolean {
  return ITEM_TYPES.has(card.type);
}

/**
 * 这是「目标」（要达成）还是「状态」（要保持）。用户指定过就听用户的；
 * 老 KR 按下面挂了什么推断：有一次性/成果类的事 → 目标；只有可重复行为 → 状态。
 * 从模板套出来的例行任务（起床、早饭）不参与判断——它们不说明这是个有终点的事。
 */
export function resultKind(result: GoalResult, behaviors: BehaviorCard[]): "goal" | "state" {
  if (result.kind) return result.kind;
  if (result.status === "done" || result.itemOrder?.length) return "goal";
  const mine = behaviors.filter((card) => card.resultId === result.id && !card.archived);
  if (mine.some(isGoalItemBehavior)) return "goal";
  if (mine.some((card) => card.type === "habit" || card.type === "stop")) return "state";
  return "goal";
}

function itemFromTasks(key: string, title: string, linked: Task[], behaviorId?: string, stepCount = 0): GoalItem {
  const done = linked.length > 0 && linked.every((task) => task.status === "done");
  const stamps = linked.map((task) => task.completedAt).filter((stamp): stamp is number => stamp !== undefined);
  const pending = linked.filter((task) => task.status !== "done");
  const dates = (pending.length ? pending : linked).map((task) => task.date).sort();
  return {
    key, title, behaviorId, tasks: linked, done,
    completedAt: done && stamps.length ? Math.max(...stamps) : undefined,
    date: dates[0],
    stepCount: stepCount || Math.max(0, ...linked.map((task) => task.subtasks?.length ?? 0)),
  };
}

export function goalItems(goal: GoalResult, behaviors: BehaviorCard[], tasks: Task[]): GoalItem[] {
  const repeatable = new Set(behaviors.filter((card) => !isGoalItemBehavior(card)).map((card) => card.id));
  const itemCards = behaviors.filter((card) => card.resultId === goal.id && !card.archived && isGoalItemBehavior(card));
  const claimed = new Set<string>();
  const items: GoalItem[] = itemCards.map((card) => {
    const linked = tasks.filter((task) => task.id === card.taskId || task.sourceBehaviorId === card.id);
    linked.forEach((task) => claimed.add(task.id));
    return itemFromTasks(card.id, card.text, linked, card.id, card.steps?.length ?? 0);
  });

  const direct = new Map<string, Task[]>();
  for (const task of tasks) {
    if (task.resultId !== goal.id || claimed.has(task.id) || task.sourceHabitId) continue;
    if (task.sourceBehaviorId && repeatable.has(task.sourceBehaviorId)) continue;
    const title = task.title.trim();
    direct.set(title, [...(direct.get(title) ?? []), task]);
  }
  for (const [title, linked] of direct) items.push(itemFromTasks(`task:${title}`, title, linked));

  // 用户拖过的按拖的顺序；没拖过的：提前安排的推进项按创建先后在前，直接建的任务按日期在后。
  const order = new Map((goal.itemOrder ?? []).map((key, index) => [key, index]));
  const createdAt = new Map(itemCards.map((card) => [card.id, card.createdAt]));
  return items.sort((a, b) => {
    const oa = order.get(a.key), ob = order.get(b.key);
    if (oa !== undefined || ob !== undefined) return (oa ?? Infinity) - (ob ?? Infinity);
    if (a.behaviorId && b.behaviorId) return (createdAt.get(a.behaviorId) ?? 0) - (createdAt.get(b.behaviorId) ?? 0);
    if (a.behaviorId || b.behaviorId) return a.behaviorId ? -1 : 1;
    return (a.date ?? "").localeCompare(b.date ?? "");
  });
}

export type GoalProgress = { done: number; total: number; next?: GoalItem };

export function goalProgress(items: GoalItem[]): GoalProgress {
  return { done: items.filter((item) => item.done).length, total: items.length, next: items.find((item) => !item.done) };
}

/** 拖动后的新顺序：把 moving 放到 target 前/后。返回完整 key 列表，写回 GoalResult.itemOrder。 */
export function reorderGoalItems(items: GoalItem[], moving: string, target: string, edge: "before" | "after"): string[] {
  const keys = items.map((item) => item.key).filter((key) => key !== moving);
  const at = keys.indexOf(target);
  if (at < 0 || moving === target) return items.map((item) => item.key);
  keys.splice(at + (edge === "after" ? 1 : 0), 0, moving);
  return keys;
}

/** 结项复盘：全部从已有数据算，用户只可选填一句话。 */
export type GoalRetro = {
  startedAt: number;
  endedAt?: number;
  days: number;
  minutes: number;
  timeline: { title: string; at?: number; date?: ISODate; approximate: boolean }[];
};

export function goalRetro(goal: GoalResult, items: GoalItem[], entries: TimeEntry[], behaviors: BehaviorCard[]): GoalRetro {
  const taskIds = new Set(items.flatMap((item) => item.tasks.map((task) => task.id)));
  const minutes = entries.reduce((sum, entry) => sum + (entry.taskId && taskIds.has(entry.taskId) ? entry.minutes : 0), 0);
  const starts = [goal.createdAt, ...items.map((item) => behaviors.find((card) => card.id === item.behaviorId)?.createdAt ?? Infinity)];
  // 只认像样的时间戳（2001 年以后）；异常的旧数据别把"用了几天"算成几万天。
  const startedAt = Math.min(...starts.filter((at) => Number.isFinite(at) && at > 1e12));
  const timeline = items
    .filter((item) => item.done)
    .map((item) => ({ title: item.title, at: item.completedAt, date: item.tasks.map((task) => task.date).sort().at(-1), approximate: item.completedAt === undefined }))
    .sort((a, b) => (a.at ?? Date.parse(a.date ?? "")) - (b.at ?? Date.parse(b.date ?? "")));
  const lastStamp = timeline.reduce<number | undefined>((max, row) => {
    const at = row.at ?? (row.date ? Date.parse(`${row.date}T12:00:00`) : undefined);
    return at !== undefined && (max === undefined || at > max) ? at : max;
  }, undefined);
  const endedAt = goal.doneAt ?? lastStamp;
  const days = Math.max(1, Math.round(((endedAt ?? Date.now()) - startedAt) / 86400000) + 1);
  return { startedAt, endedAt, days, minutes, timeline };
}
