"use client";

import { useState } from "react";
import type { ISODate, Task, TimeEntry, ViewMode } from "@/components/todo/types";
import { CN_WEEKDAY, addDays, formatCNDateTitle, parseISODate, startOfWeek, toISODate } from "@/components/todo/date";
import { formatMinutes, taskLoggedMinutes } from "@/components/todo/time";
import { Plus, Check, Flag, Trash2, ChevronLeft, ChevronRight, Pencil, Timer } from "lucide-react";
import TaskBottomSheet from "@/components/TaskBottomSheet";
import ConfirmDialog from "@/components/ConfirmDialog";
import QuickAddTask from "@/components/QuickAddTask";

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
  onPrevWeek: () => void;
  onNextWeek: () => void;
};

function timeLabel(t: Task) {
  if (t.startTime && t.endTime) return `${t.startTime} - ${t.endTime}`;
  if (t.startTime) return t.startTime;
  return "";
}

// 分组规则：时长目标任务单独一组「不限时段」；其余按开始时间 00:00-11:59 上午，12:00-17:59 下午，18:00+ 晚间
function sectionForTask(t: Task): "不限时段" | "上午" | "下午" | "晚间" {
  if (t.targetMinutes) return "不限时段"; // 柳比歇夫模式：不限定几点做
  if (!t.startTime) return "晚间"; // 无时间的放到晚间
  const h = Number(t.startTime.slice(0, 2));
  if (h < 12) return "上午";
  if (h < 18) return "下午";
  return "晚间";
}

// 状态圆圈组件
function StatusIndicator({ status, onClick }: { status: Task["status"]; onClick: () => void }) {
  const isDone = status === "done";
  const isInProgress = status === "in_progress";

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={[
        "w-[22px] h-[22px] rounded-[6px] flex items-center justify-center flex-shrink-0 transition-colors",
        isDone
          ? "bg-[var(--color-primary)]"
          : isInProgress
            ? "border-2 border-[var(--color-primary)] bg-white"
            : "border-[1.5px] border-[var(--color-border)] bg-white hover:border-[var(--color-text-tertiary)]",
      ].join(" ")}
    >
      {isDone ? (
        <Check className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
      ) : isInProgress ? (
        // 空心圆里有实心小圆点
        <div className="w-2 h-2 rounded-full bg-[var(--color-primary)]" />
      ) : null}
    </button>
  );
}

