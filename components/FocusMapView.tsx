"use client";

import { useState } from "react";
import type { Aspiration, BehaviorCard } from "@/components/todo/types";
import {
  AXIS_HIGH,
  AXIS_LOW,
  TYPE_LABEL,
  TYPE_STYLE,
  isGolden,
  isHighImpact,
} from "@/components/todo/behavior";
import { ArrowLeft, ChevronDown, ChevronUp, RotateCcw, Star } from "lucide-react";

type AxisPatch = { impact?: number; feasibility?: number };
type Step = 1 | 2 | 3;

type Props = {
  aspiration: Aspiration;
  cards: BehaviorCard[]; // 只传可重复行为（habit + stop）
  onSetAxis: (id: string, patch: AxisPatch) => void;
  onResetAxes: () => void;
  onBack: () => void;
};

const STEPS: Array<[Step, string]> = [
  [1, "1 影响力"],
  [2, "2 能不能做到"],
  [3, "结果"],
];

export default function FocusMapView({ aspiration, cards, onSetAxis, onResetAxes, onBack }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [lowOpen, setLowOpen] = useState(false);
  const [tweaking, setTweaking] = useState<string | null>(null);

  const highs = cards.filter(isHighImpact);
  const golden = cards.filter(isGolden);
  const wantCant = cards.filter((c) => isHighImpact(c) && c.feasibility != null && c.feasibility < 50);
  const lowImpact = cards.filter((c) => c.impact != null && !isHighImpact(c));

  const r1Done = cards.filter((c) => c.impact != null).length;
  const r2Done = highs.filter((c) => c.feasibility != null).length;

  // 一行：文字 + 二选一。点一下切换，不点就是没排，随便你跳着来
  function renderRow(b: BehaviorCard, axis: "impact" | "feasibility") {
    const value = axis === "impact" ? b.impact : b.feasibility;
    const labels: Array<[string, number]> =
      axis === "impact"
        ? [
            ["大", AXIS_HIGH],
            ["小", AXIS_LOW],
          ]
        : [
            ["能", AXIS_HIGH],
            ["不能", AXIS_LOW],
          ];
    const st = TYPE_STYLE[b.type];
    return (
      <div
        key={b.id}
        className={[
          "w-full flex items-center gap-2 px-3 py-2.5 rounded-[10px] border transition-colors",
          value == null
            ? "bg-[var(--color-bg-gray-lighter)] border-[var(--color-border)]"
            : "bg-white border-[var(--color-border)]",
        ].join(" ")}
      >
        <span className="flex-1 text-[13px] text-[var(--color-text-primary)] leading-snug">
          {b.text}
          {b.type === "stop" && (
            <span className="ml-1 text-[9px]" style={{ color: st.text }}>
              {TYPE_LABEL.stop}
            </span>
          )}
        </span>
        <div className="flex gap-1 flex-shrink-0">
          {labels.map(([label, v]) => {
            const active = value != null && (value >= 50) === (v === AXIS_HIGH);
            return (
              <button
                key={label}
                type="button"
                onClick={() => onSetAxis(b.id, { [axis]: v } as AxisPatch)}
                className={[
                  "min-w-[38px] px-2 py-1.5 rounded-md border text-[12px] font-medium transition-colors",
                  active
                    ? "bg-[var(--color-primary)] border-[var(--color-primary)] text-white"
                    : "bg-white border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-gray-light)]",
                ].join(" ")}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // 结果图里的一条：点一下能挪象限
  function renderChip(b: BehaviorCard) {
    const st = TYPE_STYLE[b.type];
    const open = tweaking === b.id;
    return (
      <div key={b.id} className="w-full flex flex-col gap-1">
        <button
          type="button"
          onClick={() => setTweaking(open ? null : b.id)}
          className="w-full text-left text-[12px] text-[var(--color-text-primary)] leading-snug"
          title="点一下挪位置"
        >
          · {b.text}
          {b.type === "stop" && (
            <span className="ml-1 text-[9px]" style={{ color: st.text }}>
              {TYPE_LABEL.stop}
            </span>
          )}
        </button>
        {open && (
          <div className="flex flex-col gap-1 pl-2 pb-1">
            {(
              [
                ["影响力", "impact", ["高", "低"]],
                ["做得到", "feasibility", ["能", "不能"]],
              ] as Array<[string, "impact" | "feasibility", [string, string]]>
            ).map(([title, axis, [hi, lo]]) => {
              const value = axis === "impact" ? b.impact : b.feasibility;
              return (
                <div key={axis} className="flex items-center gap-1">
                  <span className="text-[10px] text-[var(--color-text-tertiary)] w-[36px]">{title}</span>
                  {(
                    [
                      [hi, AXIS_HIGH],
                      [lo, AXIS_LOW],
                    ] as Array<[string, number]>
                  ).map(([label, v]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => {
                        onSetAxis(b.id, { [axis]: v } as AxisPatch);
                        setTweaking(null);
                      }}
                      className={[
                        "px-2 py-[2px] rounded border text-[10px]",
                        value != null && (value >= 50) === (v === AXIS_HIGH)
                          ? "bg-[var(--color-primary)] border-[var(--color-primary)] text-white"
                          : "bg-white border-[var(--color-border)] text-[var(--color-text-secondary)]",
                      ].join(" ")}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        )}
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

      {/* 两轮 + 结果，随便跳 */}
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
              对「{aspiration.title}」的推动大不大？
            </span>
            <span className="text-[12px] text-[var(--color-text-tertiary)] tabular-nums flex-shrink-0 ml-2">
              {r1Done}/{cards.length}
            </span>
          </div>
          <p className="text-[11px] text-[var(--color-text-tertiary)]">
            一眼能定的直接点，拿不准的先空着，顺序随你
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
              还没有判为「影响大」的行为。先去第 1 轮点几个——影响力小的反正成不了黄金行为，
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
                只问第 1 轮判为「影响大」的这几条
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
            <span className="text-[12px] text-[var(--color-text-tertiary)]">影响力 高 ↑</span>
            <button
              type="button"
              onClick={onResetAxes}
              className="flex items-center gap-1 text-[12px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
            >
              <RotateCcw className="w-3 h-3" />
              重排
            </button>
          </div>

          <div className="w-full flex gap-2">
            <div className="flex-1 flex flex-col gap-1.5 p-3 rounded-[10px] bg-white border border-[var(--color-border)] min-h-[120px]">
              <span className="text-[11px] font-semibold text-[var(--color-text-secondary)]">
                想做但做不到
              </span>
              {wantCant.length > 0 ? (
                wantCant.map(renderChip)
              ) : (
                <span className="text-[11px] text-[var(--color-text-tertiary)]">空</span>
              )}
            </div>

            <div className="flex-1 flex flex-col gap-1.5 p-3 rounded-[10px] bg-[var(--color-primary-light)] border-[1.5px] border-[var(--color-primary)] min-h-[120px]">
              <span className="flex items-center gap-1 text-[11px] font-semibold text-[var(--color-primary)]">
                <Star className="w-3 h-3" fill="currentColor" strokeWidth={0} />
                黄金行为
              </span>
              {golden.length > 0 ? (
                golden.map(renderChip)
              ) : (
                <span className="text-[11px] text-[var(--color-text-tertiary)]">空</span>
              )}
            </div>
          </div>

          <div className="w-full flex items-center justify-between text-[11px] text-[var(--color-text-tertiary)]">
            <span>← 做不到</span>
            <span>能做到 →</span>
          </div>

          {wantCant.length > 0 && (
            <p className="text-[11px] leading-relaxed text-[var(--color-text-secondary)] px-1">
              左上角这些别硬扛——福格的原话是：<strong>做不到就把它改小</strong>，
              小到不需要意志力为止（「读30分钟书」做不到，「读2分钟」就做得到）。回集群里改完再排。
            </p>
          )}

          {lowImpact.length > 0 && (
            <div className="w-full flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => setLowOpen((v) => !v)}
                className="w-full flex items-center gap-1 text-[12px] text-[var(--color-text-tertiary)]"
              >
                影响力低 · {lowImpact.length} 条
                {lowOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
              {lowOpen && (
                <div className="w-full flex flex-col gap-1.5 p-3 rounded-[10px] bg-[var(--color-bg-gray-lighter)] border border-[var(--color-border)]">
                  {lowImpact.map(renderChip)}
                </div>
              )}
            </div>
          )}

          {(r1Done < cards.length || r2Done < highs.length) && (
            <p className="text-[11px] text-[var(--color-text-tertiary)]">
              还有没排的：第 1 轮 {cards.length - r1Done} 条、第 2 轮 {highs.length - r2Done} 条。
              不排也能出结果，只是它们不会出现在图上。
            </p>
          )}

          <div className="w-full pt-1 border-t border-[var(--color-border)]">
            <p className="text-[12px] leading-relaxed text-[var(--color-text-secondary)]">
              {golden.length > 0 ? (
                <>
                  筛出 <strong>{golden.length}</strong> 条黄金行为（从 {cards.length} 条里）。
                  下一步是给它们配锚点——「在我 ___ 之后，我会 ___」，然后才进习惯表。那部分还没做。
                </>
              ) : (
                <>还没有落在右上角的行为。要么把左上角那些改小，要么回集群里再想几条。</>
              )}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
