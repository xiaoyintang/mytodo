// 目标（Aspiration）的通用工具：配色 + 主线读写
// 「主线」不是新实体，就是 DayPlan 里挂了哪几个目标 id。

import type { Aspiration, DayPlan, ISODate } from "./types";

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

/** 某天的主线目标（按目标列表顺序返回，保证颜色和顺序稳定） */
export function mainlinesOf(
  date: ISODate,
  plans: Record<string, DayPlan>,
  aspirations: Aspiration[],
): Aspiration[] {
  const ids = plans[date]?.primaryAspirationIds ?? [];
  return aspirations.filter((a) => ids.includes(a.id));
}

/** 这个目标本周被排成主线的天数（用于额度条） */
export function weeklyMainlineDays(
  aspirationId: string,
  weekDates: ISODate[],
  plans: Record<string, DayPlan>,
): number {
  return weekDates.filter((d) => plans[d]?.primaryAspirationIds?.includes(aspirationId)).length;
}
