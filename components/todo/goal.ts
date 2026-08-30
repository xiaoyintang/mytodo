// 目标（Aspiration）的通用工具：配色 + 主线读写
// 「主线」不是新实体，就是 DayPlan 里挂了哪几个目标 id。

import type { Aspiration, DayPlan, GoalResult, ISODate } from "./types";

/** 有关键结果时，焦点地图中“仍直接服务目标”的行为分组。 */
export const UNASSIGNED_RESULT_ID = "__unassigned__";

/** 目标色板。旧数据没存 color 时按序号兜底，不用做数据迁移 */
export const GOAL_COLORS = [
  "#2563EB", // 蓝
  "#EA580C", // 橙
  "#16A34A", // 绿
  "#7C3AED", // 紫
  "#DC2626", // 红
  "#0891B2", // 青
  "#CA8A04", // 金
  "#DB2777", // 粉
];

export function goalColor(a: Aspiration | undefined, index = 0): string {
  return a?.color ?? GOAL_COLORS[index % GOAL_COLORS.length];
}

/** 给新目标挑一个还没被用掉的颜色 */
export function nextGoalColor(existing: Aspiration[]): string {
  const used = new Set(existing.map((a, i) => a.color ?? GOAL_COLORS[i % GOAL_COLORS.length]));
  return GOAL_COLORS.find((c) => !used.has(c)) ?? GOAL_COLORS[existing.length % GOAL_COLORS.length];
}

/**
 * 关键结果的显式优先级。只要用户排过一次，已排项就按 order 展示；
 * 后来新加、还没排过的项自然落在末尾。老数据完全没有 order 时仍按创建顺序。
 */
export function sortGoalResults(results: GoalResult[]): GoalResult[] {
  const sourceIndex = new Map(results.map((result, index) => [result.id, index]));
  return [...results].sort((a, b) => {
    const aOrdered = Number.isFinite(a.order);
    const bOrdered = Number.isFinite(b.order);
    if (aOrdered !== bOrdered) return aOrdered ? -1 : 1;
    if (aOrdered && bOrdered && a.order !== b.order) return (a.order ?? 0) - (b.order ?? 0);
    return a.createdAt - b.createdAt ||
      (sourceIndex.get(a.id) ?? 0) - (sourceIndex.get(b.id) ?? 0);
  });
}

/** 某天的主线目标（按目标列表顺序返回，保证颜色和顺序稳定） */
export function mainlinesOf(
  date: ISODate,
  plans: Record<string, DayPlan>,
  aspirations: Aspiration[],
): Aspiration[] {
  const ids = plans[date]?.primaryAspirationIds ?? [];
  // 主线是当天真正要注意的焦点：归档目标退出，最多只突出优先级最高的 3 个。
  return aspirations.filter((a) => !a.archived && ids.includes(a.id)).slice(0, 3);
}

/** 这个目标本周被排成主线的天数（用于额度条） */
export function weeklyMainlineDays(
  aspirationId: string,
  weekDates: ISODate[],
  plans: Record<string, DayPlan>,
): number {
  return weekDates.filter((d) => plans[d]?.primaryAspirationIds?.includes(aspirationId)).length;
}
