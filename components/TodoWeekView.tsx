"use client";

import { useState } from "react";
import type { ISODate, Task, ViewMode } from "@/components/todo/types";
import { CN_WEEKDAY, addDays, parseISODate, startOfWeek, toISODate } from "@/components/todo/date";
import { Plus, ChevronLeft, ChevronRight, Check, Flag, ChevronDown, ChevronUp } from "lucide-react";
import TaskBottomSheet from "@/components/TaskBottomSheet";

type Props = {
  viewMode: ViewMode;
  onChangeViewMode: (mode: ViewMode) => void;
  selectedDate: ISODate;
  onSelectDate: (date: ISODate) => void;
  tasks: Task[];
  onCycleTaskStatus: (taskId: string) => void;
  onOpenAddModal: () => void;
  onDeleteTask: (taskId: string) => void;
  onUpdateTask: (taskId: string, updates: Partial<Omit<Task, "id">>) => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
};

// 任务 Chip 组件
function TaskChip({
  task,
  onClick,
}: {
  task: Task;
  onClick: () => void;
}) {
  const isDone = task.status === "done";
  const isInProgress = task.status === "in_progress";
  const isHigh = task.priority === "high";

  const bgColor = isDone
    ? "bg-[#DCFCE7]"
    : isInProgress
      ? "bg-[#EFF6FF]"
      : isHigh
        ? "bg-[#FEF2F2]"
        : "bg-[#F4F4F5]";

  const textColor = isDone
    ? "text-[#16A34A]"
    : isInProgress
      ? "text-[#2563EB]"
      : isHigh
        ? "text-[#DC2626]"
        : "text-[#18181B]";

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={[
        "inline-flex items-center gap-1 px-2 py-1 rounded-md text-[12px] font-medium truncate max-w-[100px]",
        bgColor,
        textColor,
        isDone ? "line-through" : "",
      ].join(" ")}
    >
      {isDone && <Check className="w-3 h-3 flex-shrink-0" strokeWidth={2.5} />}
      {isInProgress && <span className="w-1.5 h-1.5 rounded-full bg-current flex-shrink-0" />}
      {isHigh && !isDone && !isInProgress && <Flag className="w-3 h-3 flex-shrink-0" fill="currentColor" strokeWidth={0} />}
      <span className="truncate">{task.title}</span>
    </button>
  );
}

// +N 按钮组件
function MoreChip({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="inline-flex items-center px-2 py-1 rounded-md text-[12px] font-medium bg-[#E4E4E7] text-[#71717A]"
    >
      +{count}
    </button>
  );
}

