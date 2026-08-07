"use client";

import { useState, useEffect, useRef } from "react";
import type { Aspiration, Task, TaskStatus, ISODate, SubTask, TimeEntry } from "@/components/todo/types";
import { parseISODate, toISODate, startOfWeek, addDays, CN_WEEKDAY } from "@/components/todo/date";
import { goalColor } from "@/components/todo/goal";
import { formatMinutes, taskLoggedMinutes } from "@/components/todo/time";
import { X, Check, Calendar, Clock, Flag, Trash2, ChevronLeft, ChevronRight, Target, Timer, Plus, Gauge, ListChecks, Wand2 } from "lucide-react";
import { callBehaviorAPI } from "@/components/todo/behaviorApi";
import TimePicker from "@/components/TimePicker";
import ConfirmDialog from "@/components/ConfirmDialog";

// 可拖动的完成进度滑块（0-100，指哪填哪）
function ProgressSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [local, setLocal] = useState(value);

  useEffect(() => {
    if (!dragging.current) setLocal(value);
  }, [value]);

  function pctFrom(clientX: number): number {
    const el = trackRef.current;
    if (!el) return local;
    const r = el.getBoundingClientRect();
    if (r.width === 0) return local;
    return Math.max(0, Math.min(100, Math.round(((clientX - r.left) / r.width) * 100)));
  }

  function handleDown(e: React.PointerEvent) {
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = pctFrom(e.clientX);
    setLocal(p);
    onChange(p);
  }
  function handleMove(e: React.PointerEvent) {
    if (!dragging.current) return;
    const p = pctFrom(e.clientX);
    setLocal(p);
    onChange(p);
  }
  function handleUp(e: React.PointerEvent) {
    dragging.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      className="py-2 cursor-pointer touch-none select-none"
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerCancel={handleUp}
    >
      <div ref={trackRef} className="relative mx-2.5">
        <div className="w-full h-[10px] rounded-full bg-[var(--color-bg-gray-light)] overflow-hidden">
          <div
            className={[
              "h-full rounded-full",
              local >= 100 ? "bg-[var(--color-success)]" : "bg-[var(--color-primary)]",
            ].join(" ")}
            style={{ width: `${local}%` }}
          />
        </div>
        <div
          className={[
            "absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-white shadow-md pointer-events-none border-2",
            local >= 100 ? "border-[var(--color-success)]" : "border-[var(--color-primary)]",
          ].join(" ")}
          style={{ left: `${local}%` }}
        />
      </div>
    </div>
  );
}

type Props = {
  task: Task | null;
  entries: TimeEntry[];
  isOpen: boolean;
  onClose: () => void;
  onCycleStatus: (taskId: string) => void;
  onDelete: (taskId: string) => void;
  onUpdate: (taskId: string, updates: Partial<Omit<Task, "id">>) => void;
  onAddEntry: (entry: Omit<TimeEntry, "id">) => void;
  aspirations: Aspiration[];
  onAddSubtasks: (taskId: string, titles: string[]) => void;
  onToggleSubtask: (taskId: string, subId: string) => void;
  onDeleteSubtask: (taskId: string, subId: string) => void;
  onEditSubtask: (taskId: string, subId: string, title: string) => void;
};

