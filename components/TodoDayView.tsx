"use client";

import type { ISODate, Task, ViewMode } from "@/components/todo/types";
import { CN_WEEKDAY, addDays, formatCNDateTitle, parseISODate, startOfWeek, toISODate } from "@/components/todo/date";
import { Plus, Check, Flag, Trash2 } from "lucide-react";

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

function timeLabel(t: Task) {
  if (t.startTime && t.endTime) return `${t.startTime} - ${t.endTime}`;
  if (t.startTime) return t.startTime;
  return "";
}

// 分组规则：00:00-11:59 上午，12:00-17:59 下午，18:00+ 晚间
function sectionForTask(t: Task): "上午" | "下午" | "晚间" {
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
  onCycleTaskStatus,
  onOpenAddModal,
  onDeleteTask,
}: Props) {
  function handleDelete(e: React.MouseEvent, taskId: string) {
    e.stopPropagation();
    if (window.confirm("确定要删除这个任务吗？")) {
      onDeleteTask(taskId);
    }
  }
  const selected = parseISODate(selectedDate);
  const weekStart = startOfWeek(selected, true);
  const days = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));

  const dayTasks = tasks
    .filter((t) => t.date === selectedDate)
    .slice()
    .sort((a, b) => (a.startTime ?? "99:99").localeCompare(b.startTime ?? "99:99"));

  const groups = {
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
        <button
          onClick={onOpenAddModal}
          className="flex items-center gap-[6px] bg-[var(--color-primary)] rounded-lg px-[14px] py-2 hover:bg-[#1d4ed8] transition-colors"
        >
          <Plus className="w-4 h-4 text-white" strokeWidth={2} />
          <span className="text-white text-[14px] font-semibold">
            新增任务
          </span>
        </button>
      </div>

      {/* View Switcher Section */}
      <div className="w-full flex flex-col gap-4 px-6">
        {/* Tab Container */}
        <div className="w-full flex gap-1 bg-[var(--color-bg-gray-light)] rounded-[10px] p-1">
          <button
            type="button"
            onClick={() => onChangeViewMode("day")}
            className={[
              "flex-1 flex items-center justify-center rounded-lg px-4 py-[10px]",
              viewMode === "day"
                ? "bg-[var(--color-bg-white)] shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
                : "",
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
              "flex-1 flex items-center justify-center rounded-lg px-4 py-[10px]",
              viewMode === "week"
                ? "bg-[var(--color-bg-white)] shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
                : "",
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

        {/* Date Picker */}
        <div className="w-full flex items-center justify-between">
          {days.map((d) => {
            const iso = toISODate(d);
            const isSelected = iso === selectedDate;
            return (
              <button
                key={iso}
                type="button"
                onClick={() => onSelectDate(iso)}
                className={[
                  "flex flex-col items-center gap-[6px] px-3 py-2 rounded-[12px]",
                  isSelected ? "bg-[var(--color-primary)]" : "",
                ].join(" ")}
              >
                <span
                  className={[
                    "text-[12px] font-medium",
                    isSelected ? "text-[var(--color-bg-white)] font-semibold" : "text-[var(--color-text-tertiary)]",
                  ].join(" ")}
                >
                  {CN_WEEKDAY[d.getDay()]}
                </span>
                <span
                  className={[
                    "text-[16px] font-semibold",
                    isSelected ? "text-[var(--color-bg-white)] font-bold" : "text-[var(--color-text-secondary)]",
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
              <div className="w-full flex flex-col rounded-[12px] border-[1.5px] border-[var(--color-border)] overflow-hidden">
                {sectionTasks.map((t, idx) => {
                  const isDone = t.status === "done";
                  const isInProgress = t.status === "in_progress";
                  const isHigh = t.priority === "high";
                  const time = timeLabel(t);
                  return (
                    <div key={t.id}>
                      <div className="group relative w-full flex items-center gap-3 p-4 hover:bg-[var(--color-bg-gray-lighter)] transition-colors">
                        {/* Status Indicator - 点击切换状态 */}
                        <StatusIndicator status={t.status} onClick={() => onCycleTaskStatus(t.id)} />

                        {/* Task Content: 标题 + 时间 + 标签 在同一行 */}
                        <div className="flex-1 flex items-center gap-3 min-w-0">
                          {/* Title */}
                          <span
                            className={[
                              "text-[14px] font-medium truncate flex-shrink",
                              isDone ? "text-[var(--color-text-secondary)] line-through" : "text-[var(--color-text-primary)]",
                            ].join(" ")}
                          >
                            {t.title}
                          </span>

                          {/* Time - 标题右侧 */}
                          {time && (
                            <span className="text-[var(--color-text-tertiary)] text-[12px] flex-shrink-0 whitespace-nowrap">
                              {time}
                            </span>
                          )}
                        </div>

                        {/* Tags/Status - 最右侧 */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {/* 视觉优先级：done > in_progress > priority/tag */}
                          {isDone ? (
                            <div className="bg-[var(--color-success-light)] rounded px-2 py-0.5">
                              <span className="text-[var(--color-success)] text-[12px] font-medium">已完成</span>
                            </div>
                          ) : isInProgress ? (
                            <div className="bg-[var(--color-primary-light)] rounded px-2 py-0.5">
                              <span className="text-[var(--color-primary)] text-[12px] font-medium">进行中</span>
                            </div>
                          ) : isHigh ? (
                            <div className="flex items-center gap-1 bg-[var(--color-danger-light)] rounded px-2 py-0.5">
                              <Flag className="w-3 h-3 text-[var(--color-danger)]" fill="currentColor" strokeWidth={0} />
                              <span className="text-[var(--color-danger)] text-[12px] font-medium">高优</span>
                            </div>
                          ) : null}
                        </div>

                        {/* Delete button - hover only */}
                        <button
                          type="button"
                          onClick={(e) => handleDelete(e, t.id)}
                          className="w-6 h-6 flex items-center justify-center rounded-md opacity-0 group-hover:opacity-100 hover:bg-[var(--color-danger-light)] transition-all flex-shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-[var(--color-danger)]" />
                        </button>
                      </div>
                      {idx !== sectionTasks.length - 1 ? (
                        <div className="w-full h-px bg-[var(--color-border)]" />
                      ) : null}
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
    </div>
  );
}
