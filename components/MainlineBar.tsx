"use client";

import { useEffect, useRef, useState } from "react";
import type { Aspiration, DayPlan, ISODate } from "@/components/todo/types";
import { goalColor, mainlinesOf } from "@/components/todo/goal";
import type { RunningTimer } from "@/components/todo/useTimer";
import { Check, ChevronRight, SlidersHorizontal, Square, Target } from "lucide-react";

type Props = {
  /** 当前页面正在表达的日期；日视图/记录跟随所选日期，其余页面传今天。 */
  date: ISODate;
  aspirations: Aspiration[];
  dayPlans: Record<string, DayPlan>;
  onOpenGoals: () => void;
  onOpenGoal: (aspirationId: string) => void;
  onToggleMainline: (date: ISODate, aspirationId: string) => void;
  /** 周视图通过下方七天规划管理主线，顶部仅保留目标入口和计时。 */
  showMainlines?: boolean;
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
 * 名称直达焦点地图；选择/调整在当前日期原地完成，与周规划共享 DayPlan。
 */
export default function MainlineBar({
  date,
  aspirations,
  dayPlans,
  onOpenGoals,
  onOpenGoal,
  onToggleMainline,
  showMainlines = true,
  running,
  elapsedMs,
  onStopTimer,
}: Props) {
  const mains = mainlinesOf(date, dayPlans, aspirations);
  const activeGoals = aspirations.filter((goal) => !goal.archived);
  const [editingDate, setEditingDate] = useState<ISODate | null>(null);
  const editing = showMainlines && editingDate === date;
  const rootRef = useRef<HTMLDivElement>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!editing) return;
    function closeOutside(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setEditingDate(null);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") { setEditingDate(null); editButtonRef.current?.focus(); }
    }
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [editing]);
  useEffect(() => { setEditingDate(null); }, [date]);

  return (
    <div ref={rootRef} className="flex w-full flex-col gap-1.5 px-[18px] pb-2">
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

        {showMainlines && <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg bg-[var(--color-bg-gray-lighter)] px-2 py-1">
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
              ref={editButtonRef}
              aria-expanded={editing}
              onClick={() => activeGoals.length ? setEditingDate(editing ? null : date) : onOpenGoals()}
              className="min-w-0 flex-1 truncate text-left text-[10px] text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
            >
              {activeGoals.length ? "选择当天主线" : "还没有目标，先建一个"}
            </button>
          )}
          {mains.length > 0 && <button type="button" ref={editButtonRef}
            aria-label="调整当天主线" aria-expanded={editing}
            onClick={() => setEditingDate(editing ? null : date)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--color-text-tertiary)] hover:bg-[var(--color-primary-light)] hover:text-[var(--color-primary)]">
            <SlidersHorizontal className="h-3.5 w-3.5" />
          </button>}
        </div>}
      </div>
      {editing && <section aria-label="选择当天主线" data-no-tab-swipe
        className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-white)] p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[12px] font-medium text-[var(--color-text-primary)]">{date.slice(5).replace("-", "/")} 的主线</span>
          <span className="text-[11px] text-[var(--color-text-tertiary)]">已选 {mains.length}/3 · 自动保存</span>
        </div>
        <div className="flex max-h-52 flex-wrap gap-1.5 overflow-y-auto">
          {activeGoals.map((goal) => {
            const picked = mains.some((item) => item.id === goal.id);
            const full = !picked && mains.length >= 3;
            return <button key={goal.id} type="button" aria-pressed={picked} disabled={full}
              onClick={() => onToggleMainline(date, goal.id)}
              className={`flex min-h-9 max-w-full items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-left text-[12px] transition-colors disabled:opacity-40 ${picked ? "border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]" : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-gray-light)]"}`}>
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: goalColor(goal, aspirations.indexOf(goal)) }} />
              <span className="break-words">{goal.title}</span>
              {picked && <Check className="h-3.5 w-3.5 shrink-0" />}
            </button>;
          })}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-[10px] text-[var(--color-text-tertiary)]">{mains.length >= 3 ? "已选满，取消一个即可换入其他目标" : "只影响这一天，周视图会同步更新"}</span>
          <button type="button" onClick={() => { setEditingDate(null); editButtonRef.current?.focus(); }}
            className="min-h-8 shrink-0 rounded-md px-2 text-[12px] font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary-light)]">完成</button>
        </div>
      </section>}
    </div>
  );
}
