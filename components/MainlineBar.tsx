"use client";

import type { Aspiration, DayPlan, ISODate } from "@/components/todo/types";
import { goalColor, mainlinesOf } from "@/components/todo/goal";
import { ChevronRight, Target } from "lucide-react";

type Props = {
  today: ISODate;
  aspirations: Aspiration[];
  dayPlans: Record<string, DayPlan>;
  onOpenGoals: () => void;
};

/**
 * 常驻作用域条：标题下方、tab 栏上方，四个 tab 通用。
 * 两重身份：今日主线的日常露出（**只读**）+ 目标管理的入口。
 * 展示部分故意不可编辑——改主线只能去周视图，决策集中在周规划，日常执行零决策。
 */
export default function MainlineBar({ today, aspirations, dayPlans, onOpenGoals }: Props) {
  const mains = mainlinesOf(today, dayPlans, aspirations);

  return (
    <button
      type="button"
      onClick={onOpenGoals}
      className="w-full flex items-center gap-2 px-6 py-2 border-y border-[var(--color-border)] bg-[var(--color-bg-gray-lighter)] hover:bg-[var(--color-bg-gray-light)] transition-colors text-left"
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
  );
}
