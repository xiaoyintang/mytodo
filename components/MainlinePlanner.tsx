"use client";

import { useEffect, useRef, useState } from "react";
import type { Aspiration, DayPlan, ISODate } from "@/components/todo/types";
import { goalColor, weeklyMainlineDays } from "@/components/todo/goal";
import { CN_WEEKDAY, toISODate } from "@/components/todo/date";
import { Check, Plus, Target } from "lucide-react";

type Props = {
  days: Date[];
  today: ISODate;
  aspirations: Aspiration[];
  dayPlans: Record<string, DayPlan>;
  onToggle: (date: ISODate, aspirationId: string) => void;
};

/**
 * 周视图里排主线。**这里是唯一能改主线的地方**——决策集中在周规划，
 * 日常执行零决策（日视图和常驻条上都只读）。
 * 超周上限只标黄提示，不弹窗、不阻止——硬拦截会让人绕过系统。
 */
export default function MainlinePlanner({ days, today, aspirations, dayPlans, onToggle }: Props) {
  const [editing, setEditing] = useState<ISODate | null>(null);
  const weekDates = days.map((d) => toISODate(d) as ISODate);
  const rootRef = useRef<HTMLDivElement>(null);

  // 点空白处收起来。原来只能再点一次那个框才关得掉，很别扭
  useEffect(() => {
    if (!editing) return;
    function onDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setEditing(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setEditing(null);
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [editing]);

  if (aspirations.length === 0) {
    return (
      <div className="w-full px-4 py-3 text-[12px] text-[var(--color-text-secondary)] leading-relaxed">
        还没有目标，排不了主线。点上面那条「今天主线」去建一个。
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className="w-full flex flex-col gap-2 px-4 py-3 border-b border-[var(--color-border)]"
    >
      <div className="w-full flex items-center gap-1.5">
        <Target className="w-3.5 h-3.5 text-[var(--color-primary)]" />
        <span className="text-[13px] font-semibold text-[var(--color-text-primary)]">本周主线</span>
        <span className="text-[11px] text-[var(--color-text-tertiary)]">
          提前排好哪天推哪个，别一天什么都干一点
        </span>
      </div>

      {days.map((d, i) => {
        const iso = toISODate(d) as ISODate;
        const ids = dayPlans[iso]?.primaryAspirationIds ?? [];
        const picked = aspirations.filter((a) => ids.includes(a.id));
        const isToday = iso === today;
        const open = editing === iso;
        return (
          <div key={iso} className="w-full flex flex-col gap-1">
            <div className="w-full flex items-center gap-2">
              <span
                className={[
                  "w-[42px] flex-shrink-0 text-[11px]",
                  isToday
                    ? "text-[var(--color-primary)] font-bold"
                    : "text-[var(--color-text-tertiary)] font-medium",
                ].join(" ")}
              >
                {isToday ? "今天" : CN_WEEKDAY[d.getDay()]} {d.getDate()}
              </span>

              <button
                type="button"
                onClick={() => setEditing(open ? null : iso)}
                className={[
                  "flex-1 flex items-center gap-1.5 flex-wrap min-h-[30px] px-2 py-1 rounded-lg border text-left transition-colors",
                  open
                    ? "border-[var(--color-primary)] bg-[var(--color-primary-light)]"
                    : picked.length > 0
                      ? "border-[var(--color-border)] bg-white"
                      : "border-dashed border-[var(--color-border)] bg-[var(--color-bg-gray-lighter)]",
                ].join(" ")}
              >
                {picked.length > 0 ? (
                  picked.map((a) => (
                    <span
                      key={a.id}
                      className="flex items-center gap-1 px-1.5 py-[1px] rounded border text-[11px] font-medium"
                      style={{
                        borderColor: goalColor(a, aspirations.indexOf(a)),
                        color: goalColor(a, aspirations.indexOf(a)),
                      }}
                    >
                      {a.title}
                    </span>
                  ))
                ) : (
                  <span className="flex items-center gap-1 text-[11px] text-[var(--color-text-tertiary)]">
                    <Plus className="w-3 h-3" />
                    排主线
                  </span>
                )}
              </button>
            </div>

            {open && (
              <div className="w-full flex flex-wrap gap-1.5 pl-[50px] pb-1">
                {aspirations.map((a, ai) => {
                  const on = ids.includes(a.id);
                  const c = goalColor(a, ai);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => onToggle(iso, a.id)}
                      className="flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] font-medium transition-colors"
                      style={{
                        backgroundColor: on ? c : "#fff",
                        borderColor: c,
                        color: on ? "#fff" : c,
                      }}
                    >
                      {on && <Check className="w-3 h-3" strokeWidth={3} />}
                      {a.title}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="px-2 py-1 rounded-md text-[11px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
                >
                  完成
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* 本周额度：排了几天 / 你自己定的上限。超了标黄，不拦 */}
      <div className="w-full flex flex-col gap-1 pt-1 mt-1 border-t border-[var(--color-border)]">
        {aspirations.map((a, i) => {
          const used = weeklyMainlineDays(a.id, weekDates, dayPlans);
          const cap = a.weeklyLimit ?? null;
          const over = cap != null && used > cap;
          if (used === 0 && cap == null) return null;
          return (
            <div key={a.id} className="w-full flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: goalColor(a, i) }}
              />
              <span
                className="flex-1 truncate text-[11px] text-[var(--color-text-secondary)]"
                title={a.title}
              >
                {a.title}
              </span>
              <span
                className={[
                  "text-[11px] tabular-nums flex-shrink-0",
                  over ? "text-[#B45309] font-semibold" : "text-[var(--color-text-tertiary)]",
                ].join(" ")}
              >
                {used}
                {cap != null ? `/${cap} 天` : " 天"}
                {over ? " ⚠ 超了" : ""}
              </span>
            </div>
          );
        })}
        <span className="text-[10px] text-[var(--color-text-tertiary)]">
          每周上限在目标页设（点上面那条主线进去）。超了只提示，不拦你
        </span>
      </div>
    </div>
  );
}
