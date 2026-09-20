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
import { CN_WEEKDAY, addDays, parseISODate, startOfWeek, toISODate } from "@/components/todo/date";
import { CalendarDays, Check, ChevronDown, Flag, Timer } from "lucide-react";
import { formatMinutes, taskLoggedMinutes } from "@/components/todo/time";
import { mainlinesOf } from "@/components/todo/goal";
import { resolveTaskGoalResult } from "@/components/todo/taskGoal";
import TaskBottomSheet from "@/components/TaskBottomSheet";
import QuickAddTask from "@/components/QuickAddTask";
import MainlineBar from "@/components/MainlineBar";
import MainlinePlanner from "@/components/MainlinePlanner";
import { AppHeader, AppShell, MonthDatePicker, ViewTabs, WeekArrow } from "@/components/ViewChrome";

type Props = {
  viewMode: ViewMode;
  onChangeViewMode: (mode: ViewMode) => void;
  selectedDate: ISODate;
  onSelectDate: (date: ISODate) => void;
  tasks: Task[];
  entries: TimeEntry[];
  onCycleTaskStatus: (taskId: string) => void;
  onAddSubtasks: (taskId: string, titles: string[], beforeSubtaskId?: string) => void;
  onToggleSubtask: (taskId: string, subId: string) => void;
  onDeleteSubtask: (taskId: string, subId: string) => void;
  onEditSubtask: (taskId: string, subId: string, title: string) => void;
  onReorderSubtask: (taskId: string, subId: string, targetId: string, edge: "before" | "after") => void;
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
  onToggleMainline: (date: ISODate, aspirationId: string) => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
};

// 状态按钮与详情按钮并列，避免嵌套按钮或点圆圈误进详情。
function WeekTaskRow({
  task,
  entries,
  isMainline,
  resultTitle,
  onClick,
  onCycleStatus,
}: {
  task: Task;
  entries: TimeEntry[];
  isMainline: boolean;
  resultTitle?: string;
  onClick: () => void;
  onCycleStatus: () => void;
}) {
  const isDone = task.status === "done";
  const isInProgress = task.status === "in_progress";
  const isHigh = task.priority === "high";
  const target = task.targetMinutes ?? 0;
  const logged = taskLoggedMinutes(task, entries);
  const reached = target > 0 && logged >= target;
  const manualPct = target > 0 ? 0 : (task.progress ?? 0);

  return (
    <div
      className={[
        "w-full flex items-center rounded-lg text-left transition-colors",
        isDone
          ? "bg-[#DCFCE7]"
          : isInProgress
            ? "bg-[#EFF6FF]"
            : isHigh
              ? "bg-[#FEF2F2]"
              : "bg-[#F4F4F5]",
      ].join(" ")}
    >
      <button type="button" onClick={onCycleStatus}
        aria-label={`${isDone ? "设为待办" : isInProgress ? "标记为已完成" : "标记为进行中"}：${task.title}`}
        className="flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-lg hover:bg-[var(--color-bg-white)]/60 focus-visible:outline-[var(--color-primary)]">
        <span className={`flex h-5 w-5 items-center justify-center rounded-full ${isDone ? "bg-[var(--color-success)]" : isInProgress ? "border-2 border-[var(--color-primary)]" : "border-[1.5px] border-[var(--color-text-tertiary)]"}`}>
          {isDone ? <Check className="h-3 w-3 text-white" strokeWidth={2.7} /> : isInProgress ? <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-primary)]" /> : null}
        </span>
      </button>
      <button type="button" onClick={onClick} aria-label={`查看任务详情：${task.title}`}
        className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg py-2 pr-3 text-left hover:bg-[var(--color-bg-white)]/40 focus-visible:outline-[var(--color-primary)]">
      {isHigh && !isDone && <Flag className="h-3 w-3 shrink-0 text-[var(--color-danger)]" />}

      {/* 标题 + 所属关键结果。周视图也要能看出这件事在推进什么。 */}
      <span className="flex min-w-0 flex-1 flex-col">
        <span
          className={[
            "truncate text-[13px] font-medium",
            isDone
              ? "text-[#16A34A] line-through"
              : isInProgress
                ? "text-[#2563EB]"
                : "text-[var(--color-text-primary)]",
          ].join(" ")}
          data-full-text={task.title}
        >
          {task.title}
        </span>
        {resultTitle && (
          <span
            className="truncate text-[9px] font-medium leading-3 text-[var(--color-text-tertiary)]"
            data-full-text={`关键结果：${resultTitle}`}
          >
            KR · {resultTitle}
          </span>
        )}
      </span>

      {task.sourceHabitId && !isDone && (
        <span className="flex-shrink-0 rounded bg-[#F5F3FF] px-1.5 py-0.5 text-[10px] font-medium text-[#7C3AED]">
          习惯
        </span>
      )}

      {task.sourceBehaviorId && !task.sourceHabitId && !isDone && (
        <span className="flex-shrink-0 rounded bg-[#EEF2FF] px-1.5 py-0.5 text-[10px] font-medium text-[#4F46E5]">
          重复
        </span>
      )}

      {isMainline && !isDone && (
        <span className="flex-shrink-0 rounded bg-[var(--color-primary-light)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-primary)]">
          主线
        </span>
      )}

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
      ) : logged > 0 || (manualPct > 0 && !isDone) ? (
        <span className="flex flex-shrink-0 items-center gap-1.5 text-[11px] font-medium">
          {logged > 0 && (
            <span className="flex items-center gap-0.5 text-[var(--color-primary)]">
              <Timer className="h-3 w-3" />
              {formatMinutes(logged)}
            </span>
          )}
          {manualPct > 0 && !isDone && (
            <span className="tabular-nums text-[var(--color-text-tertiary)]">{manualPct}%</span>
          )}
        </span>
      ) : (
        task.startTime && (
          <span className="text-[11px] text-[var(--color-text-tertiary)] flex-shrink-0">
            {task.startTime}
          </span>
        )
      )}
      </button>
    </div>
  );
}

