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

/** 可重复行为（habit + stop） */
export function isRepeatable(type: BehaviorType): boolean {
  return type === "habit" || type === "stop";
}

/**
 * 能上焦点地图的：可重复行为 + 一次性任务。
 * 一次性任务也要排——"又好做又有效"的该安排，"又难又没用"的就别做了，
 * 筛选逻辑和可重复行为一模一样，只是出口不同（排到某天 vs 加入习惯表）。
 * 愿望/成果执行不了，不上图。
 */
export function isActionable(type: BehaviorType): boolean {
  return type === "habit" || type === "stop" || type === "onetime";
}

// ===== 焦点地图 =====
// 两根滑块，两轴各存 0-100（一轮只排一个维度）
const AXIS_MID = 50;

/**
 * 黄金行为之间的优先级：影响力稍重要一些，但“能做到”仍占很大比重。
 * 两轴按 60/40 加权；两根滑块都评完才参与综合排序，避免半成品分数误排到前面。
 * “黄金行为”本身仍要求两轴都过 50，权重只影响右上象限内部的先后。
 */
export function goldenScore(b: BehaviorCard): number {
  if (b.impact == null || b.feasibility == null) return 0;
  return b.impact * 0.6 + b.feasibility * 0.4;
}

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

// 一看就知道要花整段时间的事，进习惯表时按"时长型"处理——
// 它的次数和分钟数直接从时间台账读，不要求你打第二次卡。
// 注意：不能把"分钟/小时"当信号——"睡前1小时调暗灯光"里的"1小时"说的是
// 什么时候做，不是做多久，那条其实是发生型。猜错了用户能在习惯表里一键改。
const DURATION_HINTS = [
  "看书", "读书", "阅读", "学习", "复习", "背单词", "刷题", "做题", "练琴", "练习",
  "跑步", "健身", "锻炼", "冥想", "打坐", "剪辑", "复盘", "养号", "运营", "写作", "写代码",
];

/** 猜这条行为该按时长记还是按次数记（进习惯表时用，用户之后可以改） */
export function guessMeasure(text: string): "count" | "duration" {
  const t = text.trim();
  return DURATION_HINTS.some((k) => t.includes(k)) ? "duration" : "count";
}

/** 待判定的条目（用户手动改判过的不再动） */
export function pendingJudgement(cards: BehaviorCard[]): BehaviorCard[] {
  return cards.filter((c) => c.type === "unsorted" && c.typeSource !== "user");
}
