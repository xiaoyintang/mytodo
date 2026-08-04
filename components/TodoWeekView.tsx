"use client";

import { useState } from "react";
import type { Aspiration, DayPlan, ISODate, Task, TimeEntry, ViewMode } from "@/components/todo/types";
import { CN_WEEKDAY, addDays, parseISODate, startOfWeek, toISODate } from "@/components/todo/date";
import { Plus, ChevronLeft, ChevronRight, Check, Flag, Timer } from "lucide-react";
import { formatMinutes, taskLoggedMinutes } from "@/components/todo/time";
import TaskBottomSheet from "@/components/TaskBottomSheet";
import QuickAddTask from "@/components/QuickAddTask";
import MainlineBar from "@/components/MainlineBar";
import MainlinePlanner from "@/components/MainlinePlanner";

type Props = {
  viewMode: ViewMode;
  onChangeViewMode: (mode: ViewMode) => void;
  selectedDate: ISODate;
  onSelectDate: (date: ISODate) => void;
  tasks: Task[];
  entries: TimeEntry[];
  onCycleTaskStatus: (taskId: string) => void;
  onOpenAddModal: () => void;
  onCreateTask: (task: Omit<Task, "id">) => void;
  onDeleteTask: (taskId: string) => void;
  onUpdateTask: (taskId: string, updates: Partial<Omit<Task, "id">>) => void;
  onAddEntry: (entry: Omit<TimeEntry, "id">) => void;
  today: ISODate;
  aspirations: Aspiration[];
  dayPlans: Record<string, DayPlan>;
  onOpenGoals: () => void;
  onToggleMainline: (date: ISODate, aspirationId: string) => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
};

// 单个任务行（始终可见，点击打开详情弹窗）
function WeekTaskRow({
  task,
  entries,
  onClick,
}: {
  task: Task;
  entries: TimeEntry[];
  onClick: () => void;
}) {
  const isDone = task.status === "done";
  const isInProgress = task.status === "in_progress";
  const isHigh = task.priority === "high";
  const target = task.targetMinutes ?? 0;
  const logged = target > 0 ? taskLoggedMinutes(task, entries) : 0;
  const reached = target > 0 && logged >= target;
  const manualPct = target > 0 ? 0 : (task.progress ?? 0);

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors",
        isDone
          ? "bg-[#DCFCE7]"
          : isInProgress
            ? "bg-[#EFF6FF]"
            : isHigh
              ? "bg-[#FEF2F2]"
              : "bg-[#F4F4F5]",
      ].join(" ")}
    >
      {/* Status icon */}
      {isDone && (
        <Check className="w-3.5 h-3.5 text-[#16A34A] flex-shrink-0" strokeWidth={2.5} />
      )}
      {isInProgress && <span className="w-2 h-2 rounded-full bg-[#2563EB] flex-shrink-0" />}
      {!isDone && !isInProgress && isHigh && (
        <Flag className="w-3.5 h-3.5 text-[#DC2626] flex-shrink-0" fill="currentColor" strokeWidth={0} />
      )}
      {!isDone && !isInProgress && !isHigh && (
        <span className="w-2 h-2 rounded-full border-2 border-[#A1A1AA] flex-shrink-0" />
      )}

      {/* Title */}
      <span
        className={[
          "text-[13px] font-medium truncate flex-1",
          isDone
            ? "text-[#16A34A] line-through"
            : isInProgress
              ? "text-[#2563EB]"
              : "text-[var(--color-text-primary)]",
        ].join(" ")}
      >
        {task.title}
      </span>

      {/* 右侧：时长目标进度 / 手动完成进度 / 开始时间 */}
      {target > 0 ? (
        <span
          className={[
            "flex items-center gap-0.5 text-[11px] font-medium flex-shrink-0",
            reached ? "text-[#16A34A]" : "text-[var(--color-text-tertiary)]",
          ].join(" ")}
        >
          <Timer className="w-3 h-3" />
          {formatMinutes(logged)}/{formatMinutes(target)}
        </span>
      ) : manualPct > 0 && !isDone ? (
        <span className="text-[11px] font-medium text-[var(--color-primary)] flex-shrink-0 tabular-nums">
          {manualPct}%
        </span>
      ) : (
        task.startTime && (
          <span className="text-[11px] text-[var(--color-text-tertiary)] flex-shrink-0">
            {task.startTime}
          </span>
        )
      )}
    </button>
  );
}

