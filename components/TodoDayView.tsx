"use client";

import { useState } from "react";
import type { Aspiration, DayPlan, ISODate, Task, TimeEntry, ViewMode } from "@/components/todo/types";
import { CN_WEEKDAY, addDays, formatCNDateTitle, parseISODate, startOfWeek, toISODate } from "@/components/todo/date";
import { formatMinutes, taskLoggedMinutes } from "@/components/todo/time";
import { goalColor } from "@/components/todo/goal";
import { Plus, Check, Trash2, ChevronLeft, ChevronRight, ChevronDown, ListChecks, Pencil, Timer } from "lucide-react";
import TaskBottomSheet from "@/components/TaskBottomSheet";
import ConfirmDialog from "@/components/ConfirmDialog";
import QuickAddTask from "@/components/QuickAddTask";
import MainlineBar from "@/components/MainlineBar";

type Props = {
  viewMode: ViewMode;
  onChangeViewMode: (mode: ViewMode) => void;
  selectedDate: ISODate;
  onSelectDate: (date: ISODate) => void;
  tasks: Task[];
  entries: TimeEntry[];
  onCycleTaskStatus: (taskId: string) => void;
  onAddSubtasks: (taskId: string, titles: string[], beforeSubtaskId?: string) => void;
  onDeleteSubtask: (taskId: string, subId: string) => void;
  onEditSubtask: (taskId: string, subId: string, title: string) => void;
  onToggleSubtask: (taskId: string, subId: string) => void;
  onReorderSubtask: (taskId: string, subId: string, targetId: string, edge: "before" | "after") => void;
  onOpenAddModal: () => void;
  onCreateTask: (task: Omit<Task, "id">) => void;
  onDeleteTask: (taskId: string) => void;
  onUpdateTask: (taskId: string, updates: Partial<Omit<Task, "id">>) => void;
  onAddEntry: (entry: Omit<TimeEntry, "id">) => void;
  today: ISODate;
  aspirations: Aspiration[];
  dayPlans: Record<string, DayPlan>;
  onOpenGoals: () => void;
  running: { title: string; startedAt: number } | null;
  elapsedMs: number;
  onStopTimer: () => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
};

function timeLabel(t: Task) {
  if (t.startTime && t.endTime) return `${t.startTime} - ${t.endTime}`;
  if (t.startTime) return t.startTime;
  return "";
}