const QUICK_MINUTES = [15, 30, 45, 60, 90, 120];
// 时长目标快捷选项（分钟）——与 AddTaskModal 保持一致
const TARGET_PRESETS = [30, 60, 90, 120, 180, 240];

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
  entries,
  isOpen,
  onClose,
  onCycleStatus,
  onDelete,
  onUpdate,
  onAddEntry,
  aspirations,
  onAddSubtasks,
  onToggleSubtask,
  onDeleteSubtask,
  onEditSubtask,
}: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [isEditingDate, setIsEditingDate] = useState(false);
  const [isEditingTime, setIsEditingTime] = useState(false);
  const [editStartTime, setEditStartTime] = useState("");
  const [editEndTime, setEditEndTime] = useState("");
  const [pickerWeekStart, setPickerWeekStart] = useState(() => startOfWeek(new Date(), true));
  const [isLogging, setIsLogging] = useState(false);
  const [customMinutes, setCustomMinutes] = useState("");
  const [isEditingTarget, setIsEditingTarget] = useState(false);
  const [targetInput, setTargetInput] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [subDraft, setSubDraft] = useState("");
  const [breaking, setBreaking] = useState(false);
  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  const [editSubText, setEditSubText] = useState("");
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
    setIsLogging(false);
    setCustomMinutes("");
    setIsEditingTarget(false);
    setTargetInput("");
    setShowDeleteConfirm(false);
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
    setShowDeleteConfirm(true);
  }

  function handleConfirmDelete() {
    if (!task) return;
    setShowDeleteConfirm(false);
    onDelete(task.id);
    onClose();
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

  // 拖动进度：同步手动进度 + 联动三态状态
  function handleProgressChange(pct: number) {
    if (!task) return;
    const status: TaskStatus = pct >= 100 ? "done" : pct <= 0 ? "todo" : "in_progress";
    onUpdate(task.id, { progress: pct, status });
  }

  function handleLogMinutes(minutes: number) {
    if (!task || minutes <= 0) return;
    onAddEntry({
      date: task.date,
      title: task.title,
      minutes,
      taskId: task.id,
    });
    setIsLogging(false);
    setCustomMinutes("");
  }

  function handleSaveTarget(minutes: number) {
    if (!task || !Number.isFinite(minutes) || minutes <= 0) return;
    onUpdate(task.id, { targetMinutes: minutes });
    setIsEditingTarget(false);
    setTargetInput("");
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
        <div className="px-6 overflow-y-auto overflow-x-hidden flex-1">
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

          {/* 所属目标：决定它算不算"今天主线"里的任务 */}
          {aspirations.length > 0 && (
            <div className="mb-4">
              <span className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--color-text-primary)] mb-1.5">
                <Target className="w-4 h-4 text-[var(--color-primary)]" />
                属于哪个目标
              </span>
              {/* 目标名可能很长（"把小红书店铺做起来"），必须能换行、能截断，
                  否则整个弹窗被顶到横向溢出，别处的文字就被切掉 */}
              <div className="w-full flex items-center gap-1.5 flex-wrap">
                {aspirations.map((a, i) => {
                  const on = task.aspirationId === a.id;
                  const c = goalColor(a, i);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => onUpdate(task.id, { aspirationId: on ? undefined : a.id })}
                      className="px-2.5 py-1 rounded-md border text-[12px] font-medium transition-colors max-w-full truncate"
                      style={{
                        backgroundColor: on ? c : "#fff",
                        borderColor: c,
                        color: on ? "#fff" : c,
                      }}
                    >
                      {a.title}
                    </button>
                  );
                })}
              </div>
              {!task.aspirationId && (
                <p className="w-full text-[11px] text-[var(--color-text-tertiary)] leading-snug mt-1">
                  不选也行——不归属任何目标的任务永远不会被折起来
                </p>
              )}
            </div>
          )}

          {/* 成果可以作为父任务，但执行现场要明确当前下一步。 */}
          {(() => {
            const taskId = task.id;
            const subs = task.subtasks ?? [];
            const doneN = subs.filter((x) => x.done).length;
            const openSubs = subs.filter((x) => !x.done);
            const nextSubtask = openSubs[0];
            const futureSubtasks = openSubs.slice(1);
            const completedSubtasks = subs.filter((x) => x.done);

            function renderSubtaskRow(st: SubTask, isNext = false) {
              return (
                <div
                  key={st.id}
                  className={[
                    "w-full flex items-start gap-2 px-2.5 py-2 rounded-lg border",
                    isNext
                      ? "bg-[var(--color-primary-light)] border-[#BFDBFE]"
                      : "bg-white border-transparent",
                  ].join(" ")}
                >
                  <button
                    type="button"
                    onClick={() => onToggleSubtask(taskId, st.id)}
                    className={[
                      "w-[16px] h-[16px] rounded-[4px] border flex items-center justify-center flex-shrink-0 mt-[1px] transition-colors",
                      st.done
                        ? "bg-[var(--color-success)] border-[var(--color-success)]"
                        : isNext
                          ? "border-[var(--color-primary)] bg-white"
                          : "border-[var(--color-border)] hover:border-[var(--color-primary)]",
                    ].join(" ")}
                    aria-label={st.done ? "取消完成" : isNext ? "完成当前下一步" : "标记完成"}
                  >
                    {st.done && <Check className="w-3 h-3 text-white" strokeWidth={3.5} />}
                  </button>
                  {editingSubId === st.id ? (
                    <input
                      type="text"
                      value={editSubText}
                      autoFocus
                      onChange={(e) => setEditSubText(e.target.value)}
                      onBlur={() => {
                        const v = editSubText.trim();
                        if (v && v !== st.title) onEditSubtask(taskId, st.id, v);
                        setEditingSubId(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.nativeEvent.isComposing) e.currentTarget.blur();
                        if (e.key === "Escape") setEditingSubId(null);
                      }}
                      className="flex-1 min-w-0 px-1.5 py-0.5 rounded border border-[var(--color-primary)] text-[13px] focus:outline-none"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingSubId(st.id);
                        setEditSubText(st.title);
                      }}
                      className={[
                        "flex-1 text-left text-[13px] leading-snug break-words",
                        st.done
                          ? "text-[var(--color-text-tertiary)] line-through"
                          : isNext
                            ? "text-[var(--color-text-primary)] font-medium"
                            : "text-[var(--color-text-primary)]",
                      ].join(" ")}
                    >
                      {st.title}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onDeleteSubtask(taskId, st.id)}
                    className="w-[16px] h-[16px] flex items-center justify-center flex-shrink-0 mt-[1px]"
                    aria-label="删除子步骤"
                  >
                    <Trash2 className="w-[14px] h-[14px] text-[#A1A1AA]" />
                  </button>
                </div>
              );
            }

            return (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--color-text-primary)]">
                    <ListChecks className="w-4 h-4 text-[var(--color-primary)]" />
                    行动步骤
                    {subs.length > 0 && (
                      <span className="text-[12px] font-normal text-[var(--color-text-tertiary)] tabular-nums">
                        {doneN}/{subs.length}
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    disabled={breaking}
                    onClick={async () => {
                      setBreaking(true);
                      const goal = aspirations.find((a) => a.id === task.aspirationId)?.title;
                      const res = await callBehaviorAPI({
                        mode: "breakdown",
                        text: task.title,
                        goal,
                      });
                      setBreaking(false);
                      if (!res.ok) return;
                      const raw = Array.isArray(res.data.subtasks) ? res.data.subtasks : [];
                      const titles = raw.map((x) => String(x ?? "").trim()).filter(Boolean);
                      // 只拆出它自己一条 = 这任务已经够小，不用加
                      if (titles.length > 1) onAddSubtasks(task.id, titles);
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-[var(--color-primary-light)] text-[var(--color-primary)] text-[11px] font-medium hover:bg-[#DBEAFE] transition-colors disabled:opacity-60"
                  >
                    <Wand2 className="w-3 h-3" />
                    {breaking ? "拆解中…" : "AI 拆成步骤"}
                  </button>
                </div>

                {subs.length === 0 && (
                  <p className="text-[11px] leading-relaxed text-[var(--color-text-tertiary)] mb-1.5">
                    标题本身能直接做，就不用拆；如果它表达的是一个成果，先写下现在能做的第一步。
                    不用一次拆完，加一步、做一步也可以。
                  </p>
                )}

                {nextSubtask && (
                  <div className="flex flex-col gap-1 mb-2">
                    <span className="text-[10px] font-semibold text-[var(--color-primary)]">当前下一步</span>
                    {renderSubtaskRow(nextSubtask, true)}
                  </div>
                )}

                {futureSubtasks.length > 0 && (
                  <div className="flex flex-col gap-0.5 mb-2">
                    <span className="text-[10px] font-medium text-[var(--color-text-tertiary)] px-0.5">
                      后续步骤
                    </span>
                    {futureSubtasks.map((st) => renderSubtaskRow(st))}
                  </div>
                )}

                {completedSubtasks.length > 0 && (
                  <div className="flex flex-col gap-0.5 mb-2">
                    <span className="text-[10px] font-medium text-[var(--color-text-tertiary)] px-0.5">
                      已完成
                    </span>
                    {completedSubtasks.map((st) => renderSubtaskRow(st))}
                  </div>
                )}

                <input
                  type="text"
                  value={subDraft}
                  onChange={(e) => setSubDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                      const v = subDraft.trim();
                      if (!v) return;
                      onAddSubtasks(task.id, [v]);
                      setSubDraft("");
                    }
                  }}
                  enterKeyHint="done"
                  placeholder="添加一个行动步骤，回车"
                  className="w-full mt-1 px-2.5 py-1.5 rounded-lg border border-[var(--color-border)] text-[13px] bg-white focus:outline-none focus:border-[var(--color-primary)]"
                />
              </div>
            );
          })()}

          {/* 完成进度（非时长目标任务，可拖动）。
              有子任务时不显示——进度由打勾算出来，别让你维护两套账 */}
          {!task.targetMinutes && (task.subtasks ?? []).length === 0 && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1">
                <span className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--color-text-primary)]">
                  <Gauge className="w-4 h-4 text-[var(--color-primary)]" />
                  完成进度
                </span>
                <span
                  className={[
                    "text-[15px] font-bold tabular-nums",
                    (task.progress ?? 0) >= 100 ? "text-[var(--color-success)]" : "text-[var(--color-primary)]",
                  ].join(" ")}
                >
                  {task.progress ?? 0}%
                </span>
              </div>
              <ProgressSlider value={task.progress ?? 0} onChange={handleProgressChange} />
              <div className="flex gap-1.5 mt-1">
                {[0, 25, 50, 75, 100].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => handleProgressChange(p)}
                    className={[
                      "flex-1 py-1.5 rounded-lg text-[12px] font-medium border transition-colors",
                      (task.progress ?? 0) === p
                        ? "bg-[var(--color-primary)] text-white border-[var(--color-primary)]"
                        : "bg-white text-[var(--color-text-secondary)] border-[var(--color-border)] hover:border-[var(--color-primary)]",
                    ].join(" ")}
                  >
                    {p}%
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 时长目标进度 + 记一笔（柳比歇夫模式） */}
          {(() => {
            const target = task.targetMinutes ?? 0;
            const logged = taskLoggedMinutes(task, entries);
            if (target <= 0 && logged <= 0) return null;
            const reached = target > 0 && logged >= target;
            return (
              <div className="mb-4 p-3 rounded-[10px] bg-[var(--color-bg-gray-lighter)] border border-[var(--color-border)]">
                <div className="flex items-center justify-between mb-2">
                  <span className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--color-text-primary)]">
                    <Timer className="w-4 h-4 text-[var(--color-primary)]" />
                    已投入时长
                  </span>
                  <span className={[
                    "text-[13px] font-semibold",
                    reached ? "text-[var(--color-success)]" : "text-[var(--color-text-secondary)]",
                  ].join(" ")}>
                    {formatMinutes(logged)}
                    {target > 0 && ` / ${formatMinutes(target)}`}
                    {reached && " · 已达成 🎉"}
                  </span>
                </div>
                {target > 0 && (
                  <div className="w-full h-[8px] rounded-full bg-[var(--color-bg-gray-light)] overflow-hidden mb-3">
                    <div
                      className={[
                        "h-full rounded-full transition-all",
                        reached ? "bg-[var(--color-success)]" : "bg-[var(--color-primary)]",
                      ].join(" ")}
                      style={{ width: `${Math.min(100, Math.round((logged / target) * 100))}%` }}
                    />
                  </div>
                )}

                {/* 目标时长（可修改，不必删掉重建） */}
                {isEditingTarget ? (
                  <div className="flex flex-col gap-2 mb-3">
                    <div className="flex flex-wrap gap-1.5">
                      {TARGET_PRESETS.map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => handleSaveTarget(m)}
                          className={[
                            "px-2.5 py-1.5 rounded-lg text-[12px] font-medium border transition-colors",
                            target === m
                              ? "bg-[var(--color-primary)] text-white border-[var(--color-primary)]"
                              : "bg-white text-[var(--color-text-primary)] border-[var(--color-border)] hover:border-[var(--color-primary)]",
                          ].join(" ")}
                        >
                          {formatMinutes(m)}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        value={targetInput}
                        onChange={(e) => setTargetInput(e.target.value)}
                        placeholder="自定义分钟数"
                        className="flex-1 px-3 py-2 rounded-lg border border-[var(--color-border)] text-[13px] bg-white placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:border-[var(--color-primary)]"
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveTarget(Math.round(Number(targetInput)))}
                        disabled={!targetInput || Number(targetInput) <= 0}
                        className={[
                          "px-3 py-2 rounded-lg text-[12px] font-medium transition-colors",
                          targetInput && Number(targetInput) > 0
                            ? "bg-[var(--color-primary)] text-white hover:bg-[#1d4ed8]"
                            : "bg-[var(--color-bg-gray-light)] text-[var(--color-text-tertiary)] cursor-not-allowed",
                        ].join(" ")}
                      >
                        确认
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsEditingTarget(false);
                          setTargetInput("");
                        }}
                        className="px-3 py-2 rounded-lg text-[12px] text-[var(--color-text-secondary)] hover:bg-white transition-colors"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setTargetInput(target > 0 ? String(target) : "");
                      setIsEditingTarget(true);
                    }}
                    className="flex items-center gap-1 mb-3 -ml-1 px-2.5 py-1 rounded-md text-[12px] font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] hover:bg-white transition-colors"
                  >
                    <Gauge className="w-3.5 h-3.5" />
                    {target > 0 ? `目标 ${formatMinutes(target)} · 点击修改` : "设定目标时长"}
                  </button>
                )}

                {isLogging ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap gap-1.5">
                      {QUICK_MINUTES.map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => handleLogMinutes(m)}
                          className="px-2.5 py-1.5 rounded-lg bg-white border border-[var(--color-border)] text-[12px] font-medium text-[var(--color-text-primary)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors"
                        >
                          {formatMinutes(m)}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        value={customMinutes}
                        onChange={(e) => setCustomMinutes(e.target.value)}
                        placeholder="自定义分钟数"
                        className="flex-1 px-3 py-2 rounded-lg border border-[var(--color-border)] text-[13px] bg-white placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:border-[var(--color-primary)]"
                      />
                      <button
                        type="button"
                        onClick={() => handleLogMinutes(Math.round(Number(customMinutes)))}
                        disabled={!customMinutes || Number(customMinutes) <= 0}
                        className={[
                          "px-3 py-2 rounded-lg text-[12px] font-medium transition-colors",
                          customMinutes && Number(customMinutes) > 0
                            ? "bg-[var(--color-primary)] text-white hover:bg-[#1d4ed8]"
                            : "bg-[var(--color-bg-gray-light)] text-[var(--color-text-tertiary)] cursor-not-allowed",
                        ].join(" ")}
                      >
                        确认
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsLogging(false);
                          setCustomMinutes("");
                        }}
                        className="px-3 py-2 rounded-lg text-[12px] text-[var(--color-text-secondary)] hover:bg-white transition-colors"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsLogging(true)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-[var(--color-border)] text-[12px] font-medium text-[var(--color-primary)] hover:border-[var(--color-primary)] transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    记一笔
                  </button>
                )}
              </div>
            );
          })()}
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

      {/* 删除任务二次确认 */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="删除这个任务？"
        description={`「${task.title}」删除后无法恢复`}
        onConfirm={handleConfirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />

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