// 每天一行：左侧日期列 + 右侧完整任务列表（不再折叠）
function DayRow({
  date,
  tasks,
  entries,
  onTaskClick,
}: {
  date: Date;
  tasks: Task[];
  entries: TimeEntry[];
  onTaskClick: (task: Task) => void;
}) {
  const iso = toISODate(date);
  const isToday = toISODate(new Date()) === iso;
  const dayNum = date.getDate();
  const weekday = CN_WEEKDAY[date.getDay()];

  // 时长目标任务排最前（对应日视图的「不限时段」），其余按开始时间
  const sortedTasks = [...tasks].sort((a, b) => {
    const aKey = a.targetMinutes ? "00:00!" : (a.startTime ?? "99:99");
    const bKey = b.targetMinutes ? "00:00!" : (b.startTime ?? "99:99");
    return aKey.localeCompare(bKey);
  });

  const doneTasks = tasks.filter((t) => t.status === "done").length;
  const totalTasks = tasks.length;

  return (
    <div className="flex gap-3 px-4 py-3 border-b border-[var(--color-border)] last:border-b-0">
      {/* Date column */}
      <div className="w-[56px] flex-shrink-0 flex flex-col items-center gap-0.5 pt-0.5">
        <span
          className={[
            "text-[20px] font-bold leading-none",
            isToday ? "text-[var(--color-primary)]" : "text-[var(--color-text-primary)]",
          ].join(" ")}
        >
          {dayNum}
        </span>
        <span
          className={[
            "text-[11px] font-medium",
            isToday ? "text-[var(--color-primary)]" : "text-[var(--color-text-tertiary)]",
          ].join(" ")}
        >
          {isToday ? "今天" : weekday}
        </span>
        {totalTasks > 0 && (
          <span className="text-[10px] text-[var(--color-text-tertiary)] bg-[var(--color-bg-gray-light)] px-1.5 py-0.5 rounded mt-0.5">
            {doneTasks}/{totalTasks}
          </span>
        )}
      </div>

      {/* Task list（始终展开） */}
      <div className="flex-1 flex flex-col gap-1.5 min-w-0">
        {sortedTasks.length > 0 ? (
          sortedTasks.map((task) => (
            <WeekTaskRow
              key={task.id}
              task={task}
              entries={entries}
              onClick={() => onTaskClick(task)}
            />
          ))
        ) : (
          <span className="text-[12px] text-[var(--color-text-quaternary)] py-2">无任务</span>
        )}
      </div>
    </div>
  );
}

