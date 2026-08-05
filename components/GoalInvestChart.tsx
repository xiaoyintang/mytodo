"use client";

import type { Aspiration, DayPlan, ISODate, TimeEntry } from "@/components/todo/types";
import { goalColor, weeklyMainlineDays } from "@/components/todo/goal";
import { formatMinutes } from "@/components/todo/time";

type Props = {
  weekDates: ISODate[];
  entries: TimeEntry[];
  aspirations: Aspiration[];
  dayPlans: Record<string, DayPlan>;
};

/**
 * 本周投入：**排了几天 vs 实际多少时间**，并排放着。
 * 不做达标率、不做百分比、不加任何评价性文案——只让差值自己说话。
 * 排了 5 天但实际 40 分钟，这个差值本身就是最有用的反馈。
 */
export default function GoalInvestChart({ weekDates, entries, aspirations, dayPlans }: Props) {
  const inWeek = entries.filter((e) => weekDates.includes(e.date));

  const rows = aspirations
    .map((a, i) => ({
      a,
      color: goalColor(a, i),
      planned: weeklyMainlineDays(a.id, weekDates, dayPlans),
      minutes: inWeek.filter((e) => e.aspirationId === a.id).reduce((s, e) => s + e.minutes, 0),
    }))
    // 既没排过也没投入过的目标不占地方
    .filter((r) => r.planned > 0 || r.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes || b.planned - a.planned);

  const noGoal = inWeek.filter((e) => !e.aspirationId).reduce((s, e) => s + e.minutes, 0);
  const max = Math.max(1, ...rows.map((r) => r.minutes));

  if (rows.length === 0 && noGoal === 0) return null;

  return (
    <div className="w-full flex flex-col gap-2">
      <div className="w-full flex items-center justify-between">
        <span className="text-[var(--color-text-primary)] text-[15px] font-semibold">本周投入</span>
        <span className="text-[var(--color-text-tertiary)] text-[11px]">排了几天 vs 实际花了多少</span>
      </div>

      {rows.map((r) => (
        <div key={r.a.id} className="w-full flex flex-col gap-1">
          <div className="w-full flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: r.color }}
            />
            <span className="flex-1 text-[13px] text-[var(--color-text-primary)] truncate">
              {r.a.title}
            </span>
            <span className="text-[11px] text-[var(--color-text-tertiary)] flex-shrink-0 tabular-nums">
              排 {r.planned} 天
            </span>
            <span className="text-[12px] font-semibold text-[var(--color-text-secondary)] flex-shrink-0 tabular-nums w-[62px] text-right">
              {r.minutes > 0 ? formatMinutes(r.minutes) : "0分钟"}
            </span>
          </div>
          <div className="w-full h-[6px] rounded-full bg-[var(--color-bg-gray-light)] overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${r.minutes > 0 ? Math.max(3, Math.round((r.minutes / max) * 100)) : 0}%`,
                backgroundColor: r.color,
              }}
            />
          </div>
        </div>
      ))}

      {noGoal > 0 && (
        <div className="w-full flex items-center gap-2 pt-0.5">
          <span className="w-2 h-2 rounded-full bg-[#A1A1AA] flex-shrink-0" />
          <span className="flex-1 text-[12px] text-[var(--color-text-tertiary)]">没归属目标的</span>
          <span className="text-[12px] text-[var(--color-text-tertiary)] tabular-nums">
            {formatMinutes(noGoal)}
          </span>
        </div>
      )}
    </div>
  );
}
