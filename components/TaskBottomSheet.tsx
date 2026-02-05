"use client";

import { useState, useEffect, useRef } from "react";
import type { Task, TaskStatus, ISODate } from "@/components/todo/types";
import { parseISODate, toISODate, startOfWeek, addDays, CN_WEEKDAY } from "@/components/todo/date";
import { X, Check, Calendar, Clock, Flag, Trash2, ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import TimePicker from "@/components/TimePicker";

type Props = {
  task: Task | null;
  isOpen: boolean;
  onClose: () => void;
  onCycleStatus: (taskId: string) => void;
  onDelete: (taskId: string) => void;
  onUpdate: (taskId: string, updates: Partial<Omit<Task, "id">>) => void;
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "待办",
  in_progress: "进行中",
  done: "已完成",
};

const STATUS_COLORS: Record<TaskStatus, { bg: string; text: string }> = {
  todo: { bg: "bg-[#F4F4F5]", text: "text-[#71717A]" },
  in_progress: { bg: "bg-[#EFF6FF]", text: "text-[#2563EB]" },
  done: { bg: "bg-[#DCFCE7]", text: "text-[#16A34A]" },
};

// 三态按钮配置：当前状态 → 按钮文案 + 点击后下一状态
const STATUS_BUTTON_CONFIG: Record<TaskStatus, { label: string; nextStatus: TaskStatus; buttonStyle: string }> = {
  todo: {
    label: "标记为进行中",
    nextStatus: "in_progress",
    buttonStyle: "bg-[var(--color-primary)] text-white hover:bg-[#1d4ed8]",
  },
  in_progress: {
    label: "标记为已完成",
    nextStatus: "done",
    buttonStyle: "bg-[#16A34A] text-white hover:bg-[#15803D]",
  },
  done: {
    label: "取消完成",
    nextStatus: "todo",
    buttonStyle: "bg-[var(--color-bg-gray-light)] text-[var(--color-text-secondary)] hover:bg-[#E4E4E7]",
  },
};

export default function TaskBottomSheet({
  task,
  isOpen,
  onClose,
  onCycleStatus,
  onDelete,
  onUpdate,
}: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [isEditingDate, setIsEditingDate] = useState(false);
  const [isEditingTime, setIsEditingTime] = useState(false);
  const [editStartTime, setEditStartTime] = useState("");
  const [editEndTime, setEditEndTime] = useState("");
  const [pickerWeekStart, setPickerWeekStart] = useState(() => startOfWeek(new Date(), true));
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state when task changes
  useEffect(() => {
    if (task) {
      setEditTitle(task.title);
      setPickerWeekStart(startOfWeek(parseISODate(task.date), true));
      setEditStartTime(task.startTime || "");
      setEditEndTime(task.endTime || "");
    }
    setIsEditing(false);
    setIsEditingDate(false);
    setIsEditingTime(false);
  }, [task]);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  if (!isOpen || !task) return null;

  const taskDate = parseISODate(task.date);
  const weekdayNames = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const dateStr = `${taskDate.getFullYear()}年${taskDate.getMonth() + 1}月${taskDate.getDate()}日 ${weekdayNames[taskDate.getDay()]}`;

  const timeStr =
    task.startTime && task.endTime
      ? `${task.startTime} - ${task.endTime}`
      : task.startTime
        ? task.startTime
        : null;

  const statusColor = STATUS_COLORS[task.status];
  const statusButtonConfig = STATUS_BUTTON_CONFIG[task.status];
  const isHigh = task.priority === "high";

  function handleSaveTitle() {
    if (!task) return;
    if (editTitle.trim() && editTitle.trim() !== task.title) {
      onUpdate(task.id, { title: editTitle.trim() });
    }
    setIsEditing(false);
  }

  function handleDelete() {
    if (!task) return;
    if (window.confirm("确定要删除这个任务吗？")) {
      onDelete(task.id);
      onClose();
    }
  }

  function handleStatusClick() {
    if (!task) return;
    onCycleStatus(task.id);
  }

  function handleDateSelect(newDate: ISODate) {
    if (!task) return;
    onUpdate(task.id, { date: newDate });
    setIsEditingDate(false);
  }

  function handleSaveTime() {
    if (!task) return;
    onUpdate(task.id, {
      startTime: editStartTime || undefined,
      endTime: editEndTime || undefined,
    });
    setIsEditingTime(false);
  }

  // Generate week days for the picker
  const pickerDays = Array.from({ length: 7 }).map((_, i) => addDays(pickerWeekStart, i));
  const today = toISODate(new Date());

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-[100] transition-opacity"
        onClick={onClose}
      />

      {/* Bottom Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-[101] bg-white rounded-t-[20px] shadow-[0_-4px_24px_rgba(0,0,0,0.12)] animate-slide-up max-h-[85vh] flex flex-col">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2 flex-shrink-0">
          <div className="w-10 h-1 bg-[#E4E4E7] rounded-full" />
        </div>

        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full hover:bg-[var(--color-bg-gray-light)] transition-colors z-10"
        >
          <X className="w-5 h-5 text-[var(--color-text-tertiary)]" />
        </button>

        {/* Scrollable Content */}
        <div className="px-6 overflow-y-auto flex-1">
          {/* Title - 可点击编辑 */}
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={handleSaveTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveTitle();
                if (e.key === "Escape") {
                  setEditTitle(task.title);
                  setIsEditing(false);
                }
              }}
              className="w-full text-[18px] font-semibold text-[var(--color-text-primary)] bg-white border-b-2 border-[var(--color-primary)] outline-none pb-1 mb-3"
            />
          ) : (
            <h2
              className="text-[18px] font-semibold text-[var(--color-text-primary)] mb-3 pr-8 cursor-text"
              onClick={() => setIsEditing(true)}
            >
              {task.title}
            </h2>
          )}

          {/* Status display + hint */}
          <div className="flex items-center gap-2 mb-4">
            <span className={["text-[13px] font-medium px-2.5 py-1 rounded-full", statusColor.bg, statusColor.text].join(" ")}>
              {STATUS_LABELS[task.status]}
            </span>
            <span className="text-[12px] text-[var(--color-text-quaternary)]">
              点击标题可修改
            </span>
          </div>

          {/* Tags */}
          <div className="flex items-center gap-2 flex-wrap mb-4">
            {isHigh && (
              <span className="text-[12px] font-medium px-2.5 py-1 rounded-full bg-[#FEF2F2] text-[#DC2626] flex items-center gap-1">
                <Flag className="w-3 h-3" fill="currentColor" strokeWidth={0} />
                紧急
              </span>
            )}
            {task.tag && (
              <span className="text-[12px] font-medium px-2.5 py-1 rounded-full bg-[#EFF6FF] text-[#2563EB]">
                {task.tag}
              </span>
            )}
          </div>

          {/* Date - 可点击编辑 */}
          <div className="mb-2">
            <button
              type="button"
              onClick={() => setIsEditingDate(!isEditingDate)}
              className="flex items-center gap-2 text-[13px] text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] transition-colors"
            >
              <Calendar className="w-4 h-4 text-[var(--color-text-tertiary)]" />
              <span>{dateStr}</span>
              <span className="text-[11px] text-[var(--color-text-quaternary)]">点击修改</span>
            </button>

            {/* Date Picker */}
            {isEditingDate && (
              <div className="mt-2 border border-[var(--color-border)] rounded-[10px] overflow-hidden">
                {/* Week Header */}
                <div className="flex items-center justify-between px-3 py-2 bg-[var(--color-bg-gray-lighter)]">
                  <button
                    type="button"
                    onClick={() => setPickerWeekStart(addDays(pickerWeekStart, -7))}
                    className="w-7 h-7 flex items-center justify-center rounded hover:bg-white transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4 text-[var(--color-text-secondary)]" />
                  </button>
                  <span className="text-[13px] font-medium text-[var(--color-text-primary)]">
                    {pickerWeekStart.getFullYear()}年{pickerWeekStart.getMonth() + 1}月
                  </span>
                  <button
                    type="button"
                    onClick={() => setPickerWeekStart(addDays(pickerWeekStart, 7))}
                    className="w-7 h-7 flex items-center justify-center rounded hover:bg-white transition-colors"
                  >
                    <ChevronRight className="w-4 h-4 text-[var(--color-text-secondary)]" />
                  </button>
                </div>

                {/* Date Grid */}
                <div className="flex justify-between px-2 py-2">
                  {pickerDays.map((d) => {
                    const iso = toISODate(d);
                    const isSelected = task.date === iso;
                    const isToday = iso === today;
                    return (
                      <button
                        key={iso}
                        type="button"
                        onClick={() => handleDateSelect(iso)}
                        className={[
                          "flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg transition-colors",
                          isSelected
                            ? "bg-[var(--color-primary)] text-white"
                            : isToday
                              ? "bg-[var(--color-primary-light)]"
                              : "hover:bg-[var(--color-bg-gray-light)]",
                        ].join(" ")}
                      >
                        <span className={[
                          "text-[11px] font-medium",
                          isSelected ? "text-white" : "text-[var(--color-text-tertiary)]"
                        ].join(" ")}>
                          {CN_WEEKDAY[d.getDay()]}
                        </span>
                        <span className={[
                          "text-[14px] font-semibold",
                          isSelected ? "text-white" : "text-[var(--color-text-primary)]"
                        ].join(" ")}>
                          {d.getDate()}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Time - 可点击编辑 */}
          <div className="mb-4">
            <button
              type="button"
              onClick={() => setIsEditingTime(!isEditingTime)}
              className="flex items-center gap-2 text-[13px] text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] transition-colors"
            >
              <Clock className="w-4 h-4 text-[var(--color-text-tertiary)]" />
              <span>{timeStr || "未设置时间"}</span>
              <span className="text-[11px] text-[var(--color-text-quaternary)]">点击修改</span>
            </button>

            {/* Time Picker */}
            {isEditingTime && (
              <div className="mt-3 p-3 border border-[var(--color-border)] rounded-[10px] bg-[var(--color-bg-gray-lighter)]">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex-1">
                    <label className="text-[12px] text-[var(--color-text-tertiary)] mb-1 block">开始时间</label>
                    <TimePicker
                      value={editStartTime}
                      onChange={setEditStartTime}
                      placeholder="开始"
                      label="选择开始时间"
                    />
                  </div>
                  <span className="text-[var(--color-text-tertiary)] mt-5">—</span>
                  <div className="flex-1">
                    <label className="text-[12px] text-[var(--color-text-tertiary)] mb-1 block">结束时间</label>
                    <TimePicker
                      value={editEndTime}
                      onChange={setEditEndTime}
                      placeholder="结束"
                      label="选择结束时间"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditStartTime(task.startTime || "");
                      setEditEndTime(task.endTime || "");
                      setIsEditingTime(false);
                    }}
                    className="px-3 py-1.5 text-[12px] text-[var(--color-text-secondary)] hover:bg-white rounded transition-colors"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveTime}
                    className="px-3 py-1.5 text-[12px] bg-[var(--color-primary)] text-white rounded hover:bg-[#1d4ed8] transition-colors"
                  >
                    确认
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer - Sticky at bottom */}
        <div className="px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2 bg-white border-t border-[var(--color-border)] flex-shrink-0">
          <div className="flex items-center gap-3">
            {/* Status toggle button - 三态循环 */}
            <button
              type="button"
              onClick={handleStatusClick}
              className={[
                "flex-1 flex items-center justify-center gap-2 rounded-xl py-3 font-medium text-[14px] transition-colors",
                statusButtonConfig.buttonStyle,
              ].join(" ")}
            >
              <Check className="w-4 h-4" strokeWidth={2.5} />
              {statusButtonConfig.label}
            </button>

            {/* Delete button */}
            <button
              type="button"
              onClick={handleDelete}
              className="flex items-center justify-center gap-2 rounded-xl px-5 py-3 bg-[#FEF2F2] text-[#DC2626] font-medium text-[14px] hover:bg-[#FEE2E2] transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              删除
            </button>
          </div>
        </div>
      </div>

      {/* Animation styles */}
      <style jsx>{`
        @keyframes slide-up {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </>
  );
}
