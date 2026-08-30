"use client";

import { useState } from "react";
import type {
  Aspiration,
  BehaviorCard,
  DayPlan,
  GoalResult,
  Habit,
  ISODate,
  Task,
  TimeEntry,
  ViewMode,
} from "@/components/todo/types";
import { CN_WEEKDAY, addDays, parseISODate, startOfWeek } from "@/components/todo/date";
import { formatMinutes, taskLoggedMinutes } from "@/components/todo/time";
import { goalColor } from "@/components/todo/goal";
import { resolveTaskGoalResult } from "@/components/todo/taskGoal";
import { Check, ChevronDown, ListChecks, MoreHorizontal, Timer } from "lucide-react";
import TaskBottomSheet from "@/components/TaskBottomSheet";
import QuickAddTask from "@/components/QuickAddTask";
import MainlineBar from "@/components/MainlineBar";
import { AppHeader, AppShell, ViewTabs, WeekDateStrip } from "@/components/ViewChrome";

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
  goalResults: GoalResult[];
  behaviors: BehaviorCard[];
  habits: Habit[];
  dayPlans: Record<string, DayPlan>;
  onOpenGoals: () => void;
  onOpenGoal: (aspirationId: string, resultId?: string) => void;
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
        "flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full transition-colors",
        isDone
          ? "bg-[var(--color-primary)]"
          : isInProgress
            ? "border-2 border-[var(--color-primary)] bg-white"
            : "border-[1.5px] border-[var(--color-border)] bg-white hover:border-[var(--color-text-tertiary)]",
      ].join(" ")}
      aria-label="切换任务状态"
    >
      {isDone ? (
        <Check className="h-3 w-3 text-white" strokeWidth={2.7} />
      ) : isInProgress ? (
        // 空心圆里有实心小圆点
        <div className="h-1.5 w-1.5 rounded-full bg-[var(--color-primary)]" />
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
  goalResults,
  behaviors,
  habits,
  dayPlans,
  onOpenGoals,
  onOpenGoal,
  running,
  elapsedMs,
  onStopTimer,
  onPrevWeek,
  onNextWeek,
}: Props) {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false);
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
  function handleStartEdit(e: React.MouseEvent, task: Task) {
    e.stopPropagation();
    setSelectedTaskId(task.id);
    setIsBottomSheetOpen(true);
  }

  function handleOpenTaskGoal(e: React.MouseEvent, task: Task) {
    e.stopPropagation();
    if (!task.aspirationId) return;
    const exactResult = resolveTaskGoalResult(task, goalResults, behaviors, habits);
    onOpenGoal(task.aspirationId, exactResult?.id);
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

  const anytimeTasks = focusTasks.filter((task) => !task.startTime);
  const scheduledTasks = focusTasks.filter((task) => !!task.startTime);

  // 任务行：默认只露出执行所需的信息，详情和删除收进右侧的更多入口。
  function renderTaskCard(t: Task, showTime = true) {
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
    const stepStartAction =
      nextSubtask?.startAction && !nextSubtask.startAction.done
        ? nextSubtask.startAction
        : undefined;
    const startActionTarget = t.startAction?.targetStepId
      ? subs.find((subtask) => subtask.id === t.startAction?.targetStepId)
      : undefined;
    const startActionWaiting = Boolean(
      startActionTarget && nextSubtask && startActionTarget.id !== nextSubtask.id,
    );
    const legacyStartAction =
      t.startAction && !t.startAction.done && !startActionTarget?.done && !startActionWaiting
        ? t.startAction
        : undefined;
    const activeStartAction = stepStartAction ?? legacyStartAction;
    const startActionLivesOnStep = Boolean(stepStartAction);
    const isExpanded = expanded.has(t.id);
    const taskResult = resolveTaskGoalResult(t, goalResults, behaviors, habits);

    const hasMeta =
      (showTime && !!time) ||
      !!t.aspirationId ||
      subs.length > 0 ||
      isMainlineTask(t) ||
      !!t.sourceHabitId ||
      !!t.sourceBehaviorId ||
      !!t.tag ||
      isHigh;

    return (
      <div key={t.id} className={isInProgress ? "bg-[#F8FBFF]" : "bg-white"}>
        <div
          className="group flex w-full cursor-pointer items-start gap-2.5 px-1 py-2.5"
          onClick={() => {
            if (subs.length > 0) toggleTaskExpanded(t.id);
            else onCycleTaskStatus(t.id);
          }}
        >
          <span className="pt-0.5">
            <StatusIndicator status={t.status} onClick={() => onCycleTaskStatus(t.id)} />
          </span>

          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span
              className={[
                "truncate text-[14px] font-medium leading-5",
                isDone ? "text-[var(--color-text-tertiary)] line-through" : "text-[var(--color-text-primary)]",
              ].join(" ")}
              data-full-text={t.title}
            >
              {t.title}
            </span>

            {nextSubtask && !isExpanded && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleSubtask(t.id, nextSubtask.id);
                }}
                className="mt-1 flex w-full items-start gap-1.5 rounded-md bg-[var(--color-primary-light)] px-2 py-1.5 text-left transition-colors hover:bg-[#DBEAFE]"
                aria-label={`完成下一步：${nextSubtask.title}`}
              >
                <span className="mt-[2px] h-3 w-3 flex-shrink-0 rounded-full border border-[var(--color-primary)] bg-white" />
                <span
                  className="min-w-0 flex-1 truncate text-[11px] leading-4 text-[var(--color-text-primary)]"
                  data-full-text={nextSubtask.title}
                >
                  <strong className="mr-1 font-semibold text-[var(--color-primary)]">下一步</strong>
                  {nextSubtask.title}
                </span>
              </button>
            )}

            {activeStartAction && !isExpanded && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onUpdateTask(
                    t.id,
                    startActionLivesOnStep && nextSubtask
                      ? {
                          subtasks: subs.map((subtask) =>
                            subtask.id === nextSubtask.id
                              ? {
                                  ...subtask,
                                  startAction: {
                                    ...activeStartAction,
                                    kind: "minimum",
                                    targetStepId: subtask.id,
                                    done: true,
                                  },
                                }
                              : subtask,
                          ),
                          ...(t.status === "todo" ? { status: "in_progress" as const } : {}),
                        }
                      : {
                          startAction: { ...activeStartAction, kind: "minimum", done: true },
                          ...(t.status === "todo" ? { status: "in_progress" as const } : {}),
                        },
                  );
                }}
                className="mt-1 flex w-full items-start gap-1.5 rounded-md bg-[#FAF5FF] px-2 py-1.5 text-left transition-colors hover:bg-[#F3E8FF]"
                aria-label={`完成最小启动：${activeStartAction.title}`}
              >
                <span className="mt-[2px] h-3 w-3 flex-shrink-0 rounded-full border border-[#7C3AED] bg-white" />
                <span
                  className="min-w-0 flex-1 truncate text-[11px] leading-4 text-[var(--color-text-primary)]"
                  data-full-text={activeStartAction.title}
                >
                  <strong className="mr-1 font-semibold text-[#7C3AED]">先只做</strong>
                  {activeStartAction.title}
                </span>
              </button>
            )}

            {target > 0 && (
              <div className="mt-0.5 flex items-center gap-2">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--color-bg-gray-light)]">
                  <div
                    className={[
                      "h-full rounded-full transition-all",
                      reached ? "bg-[var(--color-success)]" : "bg-[var(--color-primary)]",
                    ].join(" ")}
                    style={{ width: `${Math.min(100, Math.round((logged / target) * 100))}%` }}
                  />
                </div>
                <span className={[
                  "flex items-center gap-0.5 text-[10px] font-medium",
                  reached ? "text-[var(--color-success)]" : "text-[var(--color-text-tertiary)]",
                ].join(" ")}>
                  <Timer className="h-2.5 w-2.5" />
                  {formatMinutes(logged)} / {formatMinutes(target)}
                </span>
              </div>
            )}

            {manualPct > 0 && !isDone && (
              <div className="mt-0.5 flex items-center gap-2">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--color-bg-gray-light)]">
                  <div className="h-full rounded-full bg-[var(--color-primary)]" style={{ width: `${manualPct}%` }} />
                </div>
                <span className="text-[10px] font-medium text-[var(--color-text-tertiary)]">{manualPct}%</span>
              </div>
            )}

            {hasMeta && (
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] leading-4">
                {showTime && time && (
                  <span className={isInProgress ? "font-medium text-[var(--color-primary)]" : "text-[var(--color-text-tertiary)]"}>
                    {time}
                  </span>
                )}
                {(() => {
                  const gi = aspirations.findIndex((a) => a.id === t.aspirationId);
                  if (gi < 0) return null;
                  const color = goalColor(aspirations[gi], gi);
                  return (
                    <button
                      type="button"
                      onClick={(event) => handleOpenTaskGoal(event, t)}
                      className="flex min-w-0 max-w-[220px] items-center gap-1 rounded-sm transition-opacity hover:opacity-70"
                      style={{ color }}
                      aria-label={`打开${aspirations[gi].title}${taskResult ? `的关键结果：${taskResult.title}` : "的焦点地图"}`}
                    >
                      <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ backgroundColor: color }} />
                      <span
                        className="truncate font-medium"
                        data-full-text={taskResult ? `${aspirations[gi].title} › ${taskResult.title}` : aspirations[gi].title}
                      >
                        {aspirations[gi].title}
                        {taskResult && (
                          <>
                            <span className="mx-1 opacity-45">›</span>
                            <span className="font-normal">{taskResult.title}</span>
                          </>
                        )}
                      </span>
                    </button>
                  );
                })()}
                {subs.length > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleTaskExpanded(t.id);
                    }}
                    className="flex items-center gap-0.5 text-[var(--color-text-secondary)]"
                  >
                    <ListChecks className="h-3 w-3" />
                    <span className="font-medium tabular-nums">{subDone}/{subs.length}</span>
                    <ChevronDown className={["h-2.5 w-2.5 transition-transform", isExpanded ? "rotate-180" : ""].join(" ")} />
                  </button>
                )}
                {isMainlineTask(t) && !isDone && <span className="font-semibold text-[var(--color-primary)]">主线</span>}
                {t.sourceHabitId && !isDone && <span className="font-medium text-[#7C3AED]">习惯</span>}
                {t.sourceBehaviorId && !t.sourceHabitId && !isDone && (
                  <span className="font-medium text-[#4F46E5]">重复</span>
                )}
                {t.tag && !isDone && !isInProgress && <span className="text-[var(--color-text-secondary)]">{t.tag}</span>}
                {isHigh && !isDone && <span className="font-medium text-[var(--color-danger)]">高优</span>}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={(e) => handleStartEdit(e, t)}
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-[var(--color-text-tertiary)] opacity-50 transition-[opacity,background-color] hover:bg-[var(--color-bg-gray-light)] sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
            aria-label={`编辑${t.title}`}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>

        {isExpanded && subs.length > 0 && (
          <div className="ml-8 flex w-[calc(100%-2rem)] flex-col gap-0.5 border-t border-[var(--color-border)] pb-2 pt-1">
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

  const headerTitle = selectedDate === today ? "今天" : `${selected.getMonth() + 1}月${selected.getDate()}日`;
  const headerSubtitle = selectedDate === today
    ? `${selected.getMonth() + 1}月${selected.getDate()}日 · ${CN_WEEKDAY[selected.getDay()]}`
    : `${selected.getFullYear()}年 · ${CN_WEEKDAY[selected.getDay()]}`;
  const useDesktopSplit =
    scheduledTasks.length > 0 && (anytimeTasks.length > 0 || offTasks.length > 0);

  return (
    <AppShell>
      <AppHeader
        title={headerTitle}
        subtitle={headerSubtitle}
        onPrev={onPrevWeek}
        onNext={onNextWeek}
        onAdd={onOpenAddModal}
      />
      <MainlineBar
        date={selectedDate}
        aspirations={aspirations}
        dayPlans={dayPlans}
        onOpenGoals={onOpenGoals}
        onOpenGoal={onOpenGoal}
        running={running}
        elapsedMs={elapsedMs}
        onStopTimer={onStopTimer}
      />
      <ViewTabs value={viewMode} onChange={onChangeViewMode} />
      <WeekDateStrip days={days} selectedDate={selectedDate} today={today} onSelect={onSelectDate} />

      <div className="flex w-full flex-col gap-5 px-[18px] pb-6 pt-1">
        <QuickAddTask onCreate={onCreateTask} />

        <div
          className={
            useDesktopSplit
              ? "flex w-full flex-col gap-5 md:grid md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] md:items-start md:gap-x-6 md:gap-y-4"
              : "flex w-full flex-col gap-5"
          }
        >
          {anytimeTasks.length > 0 && (
            <section className={useDesktopSplit ? "w-full md:col-start-1 md:row-start-1" : "w-full"}>
              <div className="flex h-7 items-center justify-between border-b border-[var(--color-border)]">
                <h2 className="text-[12px] font-semibold text-[var(--color-text-primary)]">
                  {selectedDate === today ? "今日待办" : "当天待办"}
                </h2>
                <span className="text-[10px] font-medium text-[var(--color-text-tertiary)]">{anytimeTasks.length} 项</span>
              </div>
              <div className="divide-y divide-[var(--color-border)]">{anytimeTasks.map((task) => renderTaskCard(task, false))}</div>
            </section>
          )}

          {scheduledTasks.length > 0 && (
            <section
              className={
                useDesktopSplit
                  ? "w-full md:col-start-2 md:row-span-2 md:row-start-1"
                  : "w-full"
              }
            >
              <div className="flex h-7 items-center justify-between border-b border-[var(--color-border)]">
                <h2 className="text-[12px] font-semibold text-[var(--color-text-primary)]">日程</h2>
                <span className="text-[10px] font-medium text-[var(--color-text-tertiary)]">{scheduledTasks.length} 项</span>
              </div>
              <div>
                {scheduledTasks.map((task, index) => (
                  <div key={task.id} className="flex border-b border-[var(--color-border)] last:border-b-0">
                    <div className="w-[42px] flex-shrink-0 py-3 pr-1 text-right tabular-nums">
                      <span className="block text-[11px] font-semibold leading-4 text-[var(--color-text-secondary)]">
                        {task.startTime}
                      </span>
                      {task.endTime && (
                        <span className="block text-[9px] leading-3 text-[var(--color-text-tertiary)]">{task.endTime}</span>
                      )}
                    </div>
                    <div className="relative w-5 flex-shrink-0">
                      {index < scheduledTasks.length - 1 && (
                        <span className="absolute bottom-0 left-1/2 top-[17px] w-px -translate-x-1/2 bg-[var(--color-border)]" />
                      )}
                      <span className="absolute left-1/2 top-[15px] h-2 w-2 -translate-x-1/2 rounded-full border-2 border-white bg-[var(--color-primary)] shadow-[0_0_0_1px_var(--color-primary)]" />
                    </div>
                    <div className="min-w-0 flex-1">{renderTaskCard(task, false)}</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 非主线目标的任务：默认折起来，可展开，不阻止 */}
          {offTasks.length > 0 && (
            <div
              className={
                useDesktopSplit
                  ? `w-full md:col-start-1 ${anytimeTasks.length > 0 ? "md:row-start-2" : "md:row-start-1"}`
                  : "w-full"
              }
            >
              <button
                type="button"
                onClick={() => setOffOpen((v) => !v)}
                className="flex h-8 w-full items-center gap-1.5 border-b border-[var(--color-border)] text-left"
              >
                <ChevronDown
                  className={[
                    "h-3.5 w-3.5 text-[var(--color-text-tertiary)] transition-transform",
                    offOpen ? "" : "-rotate-90",
                  ].join(" ")}
                />
                <span className="text-[11px] font-medium text-[var(--color-text-secondary)]">
                  不是{selectedDate === today ? "今天" : "当天"}主线的 {offTasks.length} 项
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
              {offOpen && <div className="divide-y divide-[var(--color-border)]">{offTasks.map((task) => renderTaskCard(task))}</div>}
            </div>
          )}
        </div>

        {dayTasks.length === 0 ? (
          <div className="py-10 text-center text-[12px] text-[var(--color-text-tertiary)]">
            今天很干净，添加一件真正想推进的事吧
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
        goalResults={goalResults}
        behaviors={behaviors}
        habits={habits}
        onOpenGoal={onOpenGoal}
      />

    </AppShell>
  );
}
