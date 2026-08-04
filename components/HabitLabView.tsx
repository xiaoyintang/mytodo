"use client";

import { useState } from "react";
import type {
  Aspiration,
  DayPlan,
  Habit,
  HabitLog,
  ISODate,
  TimeEntry,
  ViewMode,
} from "@/components/todo/types";
import { guessMeasure } from "@/components/todo/behavior";
import HabitTracker from "@/components/HabitTracker";
import MainlineBar from "@/components/MainlineBar";

type Props = {
  viewMode: ViewMode;
  onChangeViewMode: (mode: ViewMode) => void;
  today: ISODate;
  aspirations: Aspiration[];
  dayPlans: Record<string, DayPlan>;
  onOpenGoals: () => void;
  running: { title: string; startedAt: number } | null;
  elapsedMs: number;
  onStopTimer: () => void;
  entries: TimeEntry[];
  habits: Habit[];
  habitLogs: HabitLog[];
  onAddHabit: (input: Omit<Habit, "id" | "createdAt">) => void;
  habitHasLogs: (habitId: string) => boolean;
  onLogHabit: (habitId: string) => void;
  onUndoHabitLog: (habitId: string) => void;
  onSetHabitAnchor: (habitId: string, anchor: string) => void;
  onToggleHabitMeasure: (habitId: string) => void;
  onDeleteHabit: (habitId: string) => void;
};

const TABS: Array<[ViewMode, string]> = [
  ["day", "日视图"],
  ["week", "周视图"],
  ["log", "记录"],
  ["habit", "习惯"],
];

/**
 * 「习惯」tab。只剩打卡——「我的目标」已经搬到目标管理页（从常驻条进）。
 * 硬约束：习惯不受「今日主线」过滤，每天照常全部出现。
 * 任务靠日程触发，习惯靠锚点触发，是两套机制，混了整条链就废了。
 */
export default function HabitLabView({
  viewMode,
  onChangeViewMode,
  today,
  aspirations,
  dayPlans,
  onOpenGoals,
  running,
  elapsedMs,
  onStopTimer,
  entries,
  habits,
  habitLogs,
  onAddHabit,
  habitHasLogs,
  onLogHabit,
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
    <div className="w-[420px] bg-[var(--color-bg-white)] flex flex-col rounded-[16px] overflow-hidden border border-[var(--color-border)]">
      <div className="w-full flex flex-col gap-1 px-6 pt-6 pb-4">
        <h1 className="text-[var(--color-text-primary)] text-[28px] font-bold tracking-[-0.5px]">
          习惯
        </h1>
        <p className="text-[var(--color-text-secondary)] text-[14px] font-medium">
          靠锚点触发，每天都在，不看主线
        </p>
      </div>

      <MainlineBar
        today={today}
        aspirations={aspirations}
        dayPlans={dayPlans}
        onOpenGoals={onOpenGoals}
        running={running}
        elapsedMs={elapsedMs}
        onStopTimer={onStopTimer}
      />

      <div className="w-full px-6 pt-4">
        <div className="w-full flex gap-1 bg-[var(--color-bg-gray-light)] rounded-[10px] p-1">
          {TABS.map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => onChangeViewMode(mode)}
              className={[
                "flex-1 flex items-center justify-center rounded-lg px-2 py-[10px] transition-colors",
                viewMode === mode
                  ? "bg-[var(--color-bg-white)] shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
                  : "hover:bg-white/60",
              ].join(" ")}
            >
              <span
                className={[
                  "text-[14px]",
                  viewMode === mode
                    ? "text-[var(--color-text-primary)] font-semibold"
                    : "text-[var(--color-text-secondary)] font-medium",
                ].join(" ")}
              >
                {label}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="w-full flex flex-col gap-4 px-6 pt-5 pb-6">
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
            habits={habits}
            logs={habitLogs}
            entries={entries}
            today={today}
            onLog={onLogHabit}
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
    </div>
  );
}