// 每天一行：左侧日期列 + 右侧完整任务列表（不再折叠）
function DayRow({
  date,
  tasks,
  entries,
  goalResults,
  behaviors,
  habits,
  mainlineIds,
  onTaskClick,
  onCreateTask,
  onCycleTaskStatus,
}: {
  date: Date;
  tasks: Task[];
  entries: TimeEntry[];
  goalResults: GoalResult[];
  behaviors: BehaviorCard[];
  habits: Habit[];
  mainlineIds: string[];
  onTaskClick: (task: Task) => void;
  onCreateTask: (task: Omit<Task, "id">) => void;
  onCycleTaskStatus: (taskId: string) => void;
}) {
  const iso = toISODate(date);
  const isToday = toISODate(new Date()) === iso;
  const dayNum = date.getDate();
  const weekday = CN_WEEKDAY[date.getDay()];

  const isMainlineTask = (task: Task) =>
    !!task.aspirationId && mainlineIds.includes(task.aspirationId);

  // 不限时段排在具体时间之前；其中属于当天主线的再优先。
  const sortedTasks = [...tasks].sort((a, b) => {
    if (!a.startTime && !b.startTime) {
      return Number(isMainlineTask(b)) - Number(isMainlineTask(a));
    }
    if (!a.startTime) return -1;
    if (!b.startTime) return 1;
    return a.startTime.localeCompare(b.startTime);
  });

  const doneTasks = tasks.filter((t) => t.status === "done").length;
  const totalTasks = tasks.length;

  return (
    <div className="flex gap-3 border-b border-[var(--color-border)] px-4 py-3 last:border-b-0 md:self-start md:rounded-xl md:border md:bg-white md:last:border-b">
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
              isMainline={isMainlineTask(task)}
              resultTitle={resolveTaskGoalResult(task, goalResults, behaviors, habits)?.title}
              onClick={() => onTaskClick(task)}
              onCycleStatus={() => onCycleTaskStatus(task.id)}
            />
          ))
        ) : null}
        <QuickAddTask compact date={iso} onCreate={onCreateTask} />
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
  onAddSubtasks,
  onToggleSubtask,
  onDeleteSubtask,
  onEditSubtask,
  onReorderSubtask,
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
  onToggleMainline,
  onPrevWeek,
  onNextWeek,
}: Props) {
  const [datePickerOpen, setDatePickerOpen] = useState(false);
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
      <AppShell>
        <AppHeader title="周计划" />
        <div className="flex flex-wrap items-center gap-x-1 px-2 pb-2" aria-label="周日期导航">
          <WeekArrow direction="prev" onClick={onPrevWeek} />
          <button type="button" onClick={() => setDatePickerOpen(true)} aria-label={`选择周日期，当前为${rangeLabel}`}
            className="flex min-h-11 items-center gap-1 rounded-lg px-1 text-[12px] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-gray-light)]">
            {rangeLabel}<ChevronDown className="h-3.5 w-3.5 shrink-0" />
          </button>
          <WeekArrow direction="next" onClick={onNextWeek} />
          {toISODate(weekStart) !== toISODate(startOfWeek(parseISODate(today), true)) && <button type="button"
            onClick={() => onSelectDate(today)} aria-label="回到本周"
            className="flex min-h-11 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary-light)]">
            <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            回本周
          </button>}
        </div>
        {datePickerOpen && <MonthDatePicker selectedDate={selectedDate} today={today} onSelect={onSelectDate} onClose={() => setDatePickerOpen(false)} />}
        <MainlineBar
          date={today}
          showMainlines={false}
          aspirations={aspirations}
          dayPlans={dayPlans}
          onOpenGoals={onOpenGoals}
          onOpenGoal={onOpenGoal}
          onToggleMainline={onToggleMainline}
          running={running}
          elapsedMs={elapsedMs}
          onStopTimer={onStopTimer}
        />
        <ViewTabs value={viewMode} onChange={onChangeViewMode} />

        {/* 本周完成/未完成（原来挤在 tab 右边，把 tab 挤窄了，切过来按钮就移位） */}
        <div className="flex w-full items-center gap-3 px-[18px] pb-1 pt-1 text-[11px] font-medium">
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
        <div className="px-[18px] pb-3 pt-2">
          <QuickAddTask onCreate={onCreateTask} date={selectedDate} showDate />
        </div>

        <MainlinePlanner
          days={days}
          today={toISODate(new Date()) as ISODate}
          aspirations={aspirations}
          dayPlans={dayPlans}
          onToggle={onToggleMainline}
        />

        {/* Week Days List */}
        <div className="flex flex-1 flex-col overflow-y-auto border-t border-[var(--color-border)] md:grid md:grid-cols-2 md:items-start md:gap-3 md:border-t-0 md:bg-[var(--color-bg-gray-lighter)] md:p-[18px]">
          {days.map((d) => {
            const iso = toISODate(d);
            const dayTasks = tasks.filter((t) => t.date === iso);
            return (
              <DayRow
                key={iso}
                date={d}
                tasks={dayTasks}
                entries={entries}
                goalResults={goalResults}
                behaviors={behaviors}
                habits={habits}
                mainlineIds={mainlinesOf(iso as ISODate, dayPlans, aspirations).map(
                  (aspiration) => aspiration.id,
                )}
                onTaskClick={handleTaskClick}
                onCreateTask={onCreateTask}
                onCycleTaskStatus={onCycleTaskStatus}
              />
            );
          })}
        </div>

      </AppShell>

      {/* Bottom Sheet */}
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
    </>
  );
}
