"use client";

import { ChevronRight, Flag } from "lucide-react";
import type { Aspiration, ISODate, DayPlan } from "@/components/todo/types";
import { goalColor, mainlinesOf } from "@/components/todo/goal";
import { useGoalProgress } from "@/components/todo/goalLevelContext";

/**
 * 首页上的目标进度：不用进身份页，一打开 App 就看得到"往前走了多少"。
 * 只列有终点的「目标」（状态没有进度可言）。当天排了主线就只看主线身份下的，没排就看全部身份。
 * 每个目标一行：名字、进度条、x/y、下一步；点一下直达那个目标的清单。
 */
export default function GoalProgressStrip({ date, aspirations, dayPlans, onOpenGoal }: {
  date: ISODate;
  aspirations: Aspiration[];
  dayPlans: Record<string, DayPlan>;
  onOpenGoal: (aspirationId: string, resultId?: string) => void;
}) {
  const progress = useGoalProgress();
  const mains = mainlinesOf(date, dayPlans, aspirations);
  const scope = mains.length > 0 ? mains : aspirations.filter((goal) => !goal.archived);
  const rows = scope.flatMap((identity) =>
    (progress[identity.id] ?? []).map((goal) => ({ identity, goal })),
  );
  if (rows.length === 0) return null;
  const visible = rows.slice(0, 3);

  return (
    <section aria-label="目标进度" className="flex flex-col gap-0.5 rounded-[12px] border border-[var(--color-border)] bg-white px-3 py-2">
      <div className="flex items-center gap-1.5 pb-0.5">
        <Flag className="h-3.5 w-3.5 text-[var(--color-primary)]" />
        <h2 className="text-[12px] font-semibold text-[var(--color-text-primary)]">{mains.length > 0 ? "主线目标" : "在推进的目标"}</h2>
        {rows.length > visible.length && (
          <span className="ml-auto text-[10px] text-[var(--color-text-tertiary)]">还有 {rows.length - visible.length} 个</span>
        )}
      </div>
      {visible.map(({ identity, goal }) => {
        const color = goalColor(identity, aspirations.indexOf(identity));
        const pct = goal.total ? (goal.done / goal.total) * 100 : 0;
        return (
          <button key={goal.resultId} type="button" onClick={() => onOpenGoal(identity.id, goal.resultId)}
            aria-label={`打开目标：${goal.title}`}
            className="flex min-h-11 w-full items-center gap-2 rounded-md px-1 text-left hover:bg-[var(--color-bg-gray-light)]">
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 truncate text-[13px] font-medium text-[var(--color-text-primary)]" data-full-text={goal.title}>{goal.title}</span>
                <span className="block h-1 min-w-10 flex-1 overflow-hidden rounded-full bg-[var(--color-bg-gray-light)]">
                  <span className="block h-full rounded-full transition-[width] duration-700" style={{ width: `${pct}%`, backgroundColor: color }} />
                </span>
                <span className="flex-shrink-0 text-[11px] font-semibold tabular-nums text-[var(--color-text-secondary)]">{goal.done}/{goal.total}</span>
              </span>
              {goal.next && (
                <span className="block truncate text-[10px] text-[var(--color-text-tertiary)]" data-full-text={goal.next}>
                  下一步 · {goal.next}
                </span>
              )}
            </span>
            <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-[var(--color-text-tertiary)]" />
          </button>
        );
      })}
    </section>
  );
}