export default function TodoDayView({
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
  onPrevWeek,
  onNextWeek,
}: Props) {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  // Get the latest task data from tasks array
  const selectedTask = selectedTaskId ? tasks.find((t) => t.id === selectedTaskId) ?? null : null;
  const deleteTarget = deleteTargetId ? tasks.find((t) => t.id === deleteTargetId) ?? null : null;

  function handleDelete(e: React.MouseEvent, taskId: string) {
    e.stopPropagation();
    setDeleteTargetId(taskId);
  }

  function handleStartEdit(e: React.MouseEvent, task: Task) {
    e.stopPropagation();
    setSelectedTaskId(task.id);
    setIsBottomSheetOpen(true);
  }

  function handleCloseBottomSheet() {
    setIsBottomSheetOpen(false);
    setSelectedTaskId(null);
  }
  const selected = parseISODate(selectedDate);
  const weekStart = startOfWeek(selected, true);
  const days = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));

  const dayTasks = tasks
    .filter((t) => t.date === selectedDate)
    .slice()
    .sort((a, b) => (a.startTime ?? "99:99").localeCompare(b.startTime ?? "99:99"));

  const groups = {
    不限时段: dayTasks.filter((t) => sectionForTask(t) === "不限时段"),
    上午: dayTasks.filter((t) => sectionForTask(t) === "上午"),
    下午: dayTasks.filter((t) => sectionForTask(t) === "下午"),
    晚间: dayTasks.filter((t) => sectionForTask(t) === "晚间"),
  } as const;

  return (
    <div className="w-[420px] bg-[var(--color-bg-white)] flex flex-col rounded-[16px] overflow-hidden border border-[var(--color-border)]">
      {/* Header */}
      <div className="w-full flex items-center justify-between px-6 pt-6 pb-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-[var(--color-text-primary)] text-[28px] font-bold tracking-[-0.5px]">
            Todo
          </h1>
          <p className="text-[var(--color-text-secondary)] text-[14px] font-medium">
            {formatCNDateTitle(selected)}
          </p>
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
          <button
            onClick={onOpenAddModal}
            className="flex items-center gap-1 bg-[var(--color-primary)] rounded-lg px-3 py-2 hover:bg-[#1d4ed8] transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4 text-white flex-shrink-0" strokeWidth={2} />
            <span className="text-white text-[13px] font-semibold">
              新增
            </span>
          </button>
        </div>
      </div>

      {/* View Switcher Section */}
      <div className="w-full flex flex-col gap-4 px-6">
        {/* Tab Container */}
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

        {/* Date Picker */}
        <div className="w-full flex items-center justify-between">
          {days.map((d) => {
            const iso = toISODate(d);
            const isSelected = iso === selectedDate;
            const isToday = iso === toISODate(new Date());
            return (
              <button
                key={iso}
                type="button"
                onClick={() => onSelectDate(iso)}
                className={[
                  "flex flex-col items-center gap-[6px] px-3 py-2 rounded-[12px]",
                  isSelected ? "bg-[var(--color-primary)]" : isToday ? "bg-[var(--color-primary-light)]" : "",
                ].join(" ")}
              >
                <span
                  className={[
                    "text-[12px] font-medium",
                    isSelected
                      ? "text-[var(--color-bg-white)] font-semibold"
                      : isToday
                        ? "text-[var(--color-primary)] font-semibold"
                        : "text-[var(--color-text-tertiary)]",
                  ].join(" ")}
                >
                  {isToday ? "今天" : CN_WEEKDAY[d.getDay()]}
                </span>
                <span
                  className={[
                    "text-[16px] font-semibold",
                    isSelected
                      ? "text-[var(--color-bg-white)] font-bold"
                      : isToday
                        ? "text-[var(--color-primary)] font-bold"
                        : "text-[var(--color-text-secondary)]",
                  ].join(" ")}
                >
                  {d.getDate()}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Content Area */}
      <div className="w-full flex flex-col gap-6 px-6 pt-4 pb-6">
        {/* AI 一句话建任务（直接在页面上，无需点新增） */}
        <QuickAddTask onCreate={onCreateTask} />

        {(Object.keys(groups) as Array<keyof typeof groups>).map((section) => {
          const sectionTasks = groups[section];
          if (sectionTasks.length === 0) return null;
          return (
            <div key={section} className="w-full flex flex-col gap-3">
              <div className="w-full flex items-center justify-between">
                <span className="text-[var(--color-text-primary)] text-[16px] font-semibold">{section}</span>
                <span className="text-[var(--color-text-tertiary)] text-[13px] font-medium">
                  {sectionTasks.length} 项任务
                </span>
              </div>
              <div className="w-full flex flex-col gap-2">
                {sectionTasks.map((t) => {
                  const isDone = t.status === "done";
                  const isInProgress = t.status === "in_progress";
                  const isHigh = t.priority === "high";
                  const time = timeLabel(t);
                  const target = t.targetMinutes ?? 0;
                  const logged = target > 0 ? taskLoggedMinutes(t, entries) : 0;
                  const reached = target > 0 && logged >= target;
                  const manualPct = target > 0 ? 0 : (t.progress ?? 0);

                  return (
                    <div
                      key={t.id}
                      className={[
                        "relative w-full flex items-center gap-3 px-3.5 py-3 rounded-[10px] cursor-pointer transition-colors bg-white",
                        isInProgress
                          ? "border-[1.5px] border-[var(--color-primary)]"
                          : "border border-[var(--color-border)]",
                      ].join(" ")}
                      onClick={() => onCycleTaskStatus(t.id)}
                    >
                      {/* Status Indicator */}
                      <StatusIndicator status={t.status} onClick={() => onCycleTaskStatus(t.id)} />

                      {/* Task Content: 标题在上，时间+标签在下 */}
                      <div className="flex-1 flex flex-col gap-0.5 min-w-0">
                        {/* Title */}
                        <span
                          className={[
                            "text-[14px] font-medium truncate",
                            isDone ? "text-[var(--color-text-secondary)] line-through" : "text-[var(--color-text-primary)]",
                          ].join(" ")}
                        >
                          {t.title}
                        </span>

                        {/* 时长目标进度（柳比歇夫模式任务） */}
                        {target > 0 && (
                          <div className="flex items-center gap-2 mt-0.5">
                            <div className="flex-1 h-[6px] rounded-full bg-[var(--color-bg-gray-light)] overflow-hidden max-w-[140px]">
                              <div
                                className={[
                                  "h-full rounded-full transition-all",
                                  reached ? "bg-[var(--color-success)]" : "bg-[var(--color-primary)]",
                                ].join(" ")}
                                style={{ width: `${Math.min(100, Math.round((logged / target) * 100))}%` }}
                              />
                            </div>
                            <span className={[
                              "text-[11px] font-medium flex items-center gap-0.5",
                              reached ? "text-[var(--color-success)]" : "text-[var(--color-text-tertiary)]",
                            ].join(" ")}>
                              <Timer className="w-3 h-3" />
                              {formatMinutes(logged)} / {formatMinutes(target)}
                            </span>
                          </div>
                        )}

                        {/* 手动完成进度（非时长目标、进行中的任务） */}
                        {manualPct > 0 && !isDone && (
                          <div className="flex items-center gap-2 mt-0.5">
                            <div className="flex-1 h-[6px] rounded-full bg-[var(--color-bg-gray-light)] overflow-hidden max-w-[140px]">
                              <div
                                className="h-full rounded-full bg-[var(--color-primary)]"
                                style={{ width: `${manualPct}%` }}
                              />
                            </div>
                            <span className="text-[11px] font-medium text-[var(--color-text-tertiary)]">
                              {manualPct}%
                            </span>
                          </div>
                        )}

                        {/* 时间 + 标签 在第二行 */}
                        <div className="flex items-center gap-2 flex-wrap">
                          {time && (
                            <span className={[
                              "text-[12px] font-medium",
                              isInProgress ? "text-[var(--color-primary)]" : "text-[var(--color-text-tertiary)]",
                            ].join(" ")}>
                              {time}
                            </span>
                          )}
                          {/* 标签/状态 */}
                          {isDone ? (
                            <div className="bg-[var(--color-success-light)] rounded px-1.5 py-0.5">
                              <span className="text-[var(--color-success)] text-[10px] font-medium">已完成</span>
                            </div>
                          ) : isInProgress ? (
                            <div className="bg-[var(--color-primary)] rounded px-1.5 py-0.5">
                              <span className="text-white text-[10px] font-semibold">进行中</span>
                            </div>
                          ) : null}
                          {t.tag && !isDone && !isInProgress && (
                            <div className="bg-[#DBEAFE] rounded px-1.5 py-0.5">
                              <span className="text-[var(--color-primary)] text-[10px] font-medium">{t.tag}</span>
                            </div>
                          )}
                          {isHigh && !isDone && !isInProgress && (
                            <div className="bg-[var(--color-danger-light)] rounded px-1.5 py-0.5">
                              <span className="text-[var(--color-danger)] text-[10px] font-medium">紧急</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* 编辑 + 删除按钮 - 始终显示 */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          type="button"
                          onClick={(e) => handleStartEdit(e, t)}
                          className="w-[18px] h-[18px] flex items-center justify-center"
                        >
                          <Pencil className="w-[18px] h-[18px] text-[#A1A1AA]" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDelete(e, t.id)}
                          className="w-[18px] h-[18px] flex items-center justify-center"
                        >
                          <Trash2 className="w-[18px] h-[18px] text-[#A1A1AA]" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {dayTasks.length === 0 ? (
          <div className="text-center text-[13px] text-[var(--color-text-tertiary)] py-10">
            当天暂无任务
          </div>
        ) : null}
      </div>

      {/* Bottom Sheet for editing */}
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

      {/* 删除任务二次确认 */}
      <ConfirmDialog
        isOpen={deleteTargetId !== null}
        title="删除这个任务？"
        description={deleteTarget ? `「${deleteTarget.title}」删除后无法恢复` : undefined}
        onConfirm={() => {
          if (deleteTargetId) onDeleteTask(deleteTargetId);
          setDeleteTargetId(null);
        }}
        onCancel={() => setDeleteTargetId(null)}
      />
    </div>
  );
}
