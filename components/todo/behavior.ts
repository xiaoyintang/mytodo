// 习惯实验室的小工具：类型文案/配色 + AI 不可用时的兜底判断

import type { BehaviorCard, BehaviorType } from "./types";

export const TYPE_LABEL: Record<BehaviorType, string> = {
  unsorted: "未判定",
  aspiration: "愿望",
  outcome: "成果",
  onetime: "一次性任务",
  habit: "可重复行为",
  stop: "要戒掉",
};

// 一句话解释，改判时显示，省得每次回想定义
export const TYPE_HINT: Record<BehaviorType, string> = {
  unsorted: "还没判定",
  aspiration: "抽象方向，执行不了",
  outcome: "可衡量的结果，还是执行不了",
  onetime: "做完就不用再做",
  habit: "做完还会一次次再做",
  stop: "要减少或停掉的旧习惯",
};

type Style = { bg: string; border: string; text: string };

export const TYPE_STYLE: Record<BehaviorType, Style> = {
  unsorted: { bg: "#F4F4F5", border: "#E4E4E7", text: "#71717A" },
  aspiration: { bg: "#FEF3C7", border: "#FDE68A", text: "#B45309" },
  outcome: { bg: "#F5F3FF", border: "#DDD6FE", text: "#7C3AED" },
  onetime: { bg: "#EEF2FF", border: "#C7D2FE", text: "#4F46E5" },
  habit: { bg: "#EFF6FF", border: "#BFDBFE", text: "#2563EB" },
  stop: { bg: "#FEF2F2", border: "#FECACA", text: "#DC2626" },
};

/** 改判时可选的五类（"未判定"不给选——那是收集态，不是判定结果） */
export const JUDGED_TYPES: BehaviorType[] = ["habit", "stop", "onetime", "outcome", "aspiration"];

/** 已判定条目的分组展示顺序：能直接用的排前面 */
export const TYPE_ORDER: BehaviorType[] = ["habit", "stop", "onetime", "outcome", "aspiration"];

/** 执行不了、需要继续拆的两类 */
export function needsBreakdown(type: BehaviorType): boolean {
  return type === "aspiration" || type === "outcome";
}

/** 可重复行为（habit + stop）——只有这些进焦点地图 */
export function isRepeatable(type: BehaviorType): boolean {
  return type === "habit" || type === "stop";
}

// ===== 焦点地图 =====
// 两轮二选一，存成 0-100 的坐标（现在只落 25 / 75 两档；以后要加拖拽微调，
// 直接往这两个字段里写连续值即可，不用改数据结构）
export const AXIS_HIGH = 75;
export const AXIS_LOW = 25;
const AXIS_MID = 50;

/** 黄金行为 = 影响力高 且 你真能做到（右上象限）。派生值，不单独存 */
export function isGolden(b: BehaviorCard): boolean {
  return (b.impact ?? 0) >= AXIS_MID && (b.feasibility ?? 0) >= AXIS_MID;
}

export function isHighImpact(b: BehaviorCard): boolean {
  return (b.impact ?? 0) >= AXIS_MID;
}

// "掐一把测试"过不了的典型说法：描述的是状态/期望，不是能立刻做出来的动作
const ASPIRATION_HINTS = [
  "想要", "希望", "更健康", "更好", "变得", "成为", "坚持", "保持", "养成",
  "提高", "改善", "提升", "减少压力", "不再", "少熬夜", "多运动", "多喝水",
];

/** AI 不可用时的粗判：看着像愿望就提醒一句，但不阻止用户收进集群 */
export function looksLikeAspiration(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return ASPIRATION_HINTS.some((k) => t.includes(k));
}

/** 待判定的条目（用户手动改判过的不再动） */
export function pendingJudgement(cards: BehaviorCard[]): BehaviorCard[] {
  return cards.filter((c) => c.type === "unsorted" && c.typeSource !== "user");
}
