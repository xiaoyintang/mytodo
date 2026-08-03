"use client";

import { useState } from "react";
import type { Aspiration, BehaviorCard, BehaviorType, ISODate, Task } from "@/components/todo/types";
import ScheduleOnetime from "@/components/ScheduleOnetime";
import { callBehaviorAPI, toPendingItems, type PendingItem } from "@/components/todo/behaviorApi";
import { TYPE_LABEL, TYPE_STYLE, goldenScore, isGolden, isHighImpact } from "@/components/todo/behavior";
import { ArrowLeft, ChevronDown, ChevronUp, RotateCcw, Scissors, Star, Trash2 } from "lucide-react";
import ConfirmDialog from "@/components/ConfirmDialog";

type AxisPatch = { impact?: number; feasibility?: number };
type Step = 1 | 2 | 3;

type Props = {
  aspiration: Aspiration;
  cards: BehaviorCard[]; // 只传可重复行为（habit + stop）
  onSetAxis: (id: string, patch: AxisPatch) => void;
  onResetAxes: () => void;
  onDelete: (id: string) => void;
  /** 改小后替换原行为的文字（保留它在图上的位置） */
  onReplaceText: (id: string, text: string) => void;
  /** 改小时多选的其余版本，作为新候选收进集群 */
  onAddExtra: (items: Array<{ text: string; type: BehaviorType }>) => void;
  /** 一次性任务不进地图（没有"重复"这回事），但要在这儿看得见、能安排 */
  onetimeCards: BehaviorCard[];
  tasks: Task[];
  onSchedule: (cardId: string, title: string, date: ISODate) => void;
  onAddHabit: (card: BehaviorCard) => void;
  habitBehaviorIds: Set<string>;
  onBack: () => void;
};

const STEPS: Array<[Step, string]> = [
  [1, "1 影响力"],
  [2, "2 能不能做到"],
  [3, "结果"],
];

const AXIS_ENDS: Record<"impact" | "feasibility", [string, string, string]> = {
  impact: ["没什么用", "有点用", "关键"],
  feasibility: ["做不到", "费点劲", "轻松"],
};

// 散点图尺寸
const W = 336;
const H = 200;
const PAD = 10;

