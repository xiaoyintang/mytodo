"use client";

import type { Aspiration, DayPlan, ISODate } from "@/components/todo/types";
import { goalColor, mainlinesOf } from "@/components/todo/goal";
import type { RunningTimer } from "@/components/todo/useTimer";
import { ChevronRight, Square, Target } from "lucide-react";

type Props = {
  /** 当前页面正在表达的日期；日视图/记录跟随所选日期，其余页面传今天。 */
  date: ISODate;
  aspirations: Aspiration[];
  dayPlans: Record<string, DayPlan>;
  onOpenGoals: () => void;
  onOpenGoal: (aspirationId: string) => void;
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
 * “我的目标”和“主线”是两条不同动线：前者进入目标总表，后者直达对应目标的焦点地图。
 * 主线仍然只读——改主线只能去周视图，日常执行时只需要从已排好的目标里挑行为。
 */
export default function MainlineBar({
  date,
  aspirations,
  dayPlans,
  onOpenGoals,
  onOpenGoal,
  running,
  elapsedMs,
  onStopTimer,
}: Props) {
  const mains = mainlinesOf(date, dayPlans, aspirations);

  return (
    <div className="flex w-full flex-col gap-1.5 px-[18px] pb-2">
      {running && (
        <div className="flex w-full items-center gap-2 rounded-lg bg-[#EFF6FF] px-2.5 py-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] animate-pulse flex-shrink-0" />
          <span
            className="min-w-0 truncate text-[12px] font-semibold text-[var(--color-primary)]"
            data-full-text={running.title}
          >
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

      <div className="flex min-h-8 w-full items-stretch gap-1.5">
        <button
          type="button"
          onClick={onOpenGoals}
          className="flex flex-shrink-0 items-center gap-1 rounded-lg border border-[var(--color-border)] bg-white px-2 py-1.5 text-[10px] font-semibold text-[var(--color-text-secondary)] transition-colors hover:border-[#BFDBFE] hover:bg-[var(--color-primary-light)] hover:text-[var(--color-primary)]"
          aria-label="打开我的目标"
        >
          <Target className="h-3 w-3 text-[var(--color-primary)]" />
          我的目标
          <ChevronRight className="h-3 w-3" />
        </button>

        <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg bg-[var(--color-bg-gray-lighter)] px-2 py-1">
          <span className="flex-shrink-0 text-[9px] font-medium text-[var(--color-text-tertiary)]">主线</span>
          {mains.length > 0 ? (
            <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {mains.map((aspiration, index) => (
                <button
                  key={aspiration.id}
                  type="button"
                  onClick={() => onOpenGoal(aspiration.id)}
                  className="flex max-w-[138px] flex-shrink-0 items-center gap-1 rounded-md bg-white px-1.5 py-1 text-left transition-colors hover:bg-[var(--color-primary-light)]"
                  aria-label={`打开主线 ${index + 1}：${aspiration.title}`}
                  title={`直接从「${aspiration.title}」的焦点地图选择行动`}
                >
                  <span
                    className="h-2 w-2 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: goalColor(aspiration, aspirations.indexOf(aspiration)) }}
                  />
                  <span
                    className="truncate text-[11px] font-semibold text-[var(--color-text-primary)]"
                    data-full-text={aspiration.title}
                  >
                    {aspiration.title}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenGoals}
              className="min-w-0 flex-1 truncate text-left text-[10px] text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
            >
              还没安排，去目标里看看
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
