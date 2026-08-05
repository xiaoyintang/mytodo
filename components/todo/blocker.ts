import type { BehaviorCard } from "./types";
import { needsBreakdown } from "./behavior";

export type BlockerKind = "action" | "timing" | "decision" | "endpoint" | "effort";

/**
 * 这条为什么不好"无脑做"。**一行只报一个**，按三个时刻取最早坏掉的那个：
 *
 *   ① 起点  现在就能动手吗？   → action（还不是行为）/ timing（没说什么时候做）
 *   ② 过程  中间会停下来想吗？ → decision（要判断）/ effort（要意志力）
 *   ③ 终点  做完了我知道吗？   → endpoint（没有停止条件）
 *
 * 为什么只报一个：修好早的往往顺手把晚的也修了。愿望本来就没终点，
 * 同时喊"这是愿望"和"没终点"只是在吵。
 */
export function blockerOf(b: BehaviorCard): BlockerKind | null {
  // ① 还不是行为——缺的是动作本身，别的都不用提
  if (needsBreakdown(b.type)) return "action";
  // ① 可重复行为没锚点就永远想不起来做（一次性任务靠排期给时机，不算缺）
  if (b.blocker === "timing") return "timing";
  // ② / ③（hasDecision 是老字段，等价于 endpoint）
  if (b.blocker === "decision") return "decision";
  if (b.blocker === "endpoint" || (!b.blocker && b.hasDecision)) return "endpoint";
  // ② 要意志力：这个只有你自己知道，所以看你拖的可行性，不问 AI
  if ((b.impact ?? 0) >= 50 && b.feasibility != null && b.feasibility < 50) return "effort";
  return null;
}

/** 提示文案 + 该按哪个修复按钮 */
export const BLOCKER_INFO: Record<
  BlockerKind,
  { moment: string; label: string; hint: string; action: "breakdown" | "concrete" | "shrink" | null }
> = {
  action: {
    moment: "① 起点",
    label: "缺动作",
    hint: "这条执行不了，得先拆成能做的行为",
    action: "breakdown",
  },
  timing: {
    moment: "① 起点",
    label: "缺时机",
    hint: "没说什么时候做——加进习惯表后配个锚点（在我 ___ 之后）",
    action: "concrete",
  },
  decision: {
    moment: "② 过程",
    label: "要当场判断",
    hint: "做到一半得停下来想，改写成不用动脑的版本",
    action: "concrete",
  },
  endpoint: {
    moment: "③ 终点",
    label: "缺终点",
    hint: "做完了不知道算不算做完",
    action: "concrete",
  },
  effort: {
    moment: "② 过程",
    label: "太费力",
    hint: "影响力够高但你做不到——别删，改小它",
    action: "shrink",
  },
};
