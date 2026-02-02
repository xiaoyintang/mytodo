"use client";

import { useState, useRef, useEffect } from "react";
import type { ISODate, Task, ViewMode } from "@/components/todo/types";
import { CN_WEEKDAY, addDays, parseISODate, startOfWeek, toISODate } from "@/components/todo/date";
import { Plus, ChevronLeft, ChevronRight, Check, Flag, Trash2, Calendar, Clock } from "lucide-react";

type Props = {
  viewMode: ViewMode;
  onChangeViewMode: (mode: ViewMode) => void;
  selectedDate: ISODate;
  onSelectDate: (date: ISODate) => void;
  tasks: Task[];
  onCycleTaskStatus: (taskId: string) => void;
  onOpenAddModal: () => void;
  onDeleteTask: (taskId: string) => void;
};

// Hover Card Component
function TaskHoverCard({ task, position }: { task: Task; position: { top: number; left: number } }) {
  const isDone = task.status === "done";
  const isInProgress = task.status === "in_progress";
  const isHigh = task.priority === "high";

  const statusLabel = isDone ? "已完成" : isInProgress ? "进行中" : "待办";
  const statusColor = isDone
    ? "bg-[#DCFCE7] text-[#16A34A]"
    : isInProgress
      ? "bg-[#EFF6FF] text-[#2563EB]"
      : "bg-[#FEF2F2] text-[#DC2626]";

  const taskDate = parseISODate(task.date);
  const weekdayNames = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const dateStr = `${taskDate.getMonth() + 1}月${taskDate.getDate()}日 ${weekdayNames[taskDate.getDay()]}`;

  const timeStr =
    task.startTime && task.endTime
      ? `${task.startTime} - ${task.endTime}`
      : task.startTime
        ? task.startTime
        : null;

  return (
    <div
      className="fixed z-[9999] w-[240px] bg-white rounded-xl border border-[#E4E4E7] shadow-[0_4px_16px_-2px_rgba(0,0,0,0.1),0_8px_24px_-4px_rgba(0,0,0,0.08)] pointer-events-none"
      style={{ top: position.top, left: position.left }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex gap-2.5 p-3 pb-2.5">
        {/* Status Icon */}
        <div
          className={[
            "w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0",
            isDone ? "bg-[#DCFCE7]" : isInProgress ? "bg-[#EFF6FF]" : isHigh ? "bg-[#FEF2F2]" : "bg-[#F4F4F5]",
          ].join(" ")}
        >
          {isDone ? (
            <Check className="w-3 h-3 text-[#16A34A]" strokeWidth={2.5} />
          ) : isInProgress ? (
            <div className="w-2 h-2 rounded-full bg-[#2563EB]" />
          ) : isHigh ? (
            <div className="w-2 h-2 rounded-full bg-[#DC2626]" />
          ) : (
            <div className="w-2 h-2 rounded-full bg-[#A1A1AA]" />
          )}
        </div>
        {/* Title + Status */}
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <span className="text-[13px] font-semibold text-[#18181B] leading-[1.4]">{task.title}</span>
          <span className={["text-[11px] font-medium px-2 py-0.5 rounded w-fit", statusColor].join(" ")}>
            {statusLabel}
          </span>
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-[#F4F4F5] mx-0" />

      {/* Content */}
      <div className="flex flex-col gap-2.5 p-3 pt-2.5">
        {/* Tags */}
        <div className="flex flex-wrap gap-1.5">
          {isHigh && (
            <span className="text-[11px] font-medium px-2 py-1 rounded-full bg-[#FEF2F2] text-[#DC2626] flex items-center gap-1">
              <Flag className="w-3 h-3" fill="currentColor" strokeWidth={0} />
              高优
            </span>
          )}
          {task.tag && (
            <span className="text-[11px] font-medium px-2 py-1 rounded-full bg-[#EFF6FF] text-[#2563EB] flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              {task.tag}
            </span>
          )}
        </div>

        {/* Date & Time Row */}
        <div className="flex items-center gap-1.5 text-[11px] text-[#71717A]">
          <Calendar className="w-3 h-3 text-[#A1A1AA]" />
          <span>{dateStr}</span>
          {timeStr && (
            <>
              <Clock className="w-3 h-3 text-[#A1A1AA] ml-1.5" />
              <span>{timeStr}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Task Item Component
function WeekTaskItem({
  task,
  onCycleStatus,
  onDelete,
}: {
  task: Task;
  onCycleStatus: (taskId: string) => void;
  onDelete: (taskId: string) => void;
}) {
  const [showHoverCard, setShowHoverCard] = useState(false);
  const [hoverPosition, setHoverPosition] = useState({ top: 0, left: 0 });
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const itemRef = useRef<HTMLDivElement>(null);

  const isDone = task.status === "done";
  const isInProgress = task.status === "in_progress";
  const isHigh = task.priority === "high";

  // Handle mouse enter with delay
  function handleMouseEnter() {
    hoverTimeoutRef.current = setTimeout(() => {
      if (itemRef.current) {
        const rect = itemRef.current.getBoundingClientRect();
        // Position to the right of the item, or left if near edge
        const viewportWidth = window.innerWidth;
        const cardWidth = 240;
        let left = rect.right + 8;
        if (left + cardWidth > viewportWidth - 20) {
          left = rect.left - cardWidth - 8;
        }
        setHoverPosition({ top: rect.top, left });
      }
      setShowHoverCard(true);
    }, 200);
  }

  // Handle mouse leave
  function handleMouseLeave() {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    setShowHoverCard(false);
  }

  // Simple click: cycle through todo → in_progress → done → todo
  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    onCycleStatus(task.id);
  }

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (window.confirm("确定要删除这个任务吗？")) {
      onDelete(task.id);
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    };
  }, []);

  return (
    <div
      ref={itemRef}
      className="relative group/item"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div
        className={[
          "relative flex items-center gap-1.5 rounded-lg px-2 py-1.5 cursor-pointer text-left transition-all",
          isDone
            ? "bg-[var(--color-success-light)]"
            : isInProgress
              ? "bg-[var(--color-primary-light)]"
              : isHigh
                ? "bg-[var(--color-danger-light)]"
                : "bg-[var(--color-bg-gray-light)]",
        ].join(" ")}
        onClick={handleClick}
      >
        {/* Status Icon */}
        <div className="flex-shrink-0">
          {isDone ? (
            <Check className="w-3.5 h-3.5 text-[var(--color-success)]" strokeWidth={2.5} />
          ) : isInProgress ? (
            <div className="w-3.5 h-3.5 flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-[var(--color-primary)]" />
            </div>
          ) : isHigh ? (
            <Flag className="w-3.5 h-3.5 text-[var(--color-danger)]" fill="currentColor" strokeWidth={0} />
          ) : (
            <div className="w-3.5 h-3.5 rounded-full border-2 border-[#A1A1AA]" />
          )}
        </div>

        {/* Title - single line truncate */}
        <span
          className={[
            "text-[12px] font-medium truncate flex-1 pr-4",
            isDone
              ? "text-[var(--color-success)] line-through"
              : isInProgress
                ? "text-[var(--color-primary)]"
                : "text-[var(--color-text-primary)]",
          ].join(" ")}
        >
          {task.title}
        </span>

        {/* Delete button - hover only */}
        <button
          type="button"
          onClick={handleDelete}
          className="absolute top-1 right-1 w-4 h-4 flex items-center justify-center rounded bg-white/80 opacity-0 group-hover/item:opacity-100 hover:bg-[var(--color-danger-light)] transition-all"
        >
          <Trash2 className="w-2.5 h-2.5 text-[var(--color-danger)]" />
        </button>
      </div>

      {/* Hover Card - fixed position to avoid clipping */}
      {showHoverCard && <TaskHoverCard task={task} position={hoverPosition} />}
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
}: Props) {
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
  const pendingTasks = totalTasks - doneTasks;

  return (
    <div className="w-[960px] bg-white flex flex-col rounded-[16px] overflow-hidden border border-[var(--color-border)]">
      {/* Header */}
      <div className="w-full flex items-center justify-between px-8 pt-6 pb-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-[var(--color-text-primary)] text-[28px] font-bold tracking-[-0.5px]">
            Todo
          </h1>
          <p className="text-[var(--color-text-secondary)] text-[14px] font-medium">{rangeLabel}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="w-9 h-9 rounded-lg border-[1.5px] border-[var(--color-border)] flex items-center justify-center bg-white hover:bg-[var(--color-bg-gray-light)] transition-colors"
            aria-label="上一周"
          >
            <ChevronLeft className="w-4 h-4 text-[var(--color-text-secondary)]" />
          </button>
          <button
            type="button"
            className="w-9 h-9 rounded-lg border-[1.5px] border-[var(--color-border)] flex items-center justify-center bg-white hover:bg-[var(--color-bg-gray-light)] transition-colors"
            aria-label="下一周"
          >
            <ChevronRight className="w-4 h-4 text-[var(--color-text-secondary)]" />
          </button>
          <button
            onClick={onOpenAddModal}
            className="flex items-center gap-[6px] bg-[var(--color-primary)] rounded-lg px-[14px] py-2 hover:bg-[#1d4ed8] transition-colors"
          >
            <Plus className="w-4 h-4 text-white" strokeWidth={2} />
            <span className="text-white text-[14px] font-semibold">新增任务</span>
          </button>
        </div>
      </div>

      {/* View Switcher + Stats */}
      <div className="w-full flex items-center justify-between px-8 pb-4">
        <div className="flex gap-1 bg-[var(--color-bg-gray-light)] rounded-[10px] p-1 w-[240px]">
          <button
            type="button"
            onClick={() => onChangeViewMode("day")}
            className={[
              "flex-1 flex items-center justify-center rounded-lg px-4 py-[10px] transition-all",
              viewMode === "day"
                ? "bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
                : "hover:bg-white/50",
            ].join(" ")}
          >
            <span
              className={[
                "text-[14px]",
                viewMode === "day"
                  ? "text-[var(--color-text-primary)] font-semibold"
                  : "text-[var(--color-text-secondary)] font-medium",
              ].join(" ")}
            >
              日视图
            </span>
          </button>
          <button
            type="button"
            onClick={() => onChangeViewMode("week")}
            className={[
              "flex-1 flex items-center justify-center rounded-lg px-4 py-[10px] transition-all",
              viewMode === "week"
                ? "bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
                : "hover:bg-white/50",
            ].join(" ")}
          >
            <span
              className={[
                "text-[14px]",
                viewMode === "week"
                  ? "text-[var(--color-text-primary)] font-semibold"
                  : "text-[var(--color-text-secondary)] font-medium",
              ].join(" ")}
            >
              周视图
            </span>
          </button>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-6 text-[13px] font-medium">
          <div className="flex items-center gap-2">
            <span className="text-[var(--color-text-primary)] font-semibold text-[16px]">{totalTasks}</span>
            <span className="text-[var(--color-text-tertiary)]">总任务</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[var(--color-success)] font-semibold text-[16px]">{doneTasks}</span>
            <span className="text-[var(--color-text-tertiary)]">已完成</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[var(--color-danger)] font-semibold text-[16px]">{pendingTasks}</span>
            <span className="text-[var(--color-text-tertiary)]">待完成</span>
          </div>
        </div>
      </div>

      {/* Week Grid - 7 columns */}
      <div className="w-full flex gap-3 px-8 pb-8">
        {days.map((d) => {
          const iso = toISODate(d);
          const isSelected = iso === selectedDate;
          const isToday = toISODate(new Date()) === iso;
          const dayTasks = tasks
            .filter((t) => t.date === iso)
            .sort((a, b) => (a.startTime ?? "99:99").localeCompare(b.startTime ?? "99:99"));

          const dayDoneTasks = dayTasks.filter((t) => t.status === "done").length;
          const dayTotalTasks = dayTasks.length;

          return (
            <div
              key={iso}
              role="button"
              tabIndex={0}
              onClick={() => onSelectDate(iso)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectDate(iso);
                }
              }}
              className={[
                "flex-1 flex flex-col rounded-[12px] border-[1.5px] overflow-hidden h-[320px] cursor-pointer",
                isSelected
                  ? "border-[var(--color-primary)] border-2"
                  : "border-[var(--color-border)]",
              ].join(" ")}
            >
              {/* Day Header */}
              <div
                className={[
                  "w-full flex flex-col items-center gap-0.5 py-2.5 px-2",
                  isSelected ? "bg-[var(--color-primary)]" : "bg-[var(--color-bg-gray-lighter)]",
                ].join(" ")}
              >
                <span
                  className={[
                    "text-[12px] font-semibold",
                    isSelected ? "text-white/80" : "text-[var(--color-text-tertiary)]",
                  ].join(" ")}
                >
                  {CN_WEEKDAY[d.getDay()]}
                </span>
                <span
                  className={[
                    "text-[20px] font-bold",
                    isSelected ? "text-white" : "text-[var(--color-text-primary)]",
                  ].join(" ")}
                >
                  {d.getDate()}
                </span>
                {/* Today badge or Task count */}
                {isToday && isSelected ? (
                  <span className="text-[10px] font-semibold text-white bg-white/20 px-2 py-0.5 rounded-full">
                    今天
                  </span>
                ) : dayTotalTasks > 0 ? (
                  <span
                    className={[
                      "text-[10px] font-medium flex items-center gap-1",
                      isSelected ? "text-white/80" : "text-[var(--color-text-tertiary)]",
                    ].join(" ")}
                  >
                    <Check className="w-3 h-3" strokeWidth={2.5} />
                    {dayDoneTasks} / {dayTotalTasks}
                  </span>
                ) : (
                  <span className="text-[10px] h-4" />
                )}
              </div>

              {/* Day Content - Task List with scroll */}
              <div className="flex-1 flex flex-col gap-1.5 p-2 overflow-y-auto scrollbar-thin">
                {dayTasks.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center">
                    <span className="text-[12px] text-[var(--color-text-quaternary)]">无任务</span>
                  </div>
                ) : (
                  dayTasks.map((t) => (
                    <WeekTaskItem
                      key={t.id}
                      task={t}
                      onCycleStatus={onCycleTaskStatus}
                      onDelete={onDeleteTask}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
