"use client";

import type { Aspiration, DayPlan, ISODate } from "@/components/todo/types";
import { goalColor, mainlinesOf } from "@/components/todo/goal";
import type { RunningTimer } from "@/components/todo/useTimer";
import { ChevronRight, Square, Target } from "lucide-react";

type Props = {
  today: ISODate;
  aspirations: Aspiration[];
  dayPlans: Record<string, DayPlan>;
  onOpenGoals: () => void;
  /** 有计时在跑时，任何页面都能看见、能停——出门吃饭不用先切回记录页 */
  running: RunningTimer | null;
  elapsedMs: number;
  onStopTimer: () => void;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s % 60)}` : `${pad2(m)}:${pad2(s % 60)}`;
}

/**
 * 常驻作用域条：标题下方、tab 栏上方，四个 tab 通用。
 * 两重身份：今日主线的日常露出（**只读**）+ 目标管理的入口。
 * 展示部分故意不可编辑——改主线只能去周视图，决策集中在周规划，日常执行零决策。
 */
export default function MainlineBar({
  today,
  aspirations,
  dayPlans,
  onOpenGoals,
  running,
  elapsedMs,
  onStopTimer,
}: Props) {
  const mains = mainlinesOf(today, dayPlans, aspirations);

  return (
    <div className="w-full flex flex-col border-y border-[var(--color-border)]">
      {running && (
        <div className="w-full flex items-center gap-2 px-6 py-1.5 bg-[#EFF6FF] border-b border-[var(--color-border)]">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] animate-pulse flex-shrink-0" />
          <span className="text-[12px] font-semibold text-[var(--color-primary)] truncate min-w-0">
            {running.title}
          </span>
          <span className="text-[13px] font-bold tabular-nums text-[var(--color-primary)] flex-shrink-0">
            {fmt(elapsedMs)}
          </span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onStopTimer}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-[var(--color-primary)] text-white text-[11px] font-semibold hover:bg-[#1d4ed8] transition-colors flex-shrink-0"
          >
            <Square className="w-2.5 h-2.5" fill="currentColor" strokeWidth={0} />
            停止
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={onOpenGoals}
        className="w-full flex items-center gap-2 px-6 py-2 bg-[var(--color-bg-gray-lighter)] hover:bg-[var(--color-bg-gray-light)] transition-colors text-left"
      >
        <Target className="w-3.5 h-3.5 text-[var(--color-primary)] flex-shrink-0" />
        <span className="text-[11px] text-[var(--color-text-tertiary)] flex-shrink-0">今天主线</span>

        {mains.length > 0 ? (
          <span className="flex-1 flex items-center gap-2 min-w-0 flex-wrap">
            {mains.map((a) => (
              <span key={a.id} className="flex items-center gap-1 min-w-0">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: goalColor(a, aspirations.indexOf(a)) }}
                />
                <span className="text-[12px] font-semibold text-[var(--color-text-primary)] truncate">
                  {a.title}
                </span>
              </span>
            ))}
          </span>
        ) : (
          <span className="flex-1 text-[12px] text-[var(--color-text-secondary)]">
            还没排 · 去周视图排
          </span>
        )}

        <ChevronRight className="w-4 h-4 text-[var(--color-text-tertiary)] flex-shrink-0" />
      </button>
    </div>
  );
}
