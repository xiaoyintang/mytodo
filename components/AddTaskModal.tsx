"use client";

import { useState, useEffect } from "react";
import type { ISODate, Task, TaskPriority } from "@/components/todo/types";
import { X, Calendar, Plus, CircleCheck, TriangleAlert, ChevronLeft, ChevronRight } from "lucide-react";
import TimePicker from "@/components/TimePicker";
import { CN_WEEKDAY, addDays, parseISODate, startOfWeek, toISODate } from "@/components/todo/date";

type ModalMode = "day" | "week";

type Props = {
  mode: ModalMode;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (task: Omit<Task, "id">) => void;
  /** For day mode: auto-selected date */
  selectedDate?: ISODate;
};

const TAGS = [
  { label: "高优", value: "high" as const, bg: "#FEF2F2", border: "#FECACA", text: "#DC2626" },
  { label: "工作", value: "工作" as const, bg: "#EFF6FF", border: "#BFDBFE", text: "#2563EB" },
  { label: "学习", value: "学习" as const, bg: "#F0FDF4", border: "#BBF7D0", text: "#16A34A" },
];

export default function AddTaskModal({ mode, isOpen, onClose, onSubmit, selectedDate }: Props) {
  const today = toISODate(new Date());

  // Form state
  const [date, setDate] = useState<ISODate | null>(mode === "day" ? (selectedDate ?? today) : null);
  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [priority, setPriority] = useState<TaskPriority | null>(null);
  const [tag, setTag] = useState<string | null>(null);

  // Week picker state (for week mode)
  const [pickerWeekStart, setPickerWeekStart] = useState(() => startOfWeek(new Date(), true));

  // Reset form when modal opens/closes or mode changes
  useEffect(() => {
    if (isOpen) {
      setDate(mode === "day" ? (selectedDate ?? today) : null);
      setTitle("");
      setStartTime("");
      setEndTime("");
      setPriority(null);
      setTag(null);
      setPickerWeekStart(startOfWeek(new Date(), true));
    }
  }, [isOpen, mode, selectedDate, today]);

  // Update date when selectedDate changes (for day mode)
  useEffect(() => {
    if (mode === "day" && selectedDate) {
      setDate(selectedDate);
    }
  }, [mode, selectedDate]);

  if (!isOpen) return null;

  const canSubmit = title.trim() !== "" && date !== null;

  function handleSubmit() {
    if (!canSubmit || !date) return;

    onSubmit({
      title: title.trim(),
      date,
      status: "todo",
      startTime: startTime || undefined,
      endTime: endTime || undefined,
      priority: priority ?? undefined,
      tag: tag as Task["tag"] ?? undefined,
    });

    onClose();
  }

  function handleTagClick(tagValue: string, isPriority: boolean) {
    if (isPriority) {
      setPriority(priority === "high" ? null : "high");
    } else {
      setTag(tag === tagValue ? null : tagValue);
    }
  }

  // Generate week days for the picker
  const pickerDays = Array.from({ length: 7 }).map((_, i) => addDays(pickerWeekStart, i));
  const weekEndDate = addDays(pickerWeekStart, 6);
  const weekLabel = `${pickerWeekStart.getFullYear()}年 第${getWeekNumber(pickerWeekStart)}周`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-[440px] max-h-[90vh] bg-white rounded-2xl shadow-[0_8px_32px_-4px_rgba(0,0,0,0.15),0_4px_12px_rgba(0,0,0,0.1)] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5">
          <div className="flex flex-col gap-1">
            <h2 className="text-[20px] font-semibold text-[var(--color-text-primary)]">新增任务</h2>
            <p className="text-[14px] text-[var(--color-text-secondary)]">
              {mode === "day" ? "创建一个新的待办事项" : "选择日期并创建待办事项"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[var(--color-bg-gray-light)] transition-colors"
          >
            <X className="w-[18px] h-[18px] text-[var(--color-text-secondary)]" />
          </button>
        </div>

        {/* Divider */}
        <div className="h-px bg-[var(--color-border)]" />

        {/* Form Content - Scrollable */}
        <div className="flex flex-col gap-5 p-6 overflow-y-auto flex-1">
          {/* Date Section */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Calendar className={`w-4 h-4 ${mode === "day" ? "text-[var(--color-primary)]" : "text-[var(--color-danger)]"}`} />
              <span className="text-[14px] font-semibold text-[var(--color-text-primary)]">
                {mode === "day" ? "任务日期" : "选择任务日期"}
              </span>
              <span className="text-[14px] font-semibold text-[var(--color-danger)]">*</span>
            </div>

            {mode === "day" ? (
              <>
                {/* Day Mode: Show selected date */}
                <div className="flex items-center justify-between px-3.5 py-3 rounded-[10px] bg-[var(--color-primary-light)] border-2 border-[var(--color-primary)]">
                  <span className="text-[15px] font-semibold text-[var(--color-primary)]">
                    {date ? formatDateDisplay(parseISODate(date)) : ""}
                  </span>
                  <CircleCheck className="w-[18px] h-[18px] text-[var(--color-primary)]" />
                </div>
                <p className="text-[12px] text-[var(--color-text-secondary)]">
                  已自动选择当前日视图的日期
                </p>
              </>
            ) : (
              <>
                {/* Week Mode: Show warning and date picker */}
                {!date && (
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-[#FEF3C7]">
                    <TriangleAlert className="w-4 h-4 text-[#D97706]" />
                    <span className="text-[13px] font-medium text-[#92400E]">请先选择一个具体日期</span>
                  </div>
                )}

                {/* Week Picker */}
                <div className="border border-[var(--color-border)] rounded-[10px] overflow-hidden">
                  {/* Week Header */}
                  <div className="flex items-center justify-between px-4 py-3 bg-[var(--color-bg-gray-lighter)]">
                    <span className="text-[14px] font-medium text-[var(--color-text-primary)]">{weekLabel}</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setPickerWeekStart(addDays(pickerWeekStart, -7))}
                        className="w-7 h-7 flex items-center justify-center rounded hover:bg-white transition-colors"
                      >
                        <ChevronLeft className="w-4 h-4 text-[var(--color-text-secondary)]" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPickerWeekStart(addDays(pickerWeekStart, 7))}
                        className="w-7 h-7 flex items-center justify-center rounded hover:bg-white transition-colors"
                      >
                        <ChevronRight className="w-4 h-4 text-[var(--color-text-secondary)]" />
                      </button>
                    </div>
                  </div>

                  {/* Date Grid */}
                  <div className="flex justify-between px-2 py-3">
                    {pickerDays.map((d) => {
                      const iso = toISODate(d);
                      const isSelected = date === iso;
                      const isToday = iso === today;
                      return (
                        <button
                          key={iso}
                          type="button"
                          onClick={() => setDate(iso)}
                          className={[
                            "flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-colors",
                            isSelected
                              ? "bg-[var(--color-primary)] text-white"
                              : isToday
                                ? "bg-[var(--color-primary-light)]"
                                : "hover:bg-[var(--color-bg-gray-light)]",
                          ].join(" ")}
                        >
                          <span className={[
                            "text-[12px] font-medium",
                            isSelected ? "text-white" : "text-[var(--color-text-tertiary)]"
                          ].join(" ")}>
                            {CN_WEEKDAY[d.getDay()]}
                          </span>
                          <span className={[
                            "text-[16px] font-semibold",
                            isSelected ? "text-white" : "text-[var(--color-text-primary)]"
                          ].join(" ")}>
                            {d.getDate()}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <p className="text-[12px] text-[var(--color-text-secondary)]">
                  点击选择任务所属的日期
                </p>
              </>
            )}
          </div>

          {/* Title Section */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1">
              <span className="text-[14px] font-medium text-[var(--color-text-primary)]">任务标题</span>
              <span className="text-[14px] font-medium text-[var(--color-danger)]">*</span>
            </div>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="输入任务名称..."
              className="w-full px-3 py-2.5 rounded-md border border-[var(--color-border)] text-[14px] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]"
            />
          </div>

          {/* Time Section */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-medium text-[var(--color-text-primary)]">时间范围</span>
              <span className="text-[12px] text-[var(--color-text-tertiary)]">(可选)</span>
            </div>
            <div className="flex items-center gap-3">
              <TimePicker
                value={startTime}
                onChange={setStartTime}
                placeholder="开始时间"
                label="选择开始时间"
              />
              <span className="text-[14px] text-[var(--color-text-tertiary)]">—</span>
              <TimePicker
                value={endTime}
                onChange={setEndTime}
                placeholder="结束时间"
                label="选择结束时间"
              />
            </div>
          </div>

          {/* Priority / Tags Section */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-medium text-[var(--color-text-primary)]">优先级 / 标签</span>
              <span className="text-[12px] text-[var(--color-text-tertiary)]">(可选)</span>
            </div>
            <div className="flex flex-wrap gap-2.5">
              {TAGS.map((t) => {
                const isHighPriority = t.value === "high";
                const isSelected = isHighPriority ? priority === "high" : tag === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => handleTagClick(t.value, isHighPriority)}
                    className={[
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium border transition-all",
                      isSelected ? "ring-2 ring-offset-1" : "",
                    ].join(" ")}
                    style={{
                      backgroundColor: t.bg,
                      borderColor: t.border,
                      color: t.text,
                      ...(isSelected ? { ringColor: t.text } : {}),
                    }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: t.text }} />
                    {t.label}
                  </button>
                );
              })}
              <button
                type="button"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-gray-light)] transition-colors"
              >
                <Plus className="w-3 h-3" />
                添加标签
              </button>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-[var(--color-border)]" />

        {/* Footer - Sticky at bottom */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-white sticky bottom-0 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-lg border border-[var(--color-border)] text-[14px] font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-bg-gray-light)] transition-colors"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={[
              "flex items-center gap-1.5 px-6 py-2.5 rounded-lg text-[14px] font-semibold text-white transition-colors",
              canSubmit
                ? "bg-[var(--color-primary)] hover:bg-[#1d4ed8]"
                : "bg-[var(--color-text-tertiary)] cursor-not-allowed",
            ].join(" ")}
          >
            <Plus className="w-4 h-4" />
            创建任务
          </button>
        </div>
      </div>
    </div>
  );
}

// Helper: format date for display
function formatDateDisplay(d: Date): string {
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const weekday = CN_WEEKDAY[d.getDay()];
  return `${year}年${month}月${day}日 · ${weekday}`;
}

// Helper: get ISO week number
function getWeekNumber(d: Date): number {
  const date = new Date(d.getTime());
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const week1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}
