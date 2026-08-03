// 习惯实验室的小工具：标签文案 + AI 不可用时的兜底判断

import type { BehaviorType } from "./types";

export const BEHAVIOR_TYPE_LABEL: Record<BehaviorType, string> = {
  habit: "新习惯",
  onetime: "一次性",
  stop: "要戒掉",
};

export const BEHAVIOR_TYPE_STYLE: Record<BehaviorType, { bg: string; border: string; text: string }> = {
  habit: { bg: "#EFF6FF", border: "#BFDBFE", text: "#2563EB" },
  onetime: { bg: "#EEF2FF", border: "#C7D2FE", text: "#4F46E5" },
  stop: { bg: "#FEF2F2", border: "#FECACA", text: "#DC2626" },
};

// 福格式行为的三种排列顺序（新习惯最常用，排最前）
export const BEHAVIOR_TYPE_ORDER: BehaviorType[] = ["habit", "onetime", "stop"];

// "掐一把测试"过不了的典型说法：这些词描述的是状态/期望，不是能立刻做出来的动作
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