// 分组规则：只要没给具体开始时间，就属于「不限时段」；
// 有开始时间的再按 00:00-11:59 上午，12:00-17:59 下午，18:00+ 晚间。
function sectionForTask(t: Task): "不限时段" | "上午" | "下午" | "晚间" {
  if (!t.startTime) return "不限时段";
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
  onAddSubtasks,
  onDeleteSubtask,
  onEditSubtask,
  onToggleSubtask,
  onReorderSubtask,
  onOpenAddModal,
  onCreateTask,
  onDeleteTask,
  onUpdateTask,
  onAddEntry,
  today,
  aspirations,
  dayPlans,
  onOpenGoals,
  running,
  elapsedMs,
  onStopTimer,
  onPrevWeek,
  onNextWeek,
}: Props) {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [offOpen, setOffOpen] = useState(false);        // 非主线任务默认折起来
  // 展开的任务（看子任务）。默认全收起——卡片列表要保持一眼扫得完
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleTaskExpanded(taskId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

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

  // 今天主线
  const plan = dayPlans[selectedDate];
  const mainIds = plan?.primaryAspirationIds ?? [];
  const isMainlineTask = (t: Task) => !!t.aspirationId && mainIds.includes(t.aspirationId);

  const dayTasks = tasks
    .filter((t) => t.date === selectedDate)
    .slice()
    .sort((a, b) => {
      // 没有时间可比时，主线就是当天最重要的排序依据。
      if (!a.startTime && !b.startTime) {
        return Number(isMainlineTask(b)) - Number(isMainlineTask(a));
      }
      return (a.startTime ?? "99:99").localeCompare(b.startTime ?? "99:99");
    });

  /**
   * 不属于今天主线的任务。**没归属目标的不算**——零必填，不填目标不该被折起来。
   * 没排主线时也不折叠（那天没有"主次"这回事）。
   */
  const isOffMainline = (t: Task) =>
    mainIds.length > 0 && !!t.aspirationId && !mainIds.includes(t.aspirationId);

  const focusTasks = dayTasks.filter((t) => !isOffMainline(t));
  const offTasks = dayTasks.filter(isOffMainline);

  const groups = {
    不限时段: focusTasks.filter((t) => sectionForTask(t) === "不限时段"),
    上午: focusTasks.filter((t) => sectionForTask(t) === "上午"),
    下午: focusTasks.filter((t) => sectionForTask(t) === "下午"),
    晚间: focusTasks.filter((t) => sectionForTask(t) === "晚间"),
  } as const;

  // 任务卡：简单任务直接执行；有子步骤的任务把第一条未完成步骤露成「下一步」。
  function renderTaskCard(t: Task) {
    const isDone = t.status === "done";
    const isInProgress = t.status === "in_progress";
    const isHigh = t.priority === "high";
    const time = timeLabel(t);
    const target = t.targetMinutes ?? 0;
    const logged = target > 0 ? taskLoggedMinutes(t, entries) : 0;
    const reached = target > 0 && logged >= target;
    const manualPct = target > 0 ? 0 : (t.progress ?? 0);
    const subs = t.subtasks ?? [];
    const subDone = subs.filter((x) => x.done).length;
    const nextSubtask = subs.find((x) => !x.done);
    const isExpanded = expanded.has(t.id);

    return (
      <div
        key={t.id}
        className={[
          "relative w-full flex flex-col rounded-[10px] transition-colors bg-white",
          isInProgress
            ? "border-[1.5px] border-[var(--color-primary)]"
            : "border border-[var(--color-border)]",
        ].join(" ")}
      >
      <div
        className="w-full flex items-center gap-3 px-3.5 py-3 cursor-pointer"
        onClick={() => {
          if (subs.length > 0) toggleTaskExpanded(t.id);
          else onCycleTaskStatus(t.id);
        }}
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

          {/* 项目型任务的执行入口：父标题交代成果，第一条未完成步骤负责让行为发生。 */}
          {nextSubtask && !isExpanded && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleSubtask(t.id, nextSubtask.id);
              }}
              className="w-full flex items-start gap-2 mt-1.5 px-2.5 py-2 rounded-lg bg-[var(--color-primary-light)] text-left hover:bg-[#DBEAFE] transition-colors"
              aria-label={`完成下一步：${nextSubtask.title}`}
            >
              <span className="mt-[1px] w-[15px] h-[15px] rounded-[4px] border border-[var(--color-primary)] bg-white flex items-center justify-center flex-shrink-0" />
              <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                <span className="text-[10px] font-semibold text-[var(--color-primary)]">下一步</span>
                <span className="text-[12px] leading-snug text-[var(--color-text-primary)] break-words">
                  {nextSubtask.title}
                </span>
              </span>
            </button>
          )}

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
            {/* 所属目标：光一个色点认不出是哪个，带上名字 */}
            {(() => {
              const gi = aspirations.findIndex((a) => a.id === t.aspirationId);
              if (gi < 0) return null;
              const c = goalColor(aspirations[gi], gi);
              return (
                <span
                  className="flex items-center gap-1 rounded px-1.5 py-0.5 max-w-[120px]"
                  style={{ backgroundColor: `${c}14` }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: c }}
                  />
                  <span className="text-[10px] font-medium truncate" style={{ color: c }}>
                    {aspirations[gi].title}
                  </span>
                </span>
              );
            })()}

            {/* 子任务进度：这是展开的点击区。**必须自己一个 hit target**——
                卡片主体点了是切状态，不能被展开抢走 */}
            {subs.length > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleTaskExpanded(t.id);
                }}
                className="flex items-center gap-0.5 rounded px-1.5 py-0.5 bg-[var(--color-bg-gray-light)] hover:bg-[var(--color-border)] transition-colors"
              >
                <ListChecks className="w-3 h-3 text-[var(--color-text-tertiary)]" />
                <span className="text-[10px] font-medium text-[var(--color-text-secondary)] tabular-nums">
                  {subDone}/{subs.length}
                </span>
                <ChevronDown
                  className={[
                    "w-3 h-3 text-[var(--color-text-tertiary)] transition-transform",
                    isExpanded ? "rotate-180" : "",
                  ].join(" ")}
                />
              </button>
            )}

            {/* 标签/状态 */}
            {isMainlineTask(t) && !isDone && (
              <div className="rounded bg-[var(--color-primary-light)] px-1.5 py-0.5">
                <span className="text-[10px] font-semibold text-[var(--color-primary)]">主线</span>
              </div>
            )}
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

        {isExpanded && subs.length > 0 && (
          <div className="w-full flex flex-col gap-0.5 px-3.5 pb-2.5 pt-0.5 border-t border-[var(--color-border)]">
            {subs.map((st) => {
              const isNext = st.id === nextSubtask?.id;
              return (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => onToggleSubtask(t.id, st.id)}
                  className={[
                    "w-full flex items-start gap-2 px-2 py-1.5 rounded-md text-left group",
                    isNext ? "bg-[var(--color-primary-light)]" : "",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "w-[15px] h-[15px] rounded-[4px] border flex items-center justify-center flex-shrink-0 mt-[1px] transition-colors",
                      st.done
                        ? "bg-[var(--color-success)] border-[var(--color-success)]"
                        : isNext
                          ? "border-[var(--color-primary)] bg-white"
                          : "border-[var(--color-border)] group-hover:border-[var(--color-primary)]",
                    ].join(" ")}
                  >
                    {st.done && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3.5} />}
                  </span>
                  <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                    {isNext && (
                      <span className="text-[9px] font-semibold text-[var(--color-primary)]">下一步</span>
                    )}
                    <span
                      className={[
                        "text-[12px] leading-snug break-words",
                        st.done
                          ? "text-[var(--color-text-tertiary)] line-through"
                          : isNext
                            ? "text-[var(--color-text-primary)] font-medium"
                            : "text-[var(--color-text-secondary)]",
                      ].join(" ")}
                    >
                      {st.title}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

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

      <MainlineBar
        today={today}
        aspirations={aspirations}
        dayPlans={dayPlans}
        onOpenGoals={onOpenGoals}
        running={running}
        elapsedMs={elapsedMs}
        onStopTimer={onStopTimer}
      />

      {/* View Switcher Section */}
      <div className="w-full flex flex-col gap-4 px-6 pt-4">
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
                {sectionTasks.map(renderTaskCard)}
              </div>
            </div>
          );
        })}

        {/* 非主线目标的任务：默认折起来，可展开，不阻止 */}
        {offTasks.length > 0 && (
          <div className="w-full flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setOffOpen((v) => !v)}
              className="w-full flex items-center gap-1.5 text-left"
            >
              <ChevronDown
                className={[
                  "w-4 h-4 text-[var(--color-text-tertiary)] transition-transform",
                  offOpen ? "" : "-rotate-90",
                ].join(" ")}
              />
              <span className="text-[14px] font-medium text-[var(--color-text-secondary)]">
                不是今天主线的 {offTasks.length} 项
              </span>
              <div className="flex-1" />
              <span className="flex items-center gap-1 flex-shrink-0">
                {[...new Set(offTasks.map((t) => t.aspirationId))].map((id) => {
                  const gi = aspirations.findIndex((a) => a.id === id);
                  return gi >= 0 ? (
                    <span
                      key={id}
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: goalColor(aspirations[gi], gi) }}
                      title={aspirations[gi].title}
                    />
                  ) : null;
                })}
              </span>
            </button>
            {offOpen && <div className="w-full flex flex-col gap-2">{offTasks.map(renderTaskCard)}</div>}
          </div>
        )}

        {dayTasks.length === 0 ? (
          <div className="text-center text-[13px] text-[var(--color-text-tertiary)] py-10">
            当天暂无任务
          </div>
        ) : null}
      </div>

      {/* Bottom Sheet for editing */}
      <TaskBottomSheet
        onAddSubtasks={onAddSubtasks}
        onToggleSubtask={onToggleSubtask}
        onDeleteSubtask={onDeleteSubtask}
        onEditSubtask={onEditSubtask}
        onReorderSubtask={onReorderSubtask}
        task={selectedTask}
        entries={entries}
        isOpen={isBottomSheetOpen}
        onClose={handleCloseBottomSheet}
        onCycleStatus={onCycleTaskStatus}
        onDelete={onDeleteTask}
        onUpdate={onUpdateTask}
        onAddEntry={onAddEntry}
        aspirations={aspirations}
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
