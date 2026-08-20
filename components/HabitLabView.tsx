"use client";

import { useState } from "react";
import type {
  Aspiration,
  BehaviorCard,
  DayPlan,
  GoalResult,
  Habit,
  HabitLog,
  ISODate,
  Task,
  TimeEntry,
  ViewMode,
} from "@/components/todo/types";
import { guessMeasure } from "@/components/todo/behavior";
import HabitTracker from "@/components/HabitTracker";
import MainlineBar from "@/components/MainlineBar";
import { AppHeader, AppShell, ViewTabs } from "@/components/ViewChrome";

type Props = {
  viewMode: ViewMode;
  onChangeViewMode: (mode: ViewMode) => void;
  today: ISODate;
  aspirations: Aspiration[];
  behaviors: BehaviorCard[];
  goalResults: GoalResult[];
  dayPlans: Record<string, DayPlan>;
  onOpenGoals: () => void;
  onOpenGoal: (aspirationId: string, resultId?: string) => void;
  running: { title: string; startedAt: number } | null;
  elapsedMs: number;
  onStopTimer: () => void;
  entries: TimeEntry[];
  tasks: Task[];
  habits: Habit[];
  habitLogs: HabitLog[];
  onAddHabit: (input: Omit<Habit, "id" | "createdAt">) => void;
  habitHasLogs: (habitId: string) => boolean;
  onLogHabit: (habitId: string) => string;
  onScheduleHabitDates: (habitId: string, dates: ISODate[]) => void;
  onSetHabitLogImpact: (logId: string, impact: string) => void;
  onUndoHabitLog: (habitId: string) => void;
  onSetHabitAnchor: (habitId: string, anchor: string) => void;
  onToggleHabitMeasure: (habitId: string) => void;
  onDeleteHabit: (habitId: string) => void;
};

/**
 * 「习惯」tab。只剩打卡——「我的目标」已经搬到目标管理页（从常驻条进）。
 * 硬约束：习惯不受「今日主线」过滤，每天照常全部出现。
 * 默认仍是两套机制：任务靠日程、习惯靠锚点。
 * 只有用户主动选日期时，才把习惯实例化成 Todo；完成后回写一次记录。
 */
export default function HabitLabView({
  viewMode,
  onChangeViewMode,
  today,
  aspirations,
  behaviors,
  goalResults,
  dayPlans,
  onOpenGoals,
  onOpenGoal,
  running,
  elapsedMs,
  onStopTimer,
  entries,
  tasks,
  habits,
  habitLogs,
  onAddHabit,
  habitHasLogs,
  onLogHabit,
  onScheduleHabitDates,
  onSetHabitLogImpact,
  onUndoHabitLog,
  onSetHabitAnchor,
  onToggleHabitMeasure,
  onDeleteHabit,
}: Props) {
  const [quickHabit, setQuickHabit] = useState("");
  const liveHabits = habits.filter((h) => !h.archived);

  function handleQuickAdd() {
    const t = quickHabit.trim();
    if (!t) return;
    onAddHabit({ title: t, measure: guessMeasure(t) });
    setQuickHabit("");
  }

  return (
    <AppShell>
      <AppHeader title="习惯" subtitle="靠锚点触发，让重复自然发生" />
      <MainlineBar
        date={today}
        aspirations={aspirations}
        dayPlans={dayPlans}
        onOpenGoals={onOpenGoals}
        running={running}
        elapsedMs={elapsedMs}
        onStopTimer={onStopTimer}
      />
      <ViewTabs value={viewMode} onChange={onChangeViewMode} />

      <div className="flex w-full flex-col gap-4 px-[18px] pb-6 pt-2">
        <div className="w-full flex items-center gap-2">
          <input
            type="text"
            value={quickHabit}
            onChange={(e) => setQuickHabit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) handleQuickAdd();
            }}
            placeholder="临时想到一个习惯？直接写，回车加进来"
            enterKeyHint="done"
            className="flex-1 min-w-0 px-3 py-2 rounded-[10px] border border-[var(--color-border)] text-[13px] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:border-[var(--color-primary)]"
          />
          <button
            type="button"
            onClick={handleQuickAdd}
            disabled={!quickHabit.trim()}
            className={[
              "px-3 py-2 rounded-[10px] text-[13px] font-medium transition-colors flex-shrink-0",
              quickHabit.trim()
                ? "bg-[var(--color-primary)] text-white hover:bg-[#1d4ed8]"
                : "bg-[var(--color-bg-gray-light)] text-[var(--color-text-tertiary)] cursor-not-allowed",
            ].join(" ")}
          >
            加
          </button>
        </div>

        {liveHabits.length > 0 ? (
          <HabitTracker
            aspirations={aspirations}
            behaviors={behaviors}
            goalResults={goalResults}
            onOpenGoal={onOpenGoal}
            habits={habits}
            logs={habitLogs}
            entries={entries}
            tasks={tasks}
            today={today}
            onLog={onLogHabit}
            onScheduleDates={onScheduleHabitDates}
            onSetLogImpact={onSetHabitLogImpact}
            onUndoLog={onUndoHabitLog}
            onSetAnchor={onSetHabitAnchor}
            onToggleMeasure={onToggleHabitMeasure}
            onDeleteHabit={onDeleteHabit}
            hasLogs={habitHasLogs}
          />
        ) : (
          <div className="w-full flex flex-col gap-3 p-4 rounded-[10px] bg-[var(--color-bg-gray-lighter)] border border-[var(--color-border)]">
            <span className="text-[13px] font-semibold text-[var(--color-text-primary)]">
              还没有要养的习惯
            </span>
            <p className="text-[12px] leading-relaxed text-[var(--color-text-secondary)]">
              想到什么直接往上面那个框里写。
              <br />
              不过真要挑该养哪几个，习惯不是想出来的、是<strong>筛出来的</strong>——
              点上面那条「今天主线」进目标，把行为都倒进去，排一遍焦点地图，
              落在右上角的才配占你一个格子。
            </p>
            <button
              type="button"
              onClick={onOpenGoals}
              className="self-start px-3 py-1.5 rounded-lg bg-[var(--color-primary)] text-white text-[13px] font-medium hover:bg-[#1d4ed8] transition-colors"
            >
              去目标 →
            </button>
          </div>
        )}
      </div>
    </AppShell>
  );
}
