import type { BehaviorCard } from "./types";
import { needsBreakdown } from "./behavior";

/**
 * 一条行为只可能有两种毛病，**一行只报一个**：
 *
 *   action    这还不是行为   → 「我想变自信」，没有动作可做
 *   endpoint  这行为没边界   → 「研究一下竞品」，不知道做到哪算完
 *
 * 曾经有五种（还判过缺时机 timing、要判断 decision、太费力 effort），砍掉了三种，原因各不同：
 *
 * - **timing 缺锚点**：这事该在习惯表里问，不该在焦点地图上问——
 *   一条行为还没成为习惯的时候，问它"什么时候做"没有意义。
 *   而且"有没有锚点"是看 `Habit.anchor` 字段有没有值，**根本不需要 AI**，也就不会误判
 * - **decision 要当场判断**：一句话改不掉它。你之所以中途要停下来想，
 *   是因为这句话里裹着好几个动作——那是「拆解」的活（任务详情页），不是改写的活
 * - **effort 太费力**：费不费力只有你自己知道。往简单了设计、或者拆开做，你自己来就行
 *
 * 砍到两种的直接原因是**误报太多，一直跳感叹号**。而且踩过一个自相矛盾的坑：
 * 判定那边把「研究/查/了解」当典型词抓人，改写那边的铁律又要求「动作不许换」，
 * 于是 AI 自己改写出来的「研究一个竞品的官网」被 AI 自己拦下来，
 * 理由还写着"研究完一个竞品就结束"——判决和理由互相打脸。
 * 现在判定只看**有没有边界**（数量/范围/时长/痕迹），不看动词。
 */
export type BlockerKind = "action" | "endpoint";

export function blockerOf(b: BehaviorCard): BlockerKind | null {
  // 还不是行为——缺的是动作本身，别的都不用提
  if (needsBreakdown(b.type)) return "action";
  // hasDecision 是老字段，等价于 endpoint
  if (b.blocker === "endpoint" || (!b.blocker && b.hasDecision)) return "endpoint";
  return null;
}

/** 提示文案 + 该按哪个修复按钮 */
export const BLOCKER_INFO: Record<
  BlockerKind,
  { label: string; hint: string; action: "breakdown" | "concrete" }
> = {
  action: {
    label: "这还不是行为",
    hint: "没有可以直接做的动作，得先拆成行为",
    action: "breakdown",
  },
  endpoint: {
    label: "没有边界",
    hint: "做到什么程度算完？给它一个数量、范围、时长，或者要求留下点痕迹",
    action: "concrete",
  },
};
