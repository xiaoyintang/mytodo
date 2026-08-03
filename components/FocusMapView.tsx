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
  nextToPlace,
} from "@/components/todo/behavior";
import { ArrowLeft, ChevronDown, ChevronUp, RotateCcw, Star } from "lucide-react";

type AxisPatch = { impact?: number; feasibility?: number };

type Props = {
  aspiration: Aspiration;
  cards: BehaviorCard[]; // 只传可重复行为（habit + stop）
  onSetAxis: (id: string, patch: AxisPatch) => void;
  onResetAxes: () => void;
  onBack: () => void;
};

export default function FocusMapView({ aspiration, cards, onSetAxis, onResetAxes, onBack }: Props) {
  // 本轮跳过的卡（只在这次会话里有效，退出重进会再问）
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [lowOpen, setLowOpen] = useState(false);
  const [tweaking, setTweaking] = useState<string | null>(null);

  const step = nextToPlace(cards, skipped);

  const golden = cards.filter(isGolden);
  const wantCant = cards.filter((c) => isHighImpact(c) && (c.feasibility ?? 0) < 50 && c.feasibility != null);
  const lowImpact = cards.filter((c) => c.impact != null && !isHighImpact(c));
  const skippedCards = cards.filter((c) => skipped.has(c.id) && (c.impact == null || (isHighImpact(c) && c.feasibility == null)));

  function place(id: string, patch: AxisPatch) {
    onSetAxis(id, patch);
    setSkipped((s) => {
      if (!s.has(id)) return s;
      const next = new Set(s);
      next.delete(id);
      return next;
    });
  }

  function skip(id: string) {
    setSkipped((s) => new Set(s).add(id));
  }

  function handleReset() {
    setSkipped(new Set());
    onResetAxes();
  }

  // 结果图里的一张小卡：点一下可以改它的位置
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
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-[var(--color-text-tertiary)] w-[36px]">影响力</span>
              {[
                ["高", AXIS_HIGH],
                ["低", AXIS_LOW],
              ].map(([label, v]) => (
                <button
                  key={label as string}
                  type="button"
                  onClick={() => {
                    place(b.id, { impact: v as number });
                    setTweaking(null);
                  }}
                  className={[
                    "px-2 py-[2px] rounded border text-[10px]",
                    (b.impact ?? 0) >= 50 === (v === AXIS_HIGH)
                      ? "bg-[var(--color-primary)] border-[var(--color-primary)] text-white"
                      : "bg-white border-[var(--color-border)] text-[var(--color-text-secondary)]",
                  ].join(" ")}
                >
                  {label as string}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-[var(--color-text-tertiary)] w-[36px]">做得到</span>
              {[
                ["能", AXIS_HIGH],
                ["不能", AXIS_LOW],
              ].map(([label, v]) => (
                <button
                  key={label as string}
                  type="button"
                  onClick={() => {
                    place(b.id, { feasibility: v as number });
                    setTweaking(null);
                  }}
                  className={[
                    "px-2 py-[2px] rounded border text-[10px]",
                    (b.feasibility ?? 0) >= 50 === (v === AXIS_HIGH)
                      ? "bg-[var(--color-primary)] border-[var(--color-primary)] text-white"
                      : "bg-white border-[var(--color-border)] text-[var(--color-text-secondary)]",
                  ].join(" ")}
                >
                  {label as string}
                </button>
              ))}
            </div>
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
        <span className="text-[17px] font-semibold text-[var(--color-text-primary)] truncate">
          焦点地图
        </span>
        <span className="text-[12px] text-[var(--color-text-tertiary)] truncate">{aspiration.title}</span>
      </div>

      {step ? (
        /* ===== 排卡：一次一张，一轮只问一个维度 ===== */
        <div className="w-full flex flex-col gap-3">
          <div className="w-full flex items-center justify-between">
            <span className="text-[13px] font-semibold text-[var(--color-text-primary)]">
              第 {step.round} 轮 · {step.round === 1 ? "影响力" : "我能不能做到"}
            </span>
            <span className="text-[12px] text-[var(--color-text-tertiary)] tabular-nums">
              {step.done} / {step.total}
            </span>
          </div>

          <div className="w-full h-[4px] rounded-full bg-[var(--color-bg-gray-light)] overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--color-primary)] transition-all"
              style={{ width: `${Math.round((step.done / Math.max(1, step.total)) * 100)}%` }}
            />
          </div>

          <div className="w-full flex items-center justify-center min-h-[88px] px-4 py-5 rounded-[12px] bg-white border-[1.5px] border-[var(--color-primary)]">
            <span className="text-[16px] font-medium text-[var(--color-text-primary)] text-center leading-snug">
              {step.card.text}
            </span>
          </div>

          <p className="text-[13px] text-[var(--color-text-secondary)] text-center leading-relaxed">
            {step.round === 1
              ? `对「${aspiration.title}」的推动大不大？`
              : "你能想到一个每天真会发生的时刻，把它挂上去吗？"}
          </p>

          <div className="w-full flex gap-2">
            {(step.round === 1
              ? [
                  ["影响大", AXIS_HIGH],
                  ["影响小", AXIS_LOW],
                ]
              : [
                  ["能做到", AXIS_HIGH],
                  ["做不到", AXIS_LOW],
                ]
            ).map(([label, v]) => (
              <button
                key={label as string}
                type="button"
                onClick={() =>
                  place(
                    step.card.id,
                    step.round === 1 ? { impact: v as number } : { feasibility: v as number },
                  )
                }
                className={[
                  "flex-1 py-3.5 rounded-[12px] text-[15px] font-semibold transition-colors",
                  v === AXIS_HIGH
                    ? "bg-[var(--color-primary)] text-white hover:bg-[#1d4ed8]"
                    : "bg-white border-[1.5px] border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-gray-light)]",
                ].join(" ")}
              >
                {label as string}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => skip(step.card.id)}
            className="self-center text-[12px] text-[var(--color-text-tertiary)] hover:underline"
          >
            拿不准，先跳过
          </button>
        </div>
      ) : (
        /* ===== 结果：四象限（二选一排出来的坐标只有两档，画散点是假的） ===== */
        <div className="w-full flex flex-col gap-3">
          <div className="w-full flex items-center justify-between">
            <span className="text-[12px] text-[var(--color-text-tertiary)]">影响力 高 ↑</span>
            <button
              type="button"
              onClick={handleReset}
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
              小到不需要意志力为止（「读30分钟书」做不到，「读2分钟」就做得到）。改小之后再排一次。
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

          {skippedCards.length > 0 && (
            <p className="text-[11px] text-[var(--color-text-tertiary)]">
              还有 {skippedCards.length} 条你跳过了，退出重进会再问一遍
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