// 每天一行的组件
function DayRow({
  date,
  tasks,
  isExpanded,
  onToggleExpand,
  onTaskClick,
}: {
  date: Date;
  tasks: Task[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  onTaskClick: (task: Task) => void;
}) {
  const iso = toISODate(date);
  const isToday = toISODate(new Date()) === iso;
  const dayNum = date.getDate();
  const weekday = CN_WEEKDAY[date.getDay()];

  // 按开始时间排序
  const sortedTasks = [...tasks].sort((a, b) =>
    (a.startTime ?? "99:99").localeCompare(b.startTime ?? "99:99")
  );

  const doneTasks = tasks.filter((t) => t.status === "done").length;
  const totalTasks = tasks.length;

  // 默认最多显示 3 个 chips
  const MAX_VISIBLE = 3;
  const visibleTasks = isExpanded ? sortedTasks : sortedTasks.slice(0, MAX_VISIBLE);
  const hiddenCount = sortedTasks.length - MAX_VISIBLE;
  const showMore = !isExpanded && hiddenCount > 0;

  return (
    <div className="border-b border-[var(--color-border)] last:border-b-0">
      {/* Day header row */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[var(--color-bg-gray-lighter)] transition-colors"
        onClick={onToggleExpand}
      >
        {/* Date info */}
        <div className="flex items-center gap-2 w-[80px] flex-shrink-0">
          <div className="flex flex-col items-center">
            <span className={[
              "text-[20px] font-bold",
              isToday ? "text-[var(--color-primary)]" : "text-[var(--color-text-primary)]",
            ].join(" ")}>
              {dayNum}
            </span>
            <span className={[
              "text-[11px] font-medium",
              isToday ? "text-[var(--color-primary)]" : "text-[var(--color-text-tertiary)]",
            ].join(" ")}>
              {weekday}
            </span>
          </div>
          {/* Task count */}
          {totalTasks > 0 && (
            <span className="text-[11px] text-[var(--color-text-tertiary)] bg-[var(--color-bg-gray-light)] px-1.5 py-0.5 rounded">
              {doneTasks}/{totalTasks}
            </span>
          )}
        </div>

        {/* Task chips - 默认态 */}
        {!isExpanded && (
          <div className="flex-1 flex items-center gap-1.5 overflow-hidden">
            {visibleTasks.map((task) => (
              <TaskChip key={task.id} task={task} onClick={() => onTaskClick(task)} />
            ))}
            {showMore && <MoreChip count={hiddenCount} onClick={onToggleExpand} />}
            {totalTasks === 0 && (
              <span className="text-[12px] text-[var(--color-text-quaternary)]">无任务</span>
            )}
          </div>
        )}

        {/* Expand/collapse arrow */}
        {totalTasks > 0 && (
          <button
            type="button"
            className="w-6 h-6 flex items-center justify-center flex-shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand();
            }}
          >
            {isExpanded ? (
              <ChevronUp className="w-4 h-4 text-[var(--color-text-tertiary)]" />
            ) : (
              <ChevronDown className="w-4 h-4 text-[var(--color-text-tertiary)]" />
            )}
          </button>
        )}
      </div>

      {/* Expanded task list */}
      {isExpanded && totalTasks > 0 && (
        <div className="px-4 pb-3 pl-[96px]">
          <div className="flex flex-col gap-2 max-h-[200px] overflow-y-auto">
            {sortedTasks.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => onTaskClick(task)}
                className={[
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors",
                  task.status === "done"
                    ? "bg-[#DCFCE7]"
                    : task.status === "in_progress"
                      ? "bg-[#EFF6FF]"
                      : task.priority === "high"
                        ? "bg-[#FEF2F2]"
                        : "bg-[#F4F4F5]",
                ].join(" ")}
              >
                {/* Status icon */}
                {task.status === "done" && (
                  <Check className="w-3.5 h-3.5 text-[#16A34A] flex-shrink-0" strokeWidth={2.5} />
                )}
                {task.status === "in_progress" && (
                  <span className="w-2 h-2 rounded-full bg-[#2563EB] flex-shrink-0" />
                )}
                {task.status === "todo" && task.priority === "high" && (
                  <Flag className="w-3.5 h-3.5 text-[#DC2626] flex-shrink-0" fill="currentColor" strokeWidth={0} />
                )}
                {task.status === "todo" && task.priority !== "high" && (
                  <span className="w-2 h-2 rounded-full border-2 border-[#A1A1AA] flex-shrink-0" />
                )}

                {/* Title */}
                <span className={[
                  "text-[13px] font-medium truncate flex-1",
                  task.status === "done" ? "text-[#16A34A] line-through" : "",
                  task.status === "in_progress" ? "text-[#2563EB]" : "",
                  task.status === "todo" ? "text-[var(--color-text-primary)]" : "",
                ].join(" ")}>
                  {task.title}
                </span>

                {/* Time if exists */}
                {task.startTime && (
                  <span className="text-[11px] text-[var(--color-text-tertiary)] flex-shrink-0">
                    {task.startTime}
                  </span>
                )}
              </button>
            ))}
          </div>
          {/* Collapse button */}
          <button
            type="button"
            onClick={onToggleExpand}
            className="flex items-center gap-1 mt-2 text-[12px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
          >
            <ChevronUp className="w-3 h-3" />
            收起
          </button>
        </div>
      )}
    </div>
  );
}