export default function TodoWeekView({
  viewMode,
  onChangeViewMode,
  selectedDate,
  onSelectDate,
  tasks,
  entries,
  onCycleTaskStatus,
  onOpenAddModal,
  onCreateTask,
  onDeleteTask,
  onUpdateTask,
  onAddEntry,
  today,
  aspirations,
  dayPlans,
  onOpenGoals,
  onToggleMainline,
  onPrevWeek,
  onNextWeek,
}: Props) {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false);

  // Get the latest task data from tasks array (real-time update)
  const selectedTask = selectedTaskId ? tasks.find((t) => t.id === selectedTaskId) ?? null : null;

  const selected = parseISODate(selectedDate);
  const weekStart = startOfWeek(selected, true);
  const days = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));

  const rangeLabel = `${weekStart.getFullYear()}年${weekStart.getMonth() + 1}月${weekStart.getDate()}日 - ${addDays(weekStart, 6).getMonth() + 1}月${addDays(weekStart, 6).getDate()}日`;

  // Stats for all tasks in the week
  const weekTasks = tasks.filter((t) => {
    const taskDate = parseISODate(t.date);
    return taskDate >= weekStart && taskDate <= addDays(weekStart, 6);
  });
  const totalTasks = weekTasks.length;
  const doneTasks = weekTasks.filter((t) => t.status === "done").length;

  function handleTaskClick(task: Task) {
    setSelectedTaskId(task.id);
    setIsBottomSheetOpen(true);
  }

  function handleCloseBottomSheet() {
    setIsBottomSheetOpen(false);
    setSelectedTaskId(null);
  }

  return (
    <>
      <div className="w-[420px] bg-white flex flex-col rounded-[16px] overflow-hidden border border-[var(--color-border)]">
        {/* Header */}
        <div className="w-full flex items-center justify-between px-6 pt-6 pb-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-[var(--color-text-primary)] text-[28px] font-bold tracking-[-0.5px]">
              Todo
            </h1>
            <p className="text-[var(--color-text-secondary)] text-[14px] font-medium">{rangeLabel}</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onPrevWeek}
              className="w-9 h-9 rounded-lg border-[1.5px] border-[var(--color-border)] flex items-center justify-center bg-white hover:bg-[var(--color-bg-gray-light)] transition-colors"
              aria-label="上一周"
            >
              <ChevronLeft className="w-4 h-4 text-[var(--color-text-secondary)]" />
            </button>
            <button
              type="button"
              onClick={onNextWeek}
              className="w-9 h-9 rounded-lg border-[1.5px] border-[var(--color-border)] flex items-center justify-center bg-white hover:bg-[var(--color-bg-gray-light)] transition-colors"
              aria-label="下一周"
            >
              <ChevronRight className="w-4 h-4 text-[var(--color-text-secondary)]" />
            </button>
          </div>
        </div>

      <MainlineBar
        today={today}
        aspirations={aspirations}
        dayPlans={dayPlans}
        onOpenGoals={onOpenGoals}
      />

        {/* View Switcher（和日视图/记录/习惯完全一致，切换时按钮不移位） */}
        <div className="w-full px-6 pt-4">
          <div className="w-full flex gap-1 bg-[var(--color-bg-gray-light)] rounded-[10px] p-1">
            {([["day", "日视图"], ["week", "周视图"], ["log", "记录"], ["habit", "习惯"]] as Array<[ViewMode, string]>).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => onChangeViewMode(mode)}
                className={[
                  "flex-1 flex items-center justify-center rounded-lg px-2 py-[10px] transition-colors",
                  viewMode === mode
                    ? "bg-[var(--color-bg-white)] shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
                    : "",
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

        {/* 本周完成/未完成（原来挤在 tab 右边，把 tab 挤窄了，切过来按钮就移位） */}
        <div className="w-full flex items-center gap-3 px-6 pt-2.5 text-[12px] font-medium">
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#16A34A]" />
            <span className="text-[var(--color-text-secondary)]">已完成 {doneTasks}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#DC2626]" />
            <span className="text-[var(--color-text-secondary)]">未完成 {totalTasks - doneTasks}</span>
          </div>
        </div>

        {/* AI 一句话建任务 */}
        <div className="px-6 pt-4 pb-4">
          <QuickAddTask onCreate={onCreateTask} />
        </div>

        <MainlinePlanner
          days={days}
          today={toISODate(new Date()) as ISODate}
          aspirations={aspirations}
          dayPlans={dayPlans}
          onToggle={onToggleMainline}
        />

        {/* Week Days List */}
        <div className="flex-1 flex flex-col border-t border-[var(--color-border)] overflow-y-auto">
          {days.map((d) => {
            const iso = toISODate(d);
            const dayTasks = tasks.filter((t) => t.date === iso);
            return (
              <DayRow
                key={iso}
                date={d}
                tasks={dayTasks}
                entries={entries}
                onTaskClick={handleTaskClick}
              />
            );
          })}
        </div>

        {/* Add Task Button - Fixed at bottom */}
        <div className="px-4 py-4 border-t border-[var(--color-border)]">
          <button
            onClick={onOpenAddModal}
            className="w-full flex items-center justify-center gap-2 bg-[var(--color-primary)] rounded-xl py-3 hover:bg-[#1d4ed8] transition-colors"
          >
            <Plus className="w-4 h-4 text-white" strokeWidth={2} />
            <span className="text-white text-[14px] font-semibold">新增任务</span>
          </button>
        </div>
      </div>

      {/* Bottom Sheet */}
      <TaskBottomSheet
        task={selectedTask}
        entries={entries}
        isOpen={isBottomSheetOpen}
        onClose={handleCloseBottomSheet}
        onCycleStatus={onCycleTaskStatus}
        onDelete={onDeleteTask}
        onUpdate={onUpdateTask}
        onAddEntry={onAddEntry}
      />
    </>
  );
}