export default function FocusMapView({
  aspiration,
  cards,
  onSetAxis,
  onResetAxes,
  onDelete,
  onReplaceText,
  onAddExtra,
  onetimeCards,
  tasks,
  onSchedule,
  onAddHabit,
  habitBehaviorIds,
  onBack,
}: Props) {
  const [step, setStep] = useState<Step>(1);
  const [confirmReset, setConfirmReset] = useState(false);
  const [restOpen, setRestOpen] = useState(false);
  // 改小：状态留在这个组件里，保证候选就渲染在被改的那张卡下面
  const [shrinkingId, setShrinkingId] = useState<string | null>(null);
  const [shrink, setShrink] = useState<{ forId: string; items: PendingItem[] } | null>(null);
  const [shrinkNote, setShrinkNote] = useState<string | null>(null);

  async function handleShrink(card: BehaviorCard) {
    if (shrinkingId) return;
    setShrinkingId(card.id);
    setShrink(null);
    setShrinkNote(null);
    const res = await callBehaviorAPI({ mode: "shrink", text: card.text, goal: aspiration.title });
    setShrinkingId(null);
    if (!res.ok) {
      setShrinkNote(res.noKey ? "没配 AI，改小得自己动手：回集群页点文字直接改" : "AI 没连上，稍后再试");
      return;
    }
    const items = toPendingItems(res.data.behaviors);
    if (items.length === 0) {
      setShrinkNote("AI 没给出更小的版本，自己动手改改看");
      return;
    }
    // 默认只选第一条——多选会一次塞进来好几条，和"清单要变短"相反
    setShrink({ forId: card.id, items: items.map((it, i) => ({ ...it, checked: i === 0 })) });
  }

  function applyShrink() {
    if (!shrink) return;
    const picked = shrink.items.filter((i) => i.checked);
    if (picked.length > 0) {
      onReplaceText(shrink.forId, picked[0].text);
      if (picked.length > 1) onAddExtra(picked.slice(1).map(({ text, type }) => ({ text, type })));
      // 可行性被清掉了（旧分是给难版本打的），直接把人送到第 2 轮重拖
      setStep(2);
    }
    setShrink(null);
    setShrinkNote(null);
  }

  // 改小候选：就地渲染在被改的那张卡下面
  function renderShrinkBox(cardId: string) {
    if (shrinkNote && shrinkingId === null && shrink?.forId !== cardId) return null;
    return (
      <div className="w-full flex flex-col gap-2 p-3 rounded-[10px] bg-white border border-[#B45309]">
        <p className="text-[11px] leading-relaxed text-[var(--color-text-secondary)]">
          选一个替换它。福格的标准只有一条：<strong>小到不需要意志力</strong>
        </p>
        {shrink!.items.map((it, i) => (
          <button
            key={i}
            type="button"
            onClick={() =>
              setShrink((p) =>
                p ? { ...p, items: p.items.map((x, j) => (j === i ? { ...x, checked: !x.checked } : x)) } : p,
              )
            }
            className={[
              "w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-colors",
              it.checked ? "bg-[#FFFBEB] border-[#B45309]" : "bg-white border-[var(--color-border)] opacity-60",
            ].join(" ")}
          >
            <span
              className={[
                "w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border",
                it.checked ? "bg-[#B45309] border-[#B45309]" : "border-[var(--color-border)]",
              ].join(" ")}
            >
              {it.checked && <span className="text-white text-[10px] leading-none">✓</span>}
            </span>
            <span className="flex-1 text-[13px] text-[var(--color-text-primary)]">{it.text}</span>
          </button>
        ))}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setShrink(null)}
            className="px-3 py-1.5 text-[12px] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-gray-light)] rounded transition-colors"
          >
            取消
          </button>
          <button
            type="button"
            onClick={applyShrink}
            className="px-4 py-1.5 text-[12px] bg-[#B45309] text-white rounded hover:opacity-90 transition-opacity font-medium"
          >
            换成这个
          </button>
        </div>
      </div>
    );
  }


  const highs = cards.filter(isHighImpact);
  const golden = cards
    .filter(isGolden)
    .slice()
    .sort((a, b) => goldenScore(b) - goldenScore(a));
  const plotted = cards.filter((c) => c.impact != null && c.feasibility != null);

  // 影响力高但做不到（左上）——福格的解法是改小，不是删
  const wantCant = cards.filter((c) => isHighImpact(c) && c.feasibility != null && c.feasibility < 50);
  // 剩下的：影响力一般的 + 还没排完的
  const rest = cards.filter((c) => !isGolden(c) && !wantCant.includes(c));

  const r1Done = cards.filter((c) => c.impact != null).length;
  const r2Done = highs.filter((c) => c.feasibility != null).length;

  // 一行：文字 + 一根滑块。没拖过就是没排，灰着
  function renderRow(b: BehaviorCard, axis: "impact" | "feasibility") {
    const value = axis === "impact" ? b.impact : b.feasibility;
    const placed = value != null;
    const [lo, mid, hi] = AXIS_ENDS[axis];
    const st = TYPE_STYLE[b.type];
    return (
      <div
        key={b.id}
        className={[
          "w-full flex flex-col gap-1 px-3 py-2.5 rounded-[10px] border",
          placed ? "bg-white border-[var(--color-border)]" : "bg-[var(--color-bg-gray-lighter)] border-[var(--color-border)]",
        ].join(" ")}
      >
        <div className="w-full flex items-center gap-2">
          <span className="flex-1 text-[13px] text-[var(--color-text-primary)] leading-snug">
            {b.text}
            {b.type === "stop" && (
              <span className="ml-1 text-[9px]" style={{ color: st.text }}>
                {TYPE_LABEL.stop}
              </span>
            )}
          </span>
          <span
            className={[
              "text-[11px] tabular-nums flex-shrink-0 w-[30px] text-right",
              placed ? "font-semibold text-[var(--color-primary)]" : "text-[var(--color-text-tertiary)]",
            ].join(" ")}
          >
            {placed ? value : "—"}
          </span>
          <button
            type="button"
            onClick={() => onDelete(b.id)}
            className="w-[18px] h-[18px] flex items-center justify-center flex-shrink-0"
            aria-label="删掉这条"
            title="排着排着觉得没用？直接删"
          >
            <Trash2 className="w-[14px] h-[14px] text-[#A1A1AA]" />
          </button>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={value ?? 50}
          onChange={(e) => onSetAxis(b.id, { [axis]: Number(e.target.value) } as AxisPatch)}
          className={[
            "w-full h-[22px] cursor-pointer accent-[var(--color-primary)]",
            placed ? "" : "opacity-45",
          ].join(" ")}
          aria-label={b.text}
        />
        <div className="w-full flex justify-between text-[10px] text-[var(--color-text-tertiary)] -mt-1">
          <span>{lo}</span>
          <span>{mid}</span>
          <span>{hi}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-4">
      <div className="w-full flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="w-8 h-8 rounded-lg border-[1.5px] border-[var(--color-border)] flex items-center justify-center bg-white hover:bg-[var(--color-bg-gray-light)] transition-colors flex-shrink-0"
          aria-label="返回行为集群"
        >
          <ArrowLeft className="w-4 h-4 text-[var(--color-text-secondary)]" />
        </button>
        <span className="text-[17px] font-semibold text-[var(--color-text-primary)]">焦点地图</span>
        <span className="text-[12px] text-[var(--color-text-tertiary)] truncate">{aspiration.title}</span>
      </div>

      <div className="w-full flex gap-1 bg-[var(--color-bg-gray-light)] rounded-[10px] p-1">
        {STEPS.map(([s, label]) => (
          <button
            key={s}
            type="button"
            onClick={() => setStep(s)}
            className={[
              "flex-1 flex items-center justify-center rounded-lg px-2 py-2",
              step === s ? "bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]" : "",
            ].join(" ")}
          >
            <span
              className={[
                "text-[13px]",
                step === s
                  ? "text-[var(--color-text-primary)] font-semibold"
                  : "text-[var(--color-text-secondary)] font-medium",
              ].join(" ")}
            >
              {label}
            </span>
          </button>
        ))}
      </div>

      {step === 1 && (
        <div className="w-full flex flex-col gap-2.5">
          <div className="w-full flex items-center justify-between">
            <span className="text-[13px] text-[var(--color-text-secondary)]">
              对「{aspiration.title}」的推动有多大？
            </span>
            <span className="text-[12px] text-[var(--color-text-tertiary)] tabular-nums flex-shrink-0 ml-2">
              {r1Done}/{cards.length}
            </span>
          </div>
          <p className="text-[11px] text-[var(--color-text-tertiary)]">
            拖一下就算排了，不拖就空着。别纠结绝对数值，重要的是<strong>它们之间的相对位置</strong>
          </p>
          {cards.map((b) => renderRow(b, "impact"))}
          {r1Done > 0 && (
            <button
              type="button"
              onClick={() => setStep(2)}
              className="w-full py-2.5 rounded-[10px] bg-[var(--color-primary)] text-white text-[14px] font-semibold hover:bg-[#1d4ed8] transition-colors"
            >
              下一轮：这 {highs.length} 条能不能做到 →
            </button>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="w-full flex flex-col gap-2.5">
          {highs.length === 0 ? (
            <p className="text-[12px] text-[var(--color-text-secondary)] leading-relaxed">
              还没有影响力过半的行为。先去第 1 轮拖几条——影响力低的反正成不了黄金行为，
              这一轮不问它们，省你的判断。
            </p>
          ) : (
            <>
              <div className="w-full flex items-center justify-between">
                <span className="text-[13px] text-[var(--color-text-secondary)]">
                  能想到一个每天真会发生的时刻，把它挂上去吗？
                </span>
                <span className="text-[12px] text-[var(--color-text-tertiary)] tabular-nums flex-shrink-0 ml-2">
                  {r2Done}/{highs.length}
                </span>
              </div>
              <p className="text-[11px] text-[var(--color-text-tertiary)]">
                只问第 1 轮影响力过半的这几条
              </p>
              {highs.map((b) => renderRow(b, "feasibility"))}
              {r2Done > 0 && (
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="w-full py-2.5 rounded-[10px] bg-[var(--color-primary)] text-white text-[14px] font-semibold hover:bg-[#1d4ed8] transition-colors"
                >
                  看结果 →
                </button>
              )}
            </>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="w-full flex flex-col gap-3">
          <div className="w-full flex items-center justify-between">
            <span className="text-[12px] text-[var(--color-text-tertiary)]">影响力 ↑</span>
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="flex items-center gap-1 text-[12px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
            >
              <RotateCcw className="w-3 h-3" />
              重排
            </button>
          </div>

          {/* 散点图：坐标连续了，画散点才是真的 */}
          <div className="w-full flex justify-center">
            <svg width={W} height={H} className="overflow-visible">
              <rect x={0} y={0} width={W} height={H} rx={10} fill="var(--color-bg-gray-lighter)" />
              {/* 右上象限 = 黄金区 */}
              <rect x={W / 2} y={0} width={W / 2} height={H / 2} rx={0} fill="var(--color-primary-light)" />
              <line x1={W / 2} y1={0} x2={W / 2} y2={H} stroke="var(--color-border)" strokeWidth={1} />
              <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke="var(--color-border)" strokeWidth={1} />
              <text x={W - 6} y={14} textAnchor="end" fontSize={10} fill="var(--color-primary)">
                黄金行为
              </text>

              {plotted.map((b) => {
                const cx = PAD + ((b.feasibility ?? 0) / 100) * (W - PAD * 2);
                const cy = H - PAD - ((b.impact ?? 0) / 100) * (H - PAD * 2);
                const rank = golden.findIndex((g) => g.id === b.id);
                const gold = rank >= 0;
                return (
                  <g key={b.id}>
                    <circle
                      cx={cx}
                      cy={cy}
                      r={gold ? 9 : 5}
                      fill={gold ? "var(--color-primary)" : "#A1A1AA"}
                      opacity={gold ? 1 : 0.6}
                    />
                    {gold && (
                      <text
                        x={cx}
                        y={cy + 3.5}
                        textAnchor="middle"
                        fontSize={10}
                        fontWeight={700}
                        fill="#fff"
                      >
                        {rank + 1}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
          <div className="w-full flex items-center justify-between text-[11px] text-[var(--color-text-tertiary)] px-1">
            <span>← 做不到</span>
            <span>能做到 →</span>
          </div>

          {golden.length > 0 ? (
            <div className="w-full flex flex-col gap-2">
              <span className="flex items-center gap-1 text-[13px] font-semibold text-[var(--color-primary)]">
                <Star className="w-3.5 h-3.5" fill="currentColor" strokeWidth={0} />
                黄金行为 · {golden.length} 条（按优先级排序）
              </span>
              {golden.map((b, i) => {
                const added = habitBehaviorIds.has(b.id);
                return (
                  <div
                    key={b.id}
                    className={[
                      "w-full flex flex-col gap-2 px-3 py-2.5 rounded-[10px] border",
                      i === 0
                        ? "bg-[var(--color-primary-light)] border-[1.5px] border-[var(--color-primary)]"
                        : "bg-white border-[var(--color-border)]",
                    ].join(" ")}
                  >
                    <div className="w-full flex items-center gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-[var(--color-primary)] text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                        {i + 1}
                      </span>
                      <span className="flex-1 text-[13px] text-[var(--color-text-primary)] leading-snug">
                        {b.text}
                      </span>
                      <span className="text-[10px] text-[var(--color-text-tertiary)] tabular-nums flex-shrink-0">
                        {b.impact}/{b.feasibility}
                      </span>
                      <button
                        type="button"
                        onClick={() => onDelete(b.id)}
                        className="w-[18px] h-[18px] flex items-center justify-center flex-shrink-0"
                        aria-label="删掉这条"
                      >
                        <Trash2 className="w-[14px] h-[14px] text-[#A1A1AA]" />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => onAddHabit(b)}
                      disabled={added}
                      className={[
                        "w-full py-2 rounded-lg text-[13px] font-semibold transition-colors",
                        added
                          ? "bg-[var(--color-bg-gray-light)] text-[var(--color-text-tertiary)] cursor-default"
                          : "bg-[var(--color-primary)] text-white hover:bg-[#1d4ed8]",
                      ].join(" ")}
                    >
                      {added ? "已在习惯表里 ✓" : "加入习惯表 →"}
                    </button>
                  </div>
                );
              })}
              <p className="text-[11px] leading-relaxed text-[var(--color-text-secondary)]">
                第 1 条是影响力和可行性都最高的那个，<strong>从它开始</strong>。
                福格建议一次只养 1-3 个，别一口气全上。加进去之后在「习惯」首页配锚点、打卡。
              </p>
            </div>
          ) : (
            <p className="text-[12px] text-[var(--color-text-secondary)] leading-relaxed">
              还没有落进右上角的行为。要么把下面「影响力高但做不到」那些
              <strong>改小到不需要意志力</strong>，要么回集群里再想几条。
            </p>
          )}

          {/* 影响力高但做不到：福格的解法是改小，不是删 */}
          {wantCant.length > 0 && (
            <div className="w-full flex flex-col gap-2 pt-1">
              <span className="text-[13px] font-semibold text-[#B45309]">
                影响力高，但做不到 · {wantCant.length} 条
              </span>
              <p className="text-[11px] leading-relaxed text-[var(--color-text-secondary)]">
                <strong>这些别急着删</strong>——福格的解法是把它改小，小到不需要意志力
                （「读30分钟书」做不到，「读2分钟」就做得到）。改完会自动带你回第 2 轮重拖一次。
              </p>
              {wantCant.map((b) => (
                <div key={b.id} className="w-full flex flex-col gap-1.5">
                  <div className="w-full flex items-center gap-2 px-3 py-2.5 rounded-[10px] bg-[#FFFBEB] border border-[#FDE68A]">
                    <span className="flex-1 text-[13px] text-[var(--color-text-primary)] leading-snug">
                      {b.text}
                    </span>
                    <span className="text-[10px] text-[var(--color-text-tertiary)] tabular-nums flex-shrink-0">
                      {b.impact}/{b.feasibility}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleShrink(b)}
                      disabled={shrinkingId !== null}
                      className="flex items-center gap-1 px-2 py-1 rounded-md border border-[#B45309] text-[11px] font-medium text-[#B45309] hover:bg-[#FEF3C7] transition-colors disabled:opacity-50 flex-shrink-0"
                    >
                      <Scissors className="w-3 h-3" />
                      {shrinkingId === b.id ? "改小中，10 秒左右..." : "改小"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(b.id)}
                      className="w-[18px] h-[18px] flex items-center justify-center flex-shrink-0"
                      aria-label="删掉这条"
                    >
                      <Trash2 className="w-[14px] h-[14px] text-[#A1A1AA]" />
                    </button>
                  </div>
                  {shrink?.forId === b.id && renderShrinkBox(b.id)}
                  {shrinkNote && shrinkingId === null && !shrink && (
                    <p className="text-[11px] text-[var(--color-text-secondary)] px-1">{shrinkNote}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 一次性任务：做完就没了，不该占地图，但得有个出口 */}
          {onetimeCards.length > 0 && (
            <div className="w-full flex flex-col gap-2 pt-1">
              <span className="text-[13px] font-semibold text-[#4F46E5]">
                一次性任务 · {onetimeCards.length} 条
              </span>
              <p className="text-[11px] leading-relaxed text-[var(--color-text-secondary)]">
                这些做完就没了，没有"重复"这回事，所以不上地图。挑个日子做掉，
                <strong>它会直接进日视图</strong>。
              </p>
              {onetimeCards.map((b) => (
                <div
                  key={b.id}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-[10px] bg-[#F8F8FC] border border-[#C7D2FE]"
                >
                  <span className="flex-1 text-[13px] text-[var(--color-text-primary)] leading-snug">
                    {b.text}
                  </span>
                  <ScheduleOnetime card={b} tasks={tasks} onSchedule={onSchedule} />
                  <button
                    type="button"
                    onClick={() => onDelete(b.id)}
                    className="w-[18px] h-[18px] flex items-center justify-center flex-shrink-0"
                    aria-label="删掉这条"
                  >
                    <Trash2 className="w-[14px] h-[14px] text-[#A1A1AA]" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 剩下两类：收起来，主要用途是删掉 */}
          {rest.length > 0 && (
            <div className="w-full flex flex-col gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => setRestOpen((v) => !v)}
                className="w-full flex items-center gap-1 text-[12px] text-[var(--color-text-tertiary)]"
              >
                其他 · {rest.length} 条（影响力一般 / 还没排完）
                {restOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
              {restOpen && (
                <div className="w-full flex flex-col gap-1.5">
                  <p className="text-[11px] text-[var(--color-text-tertiary)]">
                    留着不占地方，觉得没用就删——清单变短才是这一步的意义
                  </p>
                  {rest.map((b) => (
                    <div
                      key={b.id}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-[10px] bg-[var(--color-bg-gray-lighter)] border border-[var(--color-border)]"
                    >
                      <span className="flex-1 text-[12px] text-[var(--color-text-secondary)] leading-snug">
                        {b.text}
                      </span>
                      <span className="text-[10px] text-[var(--color-text-tertiary)] tabular-nums flex-shrink-0">
                        {b.impact ?? "—"}/{b.feasibility ?? "—"}
                      </span>
                      <button
                        type="button"
                        onClick={() => onDelete(b.id)}
                        className="w-[18px] h-[18px] flex items-center justify-center flex-shrink-0"
                        aria-label="删掉这条"
                      >
                        <Trash2 className="w-[14px] h-[14px] text-[#A1A1AA]" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {plotted.length < cards.length && (
            <p className="text-[11px] leading-relaxed text-[var(--color-text-tertiary)]">
              图上是两轮都排过的 {plotted.length} 条。
              另外 {cards.length - plotted.length} 条不在图上：
              {cards.length - r1Done > 0 && `${cards.length - r1Done} 条第 1 轮没排、`}
              影响力没过半的那些第 2 轮不问，所以没有横坐标（想让它们上图，就去第 1 轮把影响力拖过一半）。
            </p>
          )}
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmReset}
        title="重排？"
        description={`会清空这 ${cards.length} 条行为的两轴位置，一根滑块都不留。清错了可以点上面的「撤回」找回`}
        confirmLabel="清空重排"
        onConfirm={() => {
          onResetAxes();
          setConfirmReset(false);
          setStep(1);
        }}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  );
}
