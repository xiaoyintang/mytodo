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
import { CalendarDays, Check, ChevronDown, Flag, Star, Repeat2, Timer } from "lucide-react";
import { formatMinutes, taskLoggedMinutes } from "@/components/todo/time";
import { mainlinesOf } from "@/components/todo/goal";
import { resolveTaskGoalResult } from "@/components/todo/taskGoal";
import { buildWeekOverview } from "@/components/todo/weekOverview";
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
  isFocus = false,
  overview = false,
}: {
  task: Task;
  entries: TimeEntry[];
  isMainline: boolean;
  resultTitle?: string;
  onClick: () => void;
  onCycleStatus: () => void;
  isFocus?: boolean;
  overview?: boolean;
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
        isFocus
          ? "bg-[var(--color-focus-light)] ring-1 ring-inset ring-[var(--color-focus-border)]"
          : overview ? "bg-[var(--color-bg-white)] hover:bg-[var(--color-bg-gray-lighter)]" : isDone
          ? "bg-[var(--color-success-light)]"
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
      {isFocus ? <Star aria-label="当天关键任务" className="h-3.5 w-3.5 shrink-0 fill-current text-[var(--color-focus)]" />
        : isHigh && <Flag aria-label="高优先级" className="h-3 w-3 shrink-0 text-[var(--color-danger)]" />}

      {/* 标题 + 所属关键结果。周视图也要能看出这件事在推进什么。 */}
      <span className="flex min-w-0 flex-1 flex-col">
        <span
          className={[
            `${overview ? "line-clamp-2 leading-5" : "truncate"} text-[13px] ${isFocus ? "font-semibold" : "font-medium"}`,
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
        {!overview && resultTitle && (
          <span
            className="truncate text-[9px] font-medium leading-3 text-[var(--color-text-tertiary)]"
            data-full-text={`目标：${resultTitle}`}
          >
            KR · {resultTitle}
          </span>
        )}
      </span>

      {!overview && task.sourceHabitId && !isDone && (
        <span className="flex-shrink-0 rounded bg-[#F5F3FF] px-1.5 py-0.5 text-[10px] font-medium text-[#7C3AED]">
          习惯
        </span>
      )}

      {!overview && task.sourceBehaviorId && !task.sourceHabitId && !isDone && (
        <span className="flex-shrink-0 rounded bg-[#EEF2FF] px-1.5 py-0.5 text-[10px] font-medium text-[#4F46E5]">
          重复
        </span>
      )}

      {!overview && isMainline && !isDone && (
        <span className="flex-shrink-0 rounded bg-[var(--color-primary-light)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-primary)]">
          主线
        </span>
      )}

      {/* 右侧：时长目标进度 / 手动完成进度 / 开始时间 */}
      {!overview && (target > 0 ? (
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
      ))}
      </button>
    </div>
  );
}

// 每天先看重点；需要时展开当天的完整清单，始终操作原任务。
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
  importantTasks,
  focusTaskId,
  showAll,
  today,
  mainlineTitles,
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
  importantTasks: Task[];
  focusTaskId?: string;
  showAll: boolean;
  today: ISODate;
  mainlineTitles: string[];
}) {
  const [expanded, setExpanded] = useState(false);
  const iso = toISODate(date);
  const isToday = today === iso;
  const dayNum = date.getDate();
  const weekday = CN_WEEKDAY[date.getDay()];

  const isMainlineTask = (task: Task) =>
    !!task.aspirationId && mainlineIds.includes(task.aspirationId);

  const full = showAll || expanded;
  const sortedTasks = full ? tasks : importantTasks.slice(0, 3);
  const doneTasks = (full ? tasks : importantTasks).filter((t) => t.status === "done").length;
  const totalTasks = full ? tasks.length : importantTasks.length;
  const hiddenCount = tasks.length - importantTasks.length;

  return (
    <section aria-label={`${date.getMonth() + 1}月${dayNum}日的安排`} className="flex gap-2 border-b border-[var(--color-border)] px-3 py-3 last:border-b-0 md:self-start md:rounded-xl md:border md:bg-[var(--color-bg-white)] md:last:border-b">
      {/* Date column */}
      <div className="w-10 flex-shrink-0 flex flex-col items-center gap-1 pt-2">
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

      <div className="flex-1 flex flex-col gap-1.5 min-w-0">
        {mainlineTitles.length > 0 && <p className="truncate px-1 text-[11px] text-[var(--color-text-secondary)]" data-full-text={mainlineTitles.join(" · ")}>{mainlineTitles.join(" · ")}</p>}
        {sortedTasks.length > 0 ? (
          sortedTasks.map((task) => (
            <WeekTaskRow
              key={task.id}
              task={task}
              entries={entries}
              isMainline={isMainlineTask(task)}
              isFocus={task.id === focusTaskId}
              overview={!full}
              resultTitle={resolveTaskGoalResult(task, goalResults, behaviors, habits)?.title}
              onClick={() => onTaskClick(task)}
              onCycleStatus={() => onCycleTaskStatus(task.id)}
            />
          ))
        ) : <p className="px-1 py-2 text-[12px] text-[var(--color-text-tertiary)]">{tasks.length ? "还未选定重点" : "暂未安排"}</p>}
        <div className="flex flex-wrap items-center gap-x-2">
          {!showAll && (hiddenCount > 0 || importantTasks.length > 3 || expanded) && <button type="button" aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)} className="flex min-h-11 shrink-0 items-center gap-1 px-1 text-left text-[11px] text-[var(--color-text-secondary)]">
            <ChevronDown className={`h-3 w-3 ${expanded ? "rotate-180" : ""}`} />{expanded ? "收起" : importantTasks.length > 3 ? `展开当天 · ${tasks.length} 项` : `其他 ${hiddenCount} 项`}
          </button>}
          <div className="min-w-0 flex-1 has-[input]:basis-full">
            <QuickAddTask compact date={iso} onCreate={(task) => { onCreateTask(task); setExpanded(true); }} />
          </div>
        </div>
      </div>
    </section>
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
  const [showAll, setShowAll] = useState(false);

  // Get the latest task data from tasks array (real-time update)
  const selectedTask = selectedTaskId ? tasks.find((t) => t.id === selectedTaskId) ?? null : null;

  const selected = parseISODate(selectedDate);
  const weekStart = startOfWeek(selected, true);
  const days = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));

  const rangeLabel = `${weekStart.getFullYear()}年${weekStart.getMonth() + 1}月${weekStart.getDate()}日 - ${addDays(weekStart, 6).getMonth() + 1}月${addDays(weekStart, 6).getDate()}日`;

  const dates = days.map(toISODate);
  const mainlines = Object.fromEntries(dates.map(date => [date, mainlinesOf(date, dayPlans, aspirations)]));
  const overview = buildWeekOverview(tasks, dates, dayPlans,
    Object.fromEntries(dates.map(date => [date, mainlines[date].map(goal => goal.id)])), behaviors);
  const displayedTasks = showAll ? overview.days.flatMap(day => day.all) : overview.important;
  const doneTasks = displayedTasks.filter(task => task.status === "done").length;

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

        <div className="flex flex-wrap items-center justify-between gap-2 px-[18px] pt-4">
          <div role="group" aria-label="周视图范围" className="flex rounded-lg bg-[var(--color-bg-gray-light)] p-1">
            {[false, true].map(all => <button key={String(all)} type="button" aria-pressed={showAll === all} onClick={() => setShowAll(all)}
              className={`min-h-10 rounded-md px-3 text-[13px] font-medium ${showAll === all ? "bg-[var(--color-bg-white)] text-[var(--color-primary)] shadow-sm" : "text-[var(--color-text-secondary)]"}`}>
              {all ? "全部任务" : "本周重点"}
            </button>)}
          </div>
          <span className="text-[12px] text-[var(--color-text-secondary)]">{showAll ? "全部" : "重点"} {displayedTasks.length} 项 · 已完成 {doneTasks}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-[18px] pb-3 pt-2 text-[11px] text-[var(--color-text-secondary)]">
          <span className="inline-flex items-center gap-1"><Star className="h-3 w-3 fill-current text-[var(--color-focus)]" />当天关键任务</span>
          <span className="inline-flex items-center gap-1"><Flag className="h-3 w-3 text-[var(--color-danger)]" />高优先级</span>
          {!showAll && <span>以及当天主线的非例行任务</span>}
        </div>
        <details key={`planner-${dates[0]}`} className="mx-[18px] mb-3 rounded-lg border border-[var(--color-border)]">
          <summary className="cursor-pointer px-3 py-3 text-[12px] text-[var(--color-text-secondary)]">调整本周主线</summary>
          <MainlinePlanner
          days={days}
          today={today}
          aspirations={aspirations}
          dayPlans={dayPlans}
          onToggle={onToggleMainline}
          />
        </details>

        {/* Week Days List */}
        <div className={`flex flex-1 flex-col border-t border-[var(--color-border)] md:grid md:grid-cols-2 md:items-start md:gap-3 md:border-t-0 md:bg-[var(--color-bg-gray-lighter)] md:p-[18px] ${showAll ? "" : "lg:grid-cols-3"}`}>
          {days.map((d) => {
            const iso = toISODate(d);
            const day = overview.days.find(day => day.date === iso)!;
            return (
              <DayRow
                key={`${iso}-${showAll}`}
                date={d}
                tasks={day.all}
                importantTasks={day.important}
                focusTaskId={dayPlans[iso]?.mustDoTaskId}
                showAll={showAll}
                today={today}
                mainlineTitles={mainlines[iso].map(goal => goal.title)}
                entries={entries}
                goalResults={goalResults}
                behaviors={behaviors}
                habits={habits}
                mainlineIds={mainlines[iso].map(goal => goal.id)}
                onTaskClick={handleTaskClick}
                onCreateTask={onCreateTask}
                onCycleTaskStatus={onCycleTaskStatus}
              />
            );
          })}
        </div>

        {!showAll && overview.routines.length > 0 && <details key={`routines-${dates[0]}`} className="mx-[18px] my-4 rounded-xl border border-[var(--color-border)]">
          <summary className="cursor-pointer px-3 py-3 text-[13px] font-medium text-[var(--color-text-secondary)]">
            例行与重复安排 · {overview.routines.length} 类 / {overview.routines.reduce((sum, group) => sum + group.tasks.length, 0)} 项
          </summary>
          <p className="px-3 pb-2 text-[11px] text-[var(--color-text-tertiary)]">同一来源汇总，点开查看每天的安排。关键任务和高优事项仍在上方展示。</p>
          {overview.routines.map(group => <details key={group.key} className="mx-3 border-t border-[var(--color-border)]">
            <summary className="cursor-pointer py-3 text-[12px]">
              <span className="inline-flex max-w-full items-center gap-1.5 align-middle"><Repeat2 className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-tertiary)]" /><span className="truncate" data-full-text={group.title}>{group.title}</span></span>
              <span className="mt-1 block pl-5 text-[11px] text-[var(--color-text-secondary)]">
                {[...new Set(group.tasks.map(task => CN_WEEKDAY[parseISODate(task.date).getDay()]))].join("、")} · 已完成 {group.tasks.filter(task => task.status === "done").length}/{group.tasks.length}
              </span>
            </summary>
            <div className="flex flex-col gap-2 pb-3">{group.tasks.map(task => <div key={task.id}>
              <p className="px-2 pb-1 text-[11px] text-[var(--color-text-tertiary)]">{task.date.slice(5).replace("-", "/")} · {CN_WEEKDAY[parseISODate(task.date).getDay()]}</p>
              <WeekTaskRow task={task} entries={entries} isMainline={Boolean(task.aspirationId && mainlines[task.date].some(goal => goal.id === task.aspirationId))}
                onClick={() => handleTaskClick(task)} onCycleStatus={() => onCycleTaskStatus(task.id)} />
            </div>)}</div>
          </details>)}
        </details>}
        <details className="mx-[18px] mb-4 rounded-lg border border-[var(--color-border)]">
          <summary className="cursor-pointer px-3 py-3 text-[12px] text-[var(--color-text-secondary)]">批量添加任务</summary>
          <div className="px-3 pb-3"><QuickAddTask date={selectedDate} showDate onCreate={(task) => { onCreateTask(task); setShowAll(true); }} /></div>
        </details>

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