export default function TodoWeekView({
  viewMode,
  onChangeViewMode,
  selectedDate,
  onSelectDate,
  tasks,
  onCycleTaskStatus,
  onOpenAddModal,
  onDeleteTask,
  onUpdateTask,
  onPrevWeek,
  onNextWeek,
}: Props) {
  const [expandedDay, setExpandedDay] = useState<ISODate | null>(null);
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

  function handleToggleExpand(iso: ISODate) {
    setExpandedDay(expandedDay === iso ? null : iso);
  }

  function handleCloseBottomSheet() {
    setIsBottomSheetOpen(false);
    setSelectedTaskId(null);
  }

  return (
    <>
      <div className="w-[420px] bg-white flex flex-col rounded-[16px] overflow-hidden border border-[var(--color-border)]">
        {/* Header */}
        <div className="w-full flex items-center justify-between px-4 pt-5 pb-3">
          <div className="flex flex-col gap-0.5">
            <h1 className="text-[var(--color-text-primary)] text-[24px] font-bold tracking-[-0.5px]">
              Todo
            </h1>
            <p className="text-[var(--color-text-secondary)] text-[13px] font-medium">{rangeLabel}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onPrevWeek}
              className="w-8 h-8 rounded-lg border border-[var(--color-border)] flex items-center justify-center bg-white hover:bg-[var(--color-bg-gray-light)] transition-colors"
              aria-label="上一周"
            >
              <ChevronLeft className="w-4 h-4 text-[var(--color-text-secondary)]" />
            </button>
            <button
              type="button"
              onClick={onNextWeek}
              className="w-8 h-8 rounded-lg border border-[var(--color-border)] flex items-center justify-center bg-white hover:bg-[var(--color-bg-gray-light)] transition-colors"
              aria-label="下一周"
            >
              <ChevronRight className="w-4 h-4 text-[var(--color-text-secondary)]" />
            </button>
          </div>
        </div>

        {/* View Switcher + Stats */}
        <div className="w-full flex items-center justify-between px-4 pb-3">
          <div className="flex gap-1 bg-[var(--color-bg-gray-light)] rounded-[10px] p-1">
            <button
              type="button"
              onClick={() => onChangeViewMode("day")}
              className={[
                "flex items-center justify-center rounded-lg px-4 py-2 transition-all",
                viewMode === "day"
                  ? "bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
                  : "hover:bg-white/50",
              ].join(" ")}
            >
              <span
                className={[
                  "text-[13px]",
                  viewMode === "day"
                    ? "text-[var(--color-text-primary)] font-semibold"
                    : "text-[var(--color-text-secondary)] font-medium",
                ].join(" ")}
              >
                日
              </span>
            </button>
            <button
              type="button"
              onClick={() => onChangeViewMode("week")}
              className={[
                "flex items-center justify-center rounded-lg px-4 py-2 transition-all",
                viewMode === "week"
                  ? "bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
                  : "hover:bg-white/50",
              ].join(" ")}
            >
              <span
                className={[
                  "text-[13px]",
                  viewMode === "week"
                    ? "text-[var(--color-text-primary)] font-semibold"
                    : "text-[var(--color-text-secondary)] font-medium",
                ].join(" ")}
              >
                周
              </span>
            </button>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-3 text-[12px] font-medium">
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#16A34A]" />
              <span className="text-[var(--color-text-secondary)]">{doneTasks}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#DC2626]" />
              <span className="text-[var(--color-text-secondary)]">{totalTasks - doneTasks}</span>
            </div>
          </div>
        </div>

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
                isExpanded={expandedDay === iso}
                onToggleExpand={() => handleToggleExpand(iso)}
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
        isOpen={isBottomSheetOpen}
        onClose={handleCloseBottomSheet}
        onCycleStatus={onCycleTaskStatus}
        onDelete={onDeleteTask}
        onUpdate={onUpdateTask}
      />
    </>
  );
}
