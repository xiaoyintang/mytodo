"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import TodoDayView from "@/components/TodoDayView";
import TodoWeekView from "@/components/TodoWeekView";
import TimeLogView from "@/components/TimeLogView";
import HabitLabView from "@/components/HabitLabView";
import GoalsView from "@/components/GoalsView";
import AddTaskModal from "@/components/AddTaskModal";
import SyncModal from "@/components/SyncModal";
import FastTooltip from "@/components/FastTooltip";
import type {
  Aspiration,
  AspirationKind,
  BehaviorCard,
  BehaviorStep,
  BehaviorType,
  DayPlan,
  GoalResult,
  Habit,
  HabitLog,
  EntryCategory,
  ISODate,
  SubTask,
  Task,
  TimeEntry,
  ViewMode,
  TaskStatus,
} from "@/components/todo/types";
import { toISODate, parseISODate, addDays, startOfWeek, useToday } from "@/components/todo/date";
import { useLocalStorageState } from "@/components/todo/storage";
import { useCloudSync } from "@/components/todo/sync";
import { nextGoalColor } from "@/components/todo/goal";
import type {
  AIBehaviorImportApply,
  AIResultImportApply,
} from "@/components/todo/aiBridge";
import { useTimer } from "@/components/todo/useTimer";
import { Cloud, CloudOff, RefreshCw } from "lucide-react";

const STORAGE_KEY = "mytodo.tasks.v1";
const ENTRIES_KEY = "mytodo.entries.v1";
// 习惯实验室（一期只存本地，暂不进云同步）
const ASPIRATIONS_KEY = "mytodo.aspirations.v1";
const GOAL_RESULTS_KEY = "mytodo.goal-results.v1";
const BEHAVIORS_KEY = "mytodo.behaviors.v1";
const HABITS_KEY = "mytodo.habits.v1";
const HABIT_LOGS_KEY = "mytodo.habitlogs.v1";
const DAY_PLANS_KEY = "mytodo.dayplans.v1";
const EMPTY_ENTRIES: TimeEntry[] = [];
const EMPTY_ASPIRATIONS: Aspiration[] = [];
const EMPTY_GOAL_RESULTS: GoalResult[] = [];
const EMPTY_BEHAVIORS: BehaviorCard[] = [];
const EMPTY_HABITS: Habit[] = [];
const EMPTY_HABIT_LOGS: HabitLog[] = [];
const EMPTY_DAY_PLANS: Record<string, DayPlan> = {};
const APP_HISTORY_KEY = "mytodo.route.v1";
const WORKSPACE_TABS: ViewMode[] = ["day", "week", "log", "habit"];

function blocksTabSwipe(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      'input, textarea, select, [contenteditable="true"], [role="slider"], [role="dialog"], [draggable="true"], [data-no-tab-swipe]',
    ),
  );
}

type AppHistoryRoute =
  | { view: "workspace" }
  | { view: "goals"; aspirationId?: string; resultId?: string };

function readAppHistoryRoute(state: unknown): AppHistoryRoute | null {
  if (!state || typeof state !== "object") return null;
  const route = (state as Record<string, unknown>)[APP_HISTORY_KEY];
  if (!route || typeof route !== "object") return null;
  const candidate = route as Record<string, unknown>;
  if (candidate.view === "workspace") return { view: "workspace" };
  if (candidate.view !== "goals") return null;
  return {
    view: "goals",
    aspirationId:
      typeof candidate.aspirationId === "string" ? candidate.aspirationId : undefined,
    resultId: typeof candidate.resultId === "string" ? candidate.resultId : undefined,
  };
}

function historyStateWith(route: AppHistoryRoute) {
  const current = window.history.state;
  return {
    ...(current && typeof current === "object" ? current : {}),
    [APP_HISTORY_KEY]: route,
  };
}

function seedTasks(today: ISODate): Task[] {
  // Generate dates for the current week
  const todayDate = new Date(today);
  const dayOfWeek = todayDate.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const getDateOffset = (offset: number): ISODate => {
    const d = new Date(today);
    d.setDate(d.getDate() + offset);
    return toISODate(d);
  };

  const monday = getDateOffset(mondayOffset);
  const tuesday = getDateOffset(mondayOffset + 1);
  const wednesday = getDateOffset(mondayOffset + 2);
  const thursday = getDateOffset(mondayOffset + 3);
  const friday = getDateOffset(mondayOffset + 4);

  return [
    // Today's tasks
    { id: "t-1", title: "完成周报", date: today, startTime: "09:00", endTime: "10:30", status: "done" },
    { id: "t-2", title: "团队晨会 - 项目进度同步", date: today, startTime: "10:30", endTime: "11:30", status: "in_progress" },
    { id: "t-3", title: "客户需求文档整理", date: today, startTime: "11:30", endTime: "12:00", status: "todo", priority: "high" },
    { id: "t-4", title: "产品设计评审会议", date: today, startTime: "14:00", endTime: "15:30", status: "todo" },
    { id: "t-5", title: "代码审查与合并 PR", date: today, startTime: "16:00", endTime: "17:00", status: "todo" },
    { id: "t-6", title: "阅读技术文章 - React 19 新特性", date: today, startTime: "20:00", endTime: "21:00", status: "todo" },
    // Monday
    { id: "t-7", title: "周报整理", date: monday, startTime: "09:00", endTime: "10:00", status: "done" },
    { id: "t-8", title: "项目规划", date: monday, startTime: "10:00", endTime: "11:30", status: "done" },
    { id: "t-9", title: "代码评审", date: monday, startTime: "14:00", endTime: "15:00", status: "done" },
    { id: "t-10", title: "文档更新", date: monday, startTime: "16:00", endTime: "17:00", status: "done" },
    // Tuesday
    { id: "t-11", title: "需求分析", date: tuesday, startTime: "09:00", endTime: "10:30", status: "done" },
    { id: "t-12", title: "界面设计", date: tuesday, startTime: "11:00", endTime: "12:00", status: "done" },
    { id: "t-13", title: "API开发", date: tuesday, startTime: "14:00", endTime: "16:00", status: "done", priority: "high" },
    // Wednesday
    { id: "t-14", title: "数据库优化", date: wednesday, startTime: "09:00", endTime: "11:00", status: "done" },
    { id: "t-15", title: "单元测试", date: wednesday, startTime: "14:00", endTime: "15:30", status: "done" },
    { id: "t-16", title: "部署准备", date: wednesday, startTime: "16:00", endTime: "17:00", status: "done" },
    // Thursday
    { id: "t-17", title: "客户会议", date: thursday, startTime: "10:00", endTime: "11:00", status: "done" },
    { id: "t-18", title: "原型验证", date: thursday, startTime: "14:00", endTime: "15:30", status: "done" },
    // Friday
    { id: "t-19", title: "周五复盘", date: friday, startTime: "09:00", endTime: "10:00", status: "done" },
    { id: "t-20", title: "下周计划", date: friday, startTime: "15:00", endTime: "16:00", status: "done" },
  ];
}

/** 把焦点地图里的固定流程模板，实例化成这一次任务自己的可勾选步骤。 */
function instantiateBehaviorSteps(card?: BehaviorCard): SubTask[] | undefined {
  if (!card?.steps?.length) return undefined;
  const stamp = Date.now();
  return card.steps.map((step, index) => ({
    id: `st-${stamp}-${index}-${Math.random().toString(36).slice(2, 6)}`,
    title: step.title,
    done: false,
  }));
}

function importBehaviorSteps(
  titles: string[] | undefined,
  prefix: string,
): BehaviorStep[] | undefined {
  if (!titles?.length) return undefined;
  return titles.map((title, index) => ({
    id: `bs-${prefix}-${index}-${Math.random().toString(36).slice(2, 6)}`,
    title: title.trim(),
  }));
}

// Status cycle: todo → in_progress → done → todo
const STATUS_CYCLE: Record<TaskStatus, TaskStatus> = {
  todo: "in_progress",
  in_progress: "done",
  done: "todo",
};

export default function TodoApp() {
  // 活的"今天"：跨零点会自己跳。写死成 useMemo(..., []) 踩过坑，见 useToday 注释
  const todayIso = useToday();
  const { value: tasks, setValue: setTasks, hydrated } = useLocalStorageState<Task[]>(
    STORAGE_KEY,
    seedTasks(todayIso),
  );

  const { value: entries, setValue: setEntries, hydrated: entriesHydrated } = useLocalStorageState<TimeEntry[]>(
    ENTRIES_KEY,
    EMPTY_ENTRIES,
  );

  const { value: aspirations, setValue: setAspirations, hydrated: aspHydrated } =
    useLocalStorageState<Aspiration[]>(ASPIRATIONS_KEY, EMPTY_ASPIRATIONS);
  const { value: goalResults, setValue: setGoalResults, hydrated: resultsHydrated } =
    useLocalStorageState<GoalResult[]>(GOAL_RESULTS_KEY, EMPTY_GOAL_RESULTS);
  const { value: behaviorCards, setValue: setBehaviorCards, hydrated: behHydrated } =
    useLocalStorageState<BehaviorCard[]>(BEHAVIORS_KEY, EMPTY_BEHAVIORS);

  const { value: habits, setValue: setHabits, hydrated: habitsHydrated } =
    useLocalStorageState<Habit[]>(HABITS_KEY, EMPTY_HABITS);
  const { value: habitLogs, setValue: setHabitLogs, hydrated: logsHydrated } =
    useLocalStorageState<HabitLog[]>(HABIT_LOGS_KEY, EMPTY_HABIT_LOGS);

  // 每天的安排（主线/必做）。按日期做 key，不建 MainLine 实体
  const { value: dayPlans, setValue: setDayPlans, hydrated: plansHydrated } =
    useLocalStorageState<Record<string, DayPlan>>(DAY_PLANS_KEY, EMPTY_DAY_PLANS);

  const [viewMode, setViewMode] = useState<ViewMode>("day");
  const [tabDirection, setTabDirection] = useState<"forward" | "backward">("forward");
  const tabSwipeRef = useRef<{
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    blocked: boolean;
  } | null>(null);
  const [goalsOpen, setGoalsOpen] = useState(false); // 从常驻条进的目标管理页
  const [goalEntryId, setGoalEntryId] = useState<string | null>(null);
  const [goalEntryResultId, setGoalEntryResultId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<ISODate>(todayIso);

  // 把目标页写进浏览器自己的历史：Mac 触控板双指返回、浏览器返回键、
  // 手机边缘返回都会先退 App 内部层级，不会从焦点地图直接离开网站。
  useEffect(() => {
    function applyRoute(route: AppHistoryRoute | null) {
      if (route?.view === "goals") {
        setGoalEntryId(route.aspirationId ?? null);
        setGoalEntryResultId(route.resultId ?? null);
        setGoalsOpen(true);
        return;
      }
      setGoalsOpen(false);
      setGoalEntryId(null);
      setGoalEntryResultId(null);
    }

    const initial = readAppHistoryRoute(window.history.state);
    if (initial) applyRoute(initial);
    else {
      window.history.replaceState(
        historyStateWith({ view: "workspace" }),
        "",
        window.location.href,
      );
    }

    function handlePopState(event: PopStateEvent) {
      applyRoute(readAppHistoryRoute(event.state));
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // 跨零点时，**只有当你正停在"昨天的今天"上**才跟着跳到新的今天。
  // 你自己翻到别的日期看，就别动——那是你主动选的
  const prevTodayRef = useRef(todayIso);
  useEffect(() => {
    if (prevTodayRef.current === todayIso) return;
    setSelectedDate((cur) => (cur === prevTodayRef.current ? todayIso : cur));
    prevTodayRef.current = todayIso;
  }, [todayIso]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSyncOpen, setIsSyncOpen] = useState(false);
  // 时间记录撤回栈：每次用户改动记录前先存一份快照，最多留 30 步
  const [entriesHistory, setEntriesHistory] = useState<TimeEntry[][]>([]);
  // 习惯实验室的撤回栈（愿望 + 行为一起快照）
  const [labHistory, setLabHistory] = useState<
    Array<{
      aspirations: Aspiration[];
      goalResults: GoalResult[];
      behaviors: BehaviorCard[];
      restoreTasks?: Task[];
      restoreHabits?: Habit[];
    }>
  >([]);

  const safeTasks = hydrated ? tasks : seedTasks(todayIso);
  const safeEntries = entriesHydrated ? entries : EMPTY_ENTRIES;
  const safeAspirations = aspHydrated ? aspirations : EMPTY_ASPIRATIONS;
  const safeGoalResults = resultsHydrated ? goalResults : EMPTY_GOAL_RESULTS;
  const safeBehaviors = behHydrated ? behaviorCards : EMPTY_BEHAVIORS;
  const safeHabits = habitsHydrated ? habits : EMPTY_HABITS;
  const safeHabitLogs = logsHydrated ? habitLogs : EMPTY_HABIT_LOGS;
  const safeDayPlans = plansHydrated ? dayPlans : EMPTY_DAY_PLANS;

  // 多设备同步码
  // 计时器提到这一层，才能进云同步（手机上开始，电脑上看得到还在跑）
  const timer = useTimer((entry) => addEntries([entry]));

  const labHydrated =
    aspHydrated && resultsHydrated && behHydrated && habitsHydrated && logsHydrated && plansHydrated;
  const lab = useMemo(
    () => ({ aspirations, goalResults, behaviors: behaviorCards, habits, habitLogs, dayPlans }),
    [aspirations, goalResults, behaviorCards, habits, habitLogs, dayPlans],
  );

  const sync = useCloudSync({
    // 五张新表也要等 hydrate 完再同步，否则会拿初始空数组去覆盖云端
    hydrated: hydrated && entriesHydrated && labHydrated,
    tasks,
    entries,
    lab,
    timer: timer.state,
    setTasks,
    setEntries,
    setLab: (patch) => {
      if (patch.aspirations) setAspirations(patch.aspirations);
      if (patch.goalResults) setGoalResults(patch.goalResults);
      if (patch.behaviors) setBehaviorCards(patch.behaviors);
      if (patch.habits) setHabits(patch.habits);
      if (patch.habitLogs) setHabitLogs(patch.habitLogs);
      if (patch.dayPlans) setDayPlans(patch.dayPlans);
    },
    adoptTimer: timer.adopt,
  });

  // “习惯排到今天”生成的 Todo 是那次行为的执行实例。
  // 无论通过状态圆点、进度滑块还是最后一个子步骤完成，都在这里统一校准习惯记录，
  // 避免每条完成路径各写一遍并产生重复计数。
  useEffect(() => {
    if (!hydrated || !logsHydrated) return;
    const linkedTasks = tasks.filter((task) => task.sourceHabitId);
    if (linkedTasks.length === 0) return;
    const taskById = new Map(linkedTasks.map((task) => [task.id, task]));

    setHabitLogs((prev) => {
      let changed = false;
      const seenTaskIds = new Set<string>();
      const next: HabitLog[] = [];

      for (const log of prev) {
        if (!log.taskId) {
          next.push(log);
          continue;
        }
        const task = taskById.get(log.taskId);
        // 任务已被删除时，保留历史事实；只有重新打开现存任务才撤掉联动记录。
        if (!task) {
          next.push(log);
          continue;
        }
        if (task.status !== "done" || seenTaskIds.has(task.id)) {
          changed = true;
          continue;
        }
        seenTaskIds.add(task.id);
        if (log.habitId !== task.sourceHabitId || log.date !== task.date) {
          next.push({ ...log, habitId: task.sourceHabitId!, date: task.date });
          changed = true;
        } else {
          next.push(log);
        }
      }

      const now = new Date();
      const at = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      for (const task of linkedTasks) {
        if (task.status !== "done" || seenTaskIds.has(task.id)) continue;
        next.push({
          id: `hl-task-${task.id}`,
          habitId: task.sourceHabitId!,
          taskId: task.id,
          date: task.date,
          at,
        });
        seenTaskIds.add(task.id);
        changed = true;
      }

      return changed ? next : prev;
    });
  }, [hydrated, logsHydrated, setHabitLogs, tasks]);

  // Toggle task status: todo → in_progress → done → todo
  // 非时长目标任务：状态与手动进度联动（完成=100% 待办=0% 进行中保持原值）
  function cycleTaskStatus(taskId: string) {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== taskId) return t;
        const next = STATUS_CYCLE[t.status];
        if (t.targetMinutes) return { ...t, status: next };
        let progress = t.progress;
        if (next === "done") progress = 100;
        else if (next === "todo") progress = 0;
        return { ...t, status: next, progress };
      }),
    );
  }

  // Create new task
  /**
   * 建任务。**不自动归属目标**——曾经默认落到"那天主线的第一条"，
   * 结果「扔垃圾」这种杂事也被算进主线，既看着莫名其妙，又会污染
   * 以后"本周实际投入"的统计。真属于某个目标的任务有两条正路：
   * 从焦点地图排期（自动继承）、或在任务详情里自己指一下。
   */
  function createTask(taskData: Omit<Task, "id">) {
    const newTask: Task = {
      ...taskData,
      id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    };
    setTasks((prev) => [...prev, newTask]);
  }

  // ===== 子任务 =====
  //
  // 「梳理项目」这四个字没法动手，得先有「打开文档把项目名写在第一行」。
  // 这就是 GTD 的下一步行动——但做成列表比做成一个字段强：能打勾，于是白得进度。
  //
  // **不要求一次拆完**：加一条做一条也行。完整拆解本身就是会把人劝退的负担。

  function patchSubtasks(taskId: string, fn: (list: SubTask[]) => SubTask[]) {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== taskId) return t;
        const subtasks = fn(t.subtasks ?? []);
        // 打勾直接带动任务状态，不让你再手动同步一次：
        // 全勾完 = done，勾了一部分 = 进行中，全清空 = 回待办。
        // 反向也成立（取消勾选会退回进行中），所以点错了不会卡住
        let status = t.status;
        if (subtasks.length > 0) {
          const n = subtasks.filter((x) => x.done).length;
          status = n === subtasks.length ? "done" : n > 0 ? "in_progress" : "todo";
        }
        const progress = t.targetMinutes
          ? t.progress
          : subtasks.length > 0
            ? Math.round((subtasks.filter((x) => x.done).length / subtasks.length) * 100)
            : t.progress;
        return { ...t, subtasks, status, progress };
      }),
    );
  }

  function addSubtasks(taskId: string, titles: string[], beforeSubtaskId?: string) {
    const now = Date.now();
    patchSubtasks(taskId, (list) => {
      const added = titles
        .map((x) => x.trim())
        .filter(Boolean)
        .map((title, i) => ({
          id: `st-${now}-${i}-${Math.random().toString(36).slice(2, 7)}`,
          title,
          done: false,
        }));
      if (added.length === 0) return list;
      const at = beforeSubtaskId ? list.findIndex((x) => x.id === beforeSubtaskId) : -1;
      return at >= 0 ? [...list.slice(0, at), ...added, ...list.slice(at)] : [...list, ...added];
    });
  }

  function toggleSubtask(taskId: string, subId: string) {
    patchSubtasks(taskId, (list) =>
      list.map((x) => (x.id === subId ? { ...x, done: !x.done } : x)),
    );
  }

  function editSubtask(taskId: string, subId: string, title: string) {
    patchSubtasks(taskId, (list) =>
      list.map((x) => (x.id === subId ? { ...x, title } : x)),
    );
  }

  function deleteSubtask(taskId: string, subId: string) {
    patchSubtasks(taskId, (list) => list.filter((x) => x.id !== subId));
  }

  // 拖动只重排未完成步骤；已完成步骤仍留在原数据槽位，展示时单独归档。
  function reorderSubtask(
    taskId: string,
    subId: string,
    targetId: string,
    edge: "before" | "after",
  ) {
    patchSubtasks(taskId, (list) => {
      const open = list.filter((x) => !x.done);
      const moving = open.find((x) => x.id === subId);
      if (!moving || subId === targetId) return list;
      const without = open.filter((x) => x.id !== subId);
      const targetIndex = without.findIndex((x) => x.id === targetId);
      if (targetIndex < 0) return list;
      const insertAt = targetIndex + (edge === "after" ? 1 : 0);
      const reordered = [...without.slice(0, insertAt), moving, ...without.slice(insertAt)];
      let openIndex = 0;
      return list.map((x) => (x.done ? x : reordered[openIndex++]));
    });
  }

  // Delete task
  function deleteTask(taskId: string) {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  }

  // Update task (for editing)
  function updateTask(taskId: string, updates: Partial<Omit<Task, "id">>) {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, ...updates } : t))
    );
  }

  // 改动记录前先存快照，供撤回（本地云同步的替换不走这里，不会污染撤回栈）
  function snapshotEntries() {
    setEntriesHistory((h) => [...h.slice(-29), entries]);
  }

  // 新增时间记录（批量，用于自然语言解析出多笔的场景）
  /**
   * 一笔记录属于哪个目标：**从关联的 task / habit 复制过来（快照）**，没有关联就留空。
   * 就这一条，没有别的推导（规格 §10.1）：
   * - 不做"默认填今日主线"的兜底——那会把杂事算进主线，污染"本周实际投入"
   * - 不在开始计时前弹窗问归属——计时是进入工作状态的扳机，前面加任何一道门都会毁掉它
   * 归属可以事后在台账里点一下改。
   *
   * 用复制不用 join 查：任务删了历史记录不会变孤儿；任务后来改了归属，
   * **已发生的记录不该跟着变**——台账记的是当时的事实。
   */
  function resolveEntryAspiration(e: Omit<TimeEntry, "id">): string | undefined {
    if (e.aspirationId) return e.aspirationId;
    if (e.taskId) return tasks.find((t) => t.id === e.taskId)?.aspirationId;
    const title = e.title.trim();
    return habits.find((h) => !h.archived && h.title.trim() === title)?.aspirationId;
  }

  function addEntries(entryList: Omit<TimeEntry, "id">[]) {
    snapshotEntries();
    const newEntries: TimeEntry[] = entryList.map((e, i) => ({
      ...e,
      aspirationId: resolveEntryAspiration(e),
      id: `e-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
    }));
    setEntries((prev) => [...prev, ...newEntries]);
  }

  // 新增单笔时间记录（用于 TaskBottomSheet 的"记一笔"）
  function addEntry(entryData: Omit<TimeEntry, "id">) {
    addEntries([entryData]);
  }

  // 删除时间记录
  function deleteEntry(entryId: string) {
    snapshotEntries();
    setEntries((prev) => prev.filter((e) => e.id !== entryId));
  }

  // 更新时间记录（台账行内编辑）
  function updateEntry(entryId: string, updates: Partial<Omit<TimeEntry, "id">>) {
    snapshotEntries();
    setEntries((prev) => prev.map((e) => (e.id === entryId ? { ...e, ...updates } : e)));
  }

  // 手动纠正分类：把这组记录标成指定大类，并记为"用户判定"——
  // 以后同名记录一律按这个来，AI 不再覆盖（可撤回）
  function setEntriesCategory(entryIds: string[], category: EntryCategory) {
    snapshotEntries();
    const ids = new Set(entryIds);
    setEntries((prev) =>
      prev.map((e) => (ids.has(e.id) ? { ...e, category, categorySource: "user" as const } : e)),
    );
  }

  // AI 自动分类结果写回（只补还没分类的；不是用户编辑，不进撤回栈）
  function applyEntryCategories(byTitle: Record<string, EntryCategory>) {
    setEntries((prev) => {
      let changed = false;
      const next = prev.map((e) => {
        if (e.category) return e;
        const c = byTitle[e.title.trim()];
        if (!c) return e;
        changed = true;
        return { ...e, category: c, categorySource: "ai" as const };
      });
      return changed ? next : prev;
    });
  }

  // 撤回上一步记录改动（编辑/删除/新增都能退回）
  function undoEntries() {
    if (entriesHistory.length === 0) return;
    const prev = entriesHistory[entriesHistory.length - 1];
    setEntries(prev);
    setEntriesHistory((h) => h.slice(0, -1));
  }

  // ===== 习惯实验室 =====

  // 撤回栈：愿望和行为一起存快照（删愿望会连带删它的行为，得一起退回来）。
  // 注意：拖滑块不进栈（一次拖动会触发几十次 onChange，会把栈冲爆），
  // 但「重排」进栈——所以误点重排能把所有滑块位置退回来。
  function snapshotLab(restoreTasks?: Task[], restoreHabits?: Habit[]) {
    setLabHistory((h) => [
      ...h.slice(-29),
      { aspirations, goalResults, behaviors: behaviorCards, restoreTasks, restoreHabits },
    ]);
  }

  function undoLab() {
    if (labHistory.length === 0) return;
    const prev = labHistory[labHistory.length - 1];
    setAspirations(prev.aspirations);
    setGoalResults(prev.goalResults);
    setBehaviorCards(prev.behaviors);
    // 只恢复这次结构变更碰过的任务/习惯，不整包覆盖——
    // 否则会把用户在其他视图里的无关改动一起回滚。
    if (prev.restoreTasks?.length) {
      setTasks((cur) => {
        const restore = new Map(prev.restoreTasks!.map((task) => [task.id, task]));
        const have = new Set(cur.map((task) => task.id));
        return [
          ...cur.map((task) => restore.get(task.id) ?? task),
          ...prev.restoreTasks!.filter((task) => !have.has(task.id)),
        ];
      });
    }
    if (prev.restoreHabits?.length) {
      setHabits((cur) => {
        const restore = new Map(prev.restoreHabits!.map((habit) => [habit.id, habit]));
        const have = new Set(cur.map((habit) => habit.id));
        return [
          ...cur.map((habit) => restore.get(habit.id) ?? habit),
          ...prev.restoreHabits!.filter((habit) => !have.has(habit.id)),
        ];
      });
    }
    setLabHistory((h) => h.slice(0, -1));
  }

  function createAspiration(title: string, kind: AspirationKind) {
    snapshotLab();
    const a: Aspiration = {
      id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title,
      kind,
      createdAt: Date.now(),
      color: nextGoalColor(aspirations),
    };
    setAspirations((prev) => [...prev, a]);
  }

  /** 给复杂目标增加可选的结果层；简单目标可以完全不用。 */
  function createGoalResult(aspirationId: string, title: string, evidence?: string): string {
    snapshotLab();
    const id = `gr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const result: GoalResult = {
      id,
      aspirationId,
      title: title.trim(),
      evidence: evidence?.trim() || undefined,
      createdAt: Date.now(),
    };
    setGoalResults((prev) => [...prev, result]);
    return id;
  }

  function updateGoalResult(id: string, patch: { title?: string; evidence?: string }) {
    snapshotLab();
    setGoalResults((prev) =>
      prev.map((result) =>
        result.id === id
          ? {
              ...result,
              ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
              ...(patch.evidence !== undefined
                ? { evidence: patch.evidence.trim() || undefined }
                : {}),
            }
          : result,
      ),
    );
  }

  /** 删除结果只解除分组；行为是用户已经想过的，不跟着丢。 */
  function deleteGoalResult(id: string) {
    snapshotLab();
    setGoalResults((prev) => prev.filter((result) => result.id !== id));
    setBehaviorCards((prev) =>
      prev.map((behavior) =>
        behavior.resultId === id ? { ...behavior, resultId: undefined } : behavior,
      ),
    );
    setTasks((prev) =>
      prev.map((task) => (task.resultId === id ? { ...task, resultId: undefined } : task)),
    );
  }

  function assignBehaviorResult(behaviorId: string, resultId?: string) {
    snapshotLab();
    setBehaviorCards((prev) =>
      prev.map((behavior) =>
        behavior.id === behaviorId ? { ...behavior, resultId: resultId || undefined } : behavior,
      ),
    );
  }

  /** AI 只提议结构；用户确认后才一次性建结果并给现有行为归组。 */
  function applyGoalResultStructure(
    aspirationId: string,
    groups: Array<{ title: string; evidence?: string; behaviorIds: string[] }>,
  ): string[] {
    snapshotLab();
    const now = Date.now();
    const created = groups
      .map((group, index) => ({
        id: `gr-${now}-${index}-${Math.random().toString(36).slice(2, 7)}`,
        aspirationId,
        title: group.title.trim(),
        evidence: group.evidence?.trim() || undefined,
        createdAt: now + index,
        behaviorIds: group.behaviorIds,
      }))
      .filter((group) => group.title);
    const validBehaviorIds = new Set(
      behaviorCards.filter((behavior) => behavior.aspirationId === aspirationId).map((behavior) => behavior.id),
    );
    const resultByBehavior = new Map<string, string>();
    for (const group of created) {
      for (const behaviorId of group.behaviorIds) {
        if (validBehaviorIds.has(behaviorId) && !resultByBehavior.has(behaviorId)) {
          resultByBehavior.set(behaviorId, group.id);
        }
      }
    }
    setGoalResults((prev) => [
      ...prev,
      ...created.map((group) => ({
        id: group.id,
        aspirationId: group.aspirationId,
        title: group.title,
        evidence: group.evidence,
        createdAt: group.createdAt,
      })),
    ]);
    setBehaviorCards((prev) =>
      prev.map((behavior) => {
        const resultId = resultByBehavior.get(behavior.id);
        return resultId ? { ...behavior, resultId } : behavior;
      }),
    );
    return created.map((group) => group.id);
  }

  // 删愿望连它下面的行为一起删，不留孤儿卡片
  function deleteAspiration(id: string) {
    const taskIds = new Set(
      behaviorCards.filter((b) => b.aspirationId === id && b.taskId).map((b) => b.taskId!),
    );
    const gone = tasks.filter((t) => taskIds.has(t.id) && t.status !== "done");
    snapshotLab(gone);
    if (gone.length > 0) {
      const ids = new Set(gone.map((t) => t.id));
      setTasks((prev) => prev.filter((t) => !ids.has(t.id)));
    }
    setAspirations((prev) => prev.filter((a) => a.id !== id));
    setGoalResults((prev) => prev.filter((result) => result.aspirationId !== id));
    setBehaviorCards((prev) => prev.filter((b) => b.aspirationId !== id));
  }

  // 收集口回车即存：不带 type → 未判定；魔法棒收进来的自带 type
  function addBehaviors(
    aspirationId: string,
    items: Array<{ text: string; type?: BehaviorType; resultId?: string }>,
    resultId?: string,
  ) {
    snapshotLab();
    const now = Date.now();
    const cards: BehaviorCard[] = items.map((it, i) => ({
      id: `b-${now}-${i}-${Math.random().toString(36).slice(2, 7)}`,
      aspirationId,
      resultId: it.resultId ?? resultId,
      text: it.text,
      type: it.type ?? "unsorted",
      typeSource: it.type ? "ai" : undefined,
      createdAt: now,
    }));
    setBehaviorCards((prev) => [...prev, ...cards]);
  }

  /**
   * 外部聊天的关键结果与行为要一次落库：先为结果确定真实 id，再解析行为归属。
   * 这样行为可以直接引用同一批新建/改写后的结果，且整批只生成一个撤回快照。
   */
  function applyAIHandoffImport(
    aspirationId: string,
    resultChanges: AIResultImportApply[],
    behaviorChanges: AIBehaviorImportApply[],
  ) {
    if (resultChanges.length === 0 && behaviorChanges.length === 0) return;
    const replacingBehaviorIds = new Set(
      behaviorChanges
        .filter((change) => change.operation === "replace" && change.replaceId)
        .map((change) => change.replaceId as string),
    );
    const touchedTaskIds = new Set(
      behaviorCards
        .filter((card) => replacingBehaviorIds.has(card.id) && card.taskId)
        .map((card) => card.taskId as string),
    );
    snapshotLab(
      tasks.filter((task) => touchedTaskIds.has(task.id) && task.status !== "done"),
      habits.filter((habit) => habit.behaviorId && replacingBehaviorIds.has(habit.behaviorId)),
    );

    const existingResultIds = new Set(
      goalResults
        .filter((result) => result.aspirationId === aspirationId)
        .map((result) => result.id),
    );
    const resultIdByClient = new Map<string, string>();
    const resultUpdates = new Map<string, { title: string; evidence?: string }>();
    const now = Date.now();
    const createdResults: GoalResult[] = [];

    resultChanges.forEach((change, index) => {
      if (change.operation === "replace" && change.replaceId && existingResultIds.has(change.replaceId)) {
        resultIdByClient.set(change.clientId, change.replaceId);
        resultUpdates.set(change.replaceId, {
          title: change.title.trim(),
          evidence: change.evidence?.trim() || undefined,
        });
        return;
      }
      if (change.operation !== "add") return;
      const id = `gr-${now}-${index}-${Math.random().toString(36).slice(2, 7)}`;
      resultIdByClient.set(change.clientId, id);
      createdResults.push({
        id,
        aspirationId,
        title: change.title.trim(),
        evidence: change.evidence?.trim() || undefined,
        createdAt: now + index,
      });
    });

    if (resultUpdates.size > 0 || createdResults.length > 0) {
      setGoalResults((prev) => [
        ...prev.map((result) => {
          const update = resultUpdates.get(result.id);
          return update ? { ...result, ...update } : result;
        }),
        ...createdResults,
      ]);
    }

    const sourceCards = behaviorCards.filter((card) => card.aspirationId === aspirationId);
    const validCardIds = new Set(sourceCards.map((card) => card.id));
    const resolveResultId = (change: AIBehaviorImportApply) => {
      if (change.resultImportClientId) {
        return resultIdByClient.get(change.resultImportClientId);
      }
      return change.resultId && existingResultIds.has(change.resultId)
        ? change.resultId
        : undefined;
    };
    const behaviorUpdates = new Map<
      string,
      {
        text: string;
        type: BehaviorType;
        resultId?: string;
        stepsSpecified: boolean;
        steps?: BehaviorStep[];
        resetScores: boolean;
      }
    >();
    const createdCards: BehaviorCard[] = [];

    behaviorChanges.forEach((change, index) => {
      const resultId = resolveResultId(change);
      if (change.operation === "replace" && change.replaceId && validCardIds.has(change.replaceId)) {
        const original = sourceCards.find((card) => card.id === change.replaceId);
        if (!original) return;
        const resetScores =
          original.text.trim() !== change.text.trim() ||
          original.type !== change.type ||
          original.resultId !== resultId;
        behaviorUpdates.set(change.replaceId, {
          text: change.text.trim(),
          type: change.type,
          resultId,
          stepsSpecified: Boolean(change.stepsMode),
          steps:
            change.stepsMode === "replace"
              ? importBehaviorSteps(change.steps, `${now}-${index}`)
              : undefined,
          resetScores,
        });
        return;
      }
      if (change.operation !== "add") return;
      createdCards.push({
        id: `b-${now}-${index}-${Math.random().toString(36).slice(2, 7)}`,
        aspirationId,
        resultId,
        text: change.text.trim(),
        type: change.type,
        typeSource: change.type === "unsorted" ? undefined : "ai",
        createdAt: now + index,
        steps:
          change.stepsMode === "replace"
            ? importBehaviorSteps(change.steps, `${now}-${index}`)
            : undefined,
      });
    });

    behaviorUpdates.forEach((update, id) => renameDerived(id, update.text));
    if (behaviorUpdates.size > 0 || createdCards.length > 0) {
      setBehaviorCards((prev) => [
        ...prev.map((behavior) => {
          const update = behaviorUpdates.get(behavior.id);
          if (!update) return behavior;
          return {
            ...behavior,
            text: update.text,
            type: update.type,
            resultId: update.resultId,
            steps: update.stepsSpecified ? update.steps : behavior.steps,
            typeSource:
              update.type === behavior.type
                ? behavior.typeSource
                : update.type === "unsorted" ? undefined : "ai" as const,
            impact: update.resetScores ? undefined : behavior.impact,
            feasibility: update.resetScores ? undefined : behavior.feasibility,
            reason: update.resetScores ? undefined : behavior.reason,
            blocker: update.resetScores ? undefined : behavior.blocker,
            hasDecision: update.resetScores ? undefined : behavior.hasDecision,
          };
        }),
        ...createdCards,
      ]);
    }
  }

  // 批量判定结果写回；用户手动改判过的不动
  function applyJudgements(
    results: Array<{
      id: string;
      type: BehaviorType;
      reason?: string;
      blocker?: "timing" | "decision" | "endpoint";
    }>,
  ) {
    snapshotLab();
    const byId = new Map(results.map((r) => [r.id, r]));
    setBehaviorCards((prev) =>
      prev.map((b) => {
        const r = byId.get(b.id);
        if (!r || b.typeSource === "user") return b;
        // hasDecision 是老字段，重判后清掉，统一用 blocker
        return {
          ...b,
          type: r.type,
          typeSource: "ai" as const,
          reason: r.reason,
          blocker: r.blocker,
          hasDecision: undefined,
        };
      }),
    );
  }

  /**
   * 行为卡改名 → 从它派生出去的东西一起改名。
   * 习惯是从这条行为毕业的、任务是从这条行为排期出来的，名字不同步就成了两份互相矛盾的记录
   * （行为叫"12点熄灯"，习惯表还写着"10点熄灯"）。
   * 已完成的任务不动——那是历史，改了等于篡改你做过什么。
   */
  function renameDerived(behaviorId: string, text: string) {
    setHabits((prev) => prev.map((h) => (h.behaviorId === behaviorId ? { ...h, title: text } : h)));
    const card = behaviorCards.find((b) => b.id === behaviorId);
    if (card?.taskId) {
      setTasks((prev) =>
        prev.map((t) => (t.id === card.taskId && t.status !== "done" ? { ...t, title: text } : t)),
      );
    }
  }

  // 一次性任务 → 排进日视图。行为卡记下 taskId，别重复排
  function scheduleBehavior(cardId: string, title: string, date: ISODate) {
    const taskId = `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    // 继承那条行为所属的目标——这样它才会被"今天主线"认出来
    const card = behaviorCards.find((b) => b.id === cardId);
    const aspirationId = card?.aspirationId;
    setTasks((prev) => [
      ...prev,
      {
        id: taskId,
        title,
        date,
        status: "todo" as TaskStatus,
        aspirationId,
        resultId: card?.resultId,
        subtasks: instantiateBehaviorSteps(card),
      },
    ]);
    snapshotLab();
    setBehaviorCards((prev) => prev.map((b) => (b.id === cardId ? { ...b, taskId } : b)));
  }

  // 撤回排期：连带把日视图里那个任务删掉
  function unscheduleBehavior(cardId: string) {
    const card = behaviorCards.find((b) => b.id === cardId);
    const gone = card?.taskId ? tasks.filter((t) => t.id === card.taskId) : [];
    snapshotLab(gone);
    if (gone.length > 0) setTasks((prev) => prev.filter((t) => t.id !== card!.taskId));
    setBehaviorCards((prev) => prev.map((b) => (b.id === cardId ? { ...b, taskId: undefined } : b)));
  }

  /**
   * 就地改文字。**类型交给 AI 重判**（退回 unsorted，自动判定会立刻接手），
   * 但**两轴分数保留**——改错字不该让你打过的分白费；真改大了，那一行会提示"分数可能不作数"。
   * 你手动改判过的类型不动：那是你的裁定，AI 不许覆盖。
   */
  function editBehaviorText(id: string, text: string) {
    snapshotLab();
    renameDerived(id, text);
    setBehaviorCards((prev) =>
      prev.map((b) => {
        if (b.id !== id || b.text === text) return b;
        if (b.typeSource === "user") return { ...b, text };
        return { ...b, text, type: "unsorted", typeSource: undefined, reason: undefined, blocker: undefined, hasDecision: undefined };
      }),
    );
  }

  // 「改小」专用：换掉文字但保留类型（它还是同一种可重复行为，不该退回未判定），
  // 清掉可行性——旧分数是给"难版本"打的，改小之后必须重拖一次
  function shrinkBehavior(id: string, text: string) {
    snapshotLab();
    renameDerived(id, text);
    setBehaviorCards((prev) =>
      prev.map((b) =>
        b.id === id
          ? { ...b, text, feasibility: undefined, reason: undefined, blocker: undefined, hasDecision: undefined }
          : b,
      ),
    );
  }

  // 手动改判：以后 AI 不再覆盖这条
  function setBehaviorType(id: string, type: BehaviorType) {
    snapshotLab();
    setBehaviorCards((prev) =>
      prev.map((b) => (b.id === id ? { ...b, type, typeSource: "user" } : b)),
    );
  }

  // ===== 微习惯 =====

  // 黄金行为毕业成微习惯。同一条行为不重复加
  function addHabit(input: Omit<Habit, "id" | "createdAt">) {
    if (input.behaviorId) {
      if (habits.some((h) => h.behaviorId === input.behaviorId && !h.archived)) return;
      // 以前移出去过（打卡记录还留着）→ 直接恢复，别建重复的
      const archived = habits.find((h) => h.behaviorId === input.behaviorId && h.archived);
      if (archived) {
        setHabits((prev) =>
          prev.map((h) => (h.id === archived.id ? { ...h, archived: undefined } : h)),
        );
        return;
      }
    }
    const h: Habit = {
      ...input,
      id: `h-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: Date.now(),
    };
    setHabits((prev) => [...prev, h]);
  }

  /** 把一条习惯实例化到选中的日期；同一习惯同一天只保留一个执行实例。 */
  function scheduleHabitDates(habitId: string, dates: ISODate[]) {
    const habit = habits.find((item) => item.id === habitId && !item.archived);
    if (!habit) return;
    const existingDates = new Set(
      tasks.filter((task) => task.sourceHabitId === habitId).map((task) => task.date),
    );
    const targetDates = Array.from(new Set(dates)).filter(
      (date) => date >= todayIso && !existingDates.has(date),
    );
    if (targetDates.length === 0) return;
    const sourceBehavior = habit.behaviorId
      ? behaviorCards.find((behavior) => behavior.id === habit.behaviorId)
      : undefined;
    targetDates.forEach((date) =>
      createTask({
        title: habit.title,
        date,
        status: "todo",
        aspirationId: habit.aspirationId,
        resultId: sourceBehavior?.resultId,
        sourceHabitId: habit.id,
        subtasks: instantiateBehaviorSteps(sourceBehavior),
      }),
    );
  }

  /** 这个习惯有没有打卡记录（决定移出去时是归档还是真删） */
  function habitHasLogs(habitId: string): boolean {
    return habitLogs.some((l) => l.habitId === habitId);
  }

  /** 按行为卡撤回：从焦点地图上点「撤回」用 */
  function removeHabitByBehavior(behaviorId: string) {
    const h = habits.find((x) => x.behaviorId === behaviorId && !x.archived);
    if (h) deleteHabit(h.id);
  }

  function setHabitAnchor(habitId: string, anchor: string) {
    setHabits((prev) =>
      prev.map((h) => (h.id === habitId ? { ...h, anchor: anchor || undefined } : h)),
    );
  }

  // 时长型 / 发生型猜错了一键改
  function toggleHabitMeasure(habitId: string) {
    setHabits((prev) =>
      prev.map((h) =>
        h.id === habitId ? { ...h, measure: h.measure === "duration" ? "count" : "duration" } : h,
      ),
    );
  }

  // 移出习惯表：打过卡的归档（记录留着，加回来还能接上），没打过卡的直接删干净。
  // 无论哪种，行为卡都还在焦点地图上，随时能再加回来。
  function deleteHabit(habitId: string) {
    if (habitLogs.some((l) => l.habitId === habitId)) {
      setHabits((prev) => prev.map((h) => (h.id === habitId ? { ...h, archived: true } : h)));
      return;
    }
    setHabits((prev) => prev.filter((h) => h.id !== habitId));
  }

  // 打卡：一天可以点很多次，每次一行（锚点一天可能触发好几次）
  function logHabit(habitId: string): string {
    const d = new Date();
    const log: HabitLog = {
      id: `hl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      habitId,
      date: toISODate(d) as ISODate,
      at: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
    };
    setHabitLogs((prev) => [...prev, log]);
    return log.id;
  }

  // 正向影响跟着这次真实发生的行为走，不另外建一张“感受表”。
  function setHabitLogImpact(logId: string, impact: string) {
    setHabitLogs((prev) =>
      prev.map((log) => (log.id === logId ? { ...log, impact: impact.trim() || undefined } : log)),
    );
  }

  // 点错了撤掉今天最后一次“手动打卡”。由 Todo 完成产生的记录必须回 Todo 撤销，
  // 否则任务仍是完成、习惯却被删掉，两边会互相矛盾。
  function undoHabitLog(habitId: string) {
    const todayIso2 = toISODate(new Date());
    setHabitLogs((prev) => {
      let lastIdx = -1;
      prev.forEach((l, i) => {
        if (l.habitId === habitId && l.date === todayIso2 && !l.taskId) lastIdx = i;
      });
      if (lastIdx < 0) return prev;
      return prev.filter((_, i) => i !== lastIdx);
    });
  }

  // 焦点地图两轴（0-100，现在只落 25/75 两档）
  function setBehaviorAxis(id: string, patch: { impact?: number; feasibility?: number }) {
    setBehaviorCards((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }

  /**
   * 固定流程属于行为模板：焦点地图里只维护这一份；排进 Todo 时才复制成执行实例。
   * 因此修改模板不会回头篡改已经排出去的任务，但习惯下次排 Todo 会读到最新版。
   */
  function setBehaviorSteps(id: string, steps: BehaviorStep[]) {
    snapshotLab();
    setBehaviorCards((prev) =>
      prev.map((behavior) =>
        behavior.id === id ? { ...behavior, steps: steps.length > 0 ? steps : undefined } : behavior,
      ),
    );
  }

  /**
   * AI 判成“成果”的条目，也可能其实是用户准备亲自交付的一次性项目。
   * 写下第一批步骤时，把它原地转成任务包；步骤继续挂在父卡下面，
   * 不散成同一关键结果下的一堆并列行为。
   */
  function convertBehaviorToTaskPackage(id: string, steps: BehaviorStep[]) {
    if (steps.length === 0) return;
    snapshotLab();
    setBehaviorCards((prev) =>
      prev.map((behavior) =>
        behavior.id === id
          ? {
              ...behavior,
              type: "onetime",
              typeSource: "user",
              steps,
              reason: undefined,
              blocker: undefined,
              hasDecision: undefined,
              impact: undefined,
              feasibility: undefined,
            }
          : behavior,
      ),
    );
  }

  // 重排只清当前结果路径里正在看的行为，不能误伤同一目标下的其他焦点地图。
  function resetBehaviorAxes(behaviorIds: string[]) {
    snapshotLab();
    const ids = new Set(behaviorIds);
    setBehaviorCards((prev) =>
      prev.map((b) =>
        ids.has(b.id) ? { ...b, impact: undefined, feasibility: undefined } : b,
      ),
    );
  }

  // 删行为卡 = 这条不做了，所以它排出去的那个任务也该跟着走。
  // 已完成的任务留着——那是历史，不该被抹掉。
  function deleteBehavior(id: string) {
    const card = behaviorCards.find((b) => b.id === id);
    const gone = card?.taskId
      ? tasks.filter((t) => t.id === card.taskId && t.status !== "done")
      : [];
    snapshotLab(gone);
    if (gone.length > 0) {
      const ids = new Set(gone.map((t) => t.id));
      setTasks((prev) => prev.filter((t) => !ids.has(t.id)));
    }
    setBehaviorCards((prev) => prev.filter((b) => b.id !== id));
  }

  function setWeeklyLimit(aspirationId: string, limit: number | null) {
    setAspirations((prev) =>
      prev.map((a) => (a.id === aspirationId ? { ...a, weeklyLimit: limit } : a)),
    );
  }

  /** 把某个目标加进/移出某天的主线 */
  function toggleMainline(date: ISODate, aspirationId: string) {
    setDayPlans((prev) => {
      const cur = prev[date] ?? { date, primaryAspirationIds: [] };
      const has = cur.primaryAspirationIds.includes(aspirationId);
      const ids = has
        ? cur.primaryAspirationIds.filter((id) => id !== aspirationId)
        : [...cur.primaryAspirationIds, aspirationId];
      return { ...prev, [date]: { ...cur, primaryAspirationIds: ids } };
    });
  }

  // Navigate to previous week (move selectedDate back 7 days)
  function goToPrevWeek() {
    const current = parseISODate(selectedDate);
    const newDate = addDays(current, -7);
    setSelectedDate(toISODate(newDate));
  }

  // Navigate to next week (move selectedDate forward 7 days)
  function goToNextWeek() {
    const current = parseISODate(selectedDate);
    const newDate = addDays(current, 7);
    setSelectedDate(toISODate(newDate));
  }

  function pushGoalRoute(aspirationId?: string, resultId?: string) {
    const route: AppHistoryRoute = { view: "goals", aspirationId, resultId };
    window.history.pushState(historyStateWith(route), "", window.location.href);
    setGoalEntryId(aspirationId ?? null);
    setGoalEntryResultId(resultId ?? null);
    setGoalsOpen(true);
  }

  function openGoals() {
    pushGoalRoute();
  }

  /** 有明确归属就直达关键结果；没有就停在这个目标的全局焦点地图。 */
  function openGoal(aspirationId: string, resultId?: string) {
    pushGoalRoute(aspirationId, resultId);
  }

  function selectGoalResult(aspirationId: string, resultId: string | null) {
    const route: AppHistoryRoute = {
      view: "goals",
      aspirationId,
      resultId: resultId ?? undefined,
    };
    window.history.replaceState(historyStateWith(route), "", window.location.href);
    setGoalEntryId(aspirationId);
    setGoalEntryResultId(resultId);
  }

  function backFromGoals() {
    if (readAppHistoryRoute(window.history.state)?.view === "goals") {
      window.history.back();
      return;
    }
    setGoalsOpen(false);
    setGoalEntryId(null);
    setGoalEntryResultId(null);
  }

  function handleWorkspacePointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (
      goalsOpen ||
      isModalOpen ||
      isSyncOpen ||
      window.innerWidth >= 640 ||
      !event.isPrimary ||
      event.button !== 0
    ) {
      tabSwipeRef.current = null;
      return;
    }
    tabSwipeRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      blocked: blocksTabSwipe(event.target),
    };
  }

  function changeViewMode(nextMode: ViewMode) {
    if (nextMode === viewMode) return;
    setTabDirection(
      WORKSPACE_TABS.indexOf(nextMode) > WORKSPACE_TABS.indexOf(viewMode)
        ? "forward"
        : "backward",
    );
    setViewMode(nextMode);
  }

  function handleWorkspacePointerMove(event: ReactPointerEvent<HTMLElement>) {
    const gesture = tabSwipeRef.current;
    if (!gesture || !event.isPrimary) return;
    gesture.lastX = event.clientX;
    gesture.lastY = event.clientY;
  }

  function handleWorkspacePointerUp(event: ReactPointerEvent<HTMLElement>) {
    const gesture = tabSwipeRef.current;
    tabSwipeRef.current = null;
    if (!gesture || gesture.blocked || goalsOpen || window.innerWidth >= 640) return;

    const endX = event.clientX || gesture.lastX;
    const endY = event.clientY || gesture.lastY;
    const deltaX = endX - gesture.startX;
    const deltaY = endY - gesture.startY;
    const horizontal = Math.abs(deltaX);
    const vertical = Math.abs(deltaY);
    // 明确横滑才切页：轻微手抖和正常上下滚动都不响应。
    if (horizontal < 56 || horizontal <= vertical * 1.25) return;

    const current = WORKSPACE_TABS.indexOf(viewMode);
    const next = deltaX < 0 ? current + 1 : current - 1;
    if (next < 0 || next >= WORKSPACE_TABS.length) return;
    changeViewMode(WORKSPACE_TABS[next]);
  }

  return (
    <main
      data-testid="workspace-swipe-surface"
      data-tab-direction={tabDirection}
      onPointerDown={handleWorkspacePointerDown}
      onPointerMove={handleWorkspacePointerMove}
      onPointerUp={handleWorkspacePointerUp}
      onPointerCancel={() => {
        tabSwipeRef.current = null;
      }}
      className={`flex h-full w-full items-start justify-center overflow-auto bg-white p-0 sm:bg-[#F5F5F5] sm:p-6 ${goalsOpen ? "" : "touch-pan-y"}`}
    >
      <FastTooltip />
      {goalsOpen ? (
        <GoalsView
          initialOpenId={goalEntryId}
          initialOpenResultId={goalEntryResultId}
          aspirations={safeAspirations}
          goalResults={safeGoalResults}
          behaviors={safeBehaviors}
          tasks={safeTasks}
          habits={safeHabits}
          entries={safeEntries}
          // 固定用"今天所在那周"，不跟 selectedDate 走——目标页和日期无关，
          // 翻到上周再点进来却显示"本周"，没人猜得到
          weekDates={Array.from({ length: 7 }).map(
            (_, i) => toISODate(addDays(startOfWeek(parseISODate(todayIso), true), i)) as ISODate,
          )}
          onBack={backFromGoals}
          onOpenAspiration={openGoal}
          onSelectResult={selectGoalResult}
          onCreateAspiration={createAspiration}
          onDeleteAspiration={deleteAspiration}
          onCreateGoalResult={createGoalResult}
          onUpdateGoalResult={updateGoalResult}
          onDeleteGoalResult={deleteGoalResult}
          onAssignBehaviorResult={assignBehaviorResult}
          onApplyGoalResultStructure={applyGoalResultStructure}
          onAddBehaviors={addBehaviors}
          onApplyAIImport={applyAIHandoffImport}
          onApplyJudgements={applyJudgements}
          onSetBehaviorType={setBehaviorType}
          onShrinkBehavior={shrinkBehavior}
          onEditBehaviorText={editBehaviorText}
          onScheduleBehavior={scheduleBehavior}
          onUnscheduleBehavior={unscheduleBehavior}
          onSetBehaviorAxis={setBehaviorAxis}
          onSetBehaviorSteps={setBehaviorSteps}
          onConvertBehaviorToTaskPackage={convertBehaviorToTaskPackage}
          onResetBehaviorAxes={resetBehaviorAxes}
          onSetWeeklyLimit={setWeeklyLimit}
          onDeleteBehavior={deleteBehavior}
          onAddHabit={addHabit}
          onRemoveHabitByBehavior={removeHabitByBehavior}
          onUndo={undoLab}
          canUndo={labHistory.length > 0}
        />
      ) : viewMode === "day" ? (
        <TodoDayView
          viewMode={viewMode}
          onChangeViewMode={changeViewMode}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          tasks={safeTasks}
          entries={safeEntries}
          onCycleTaskStatus={cycleTaskStatus}
          onAddSubtasks={addSubtasks}
          onDeleteSubtask={deleteSubtask}
          onEditSubtask={editSubtask}
          onToggleSubtask={toggleSubtask}
          onReorderSubtask={reorderSubtask}
          onOpenAddModal={() => setIsModalOpen(true)}
          onCreateTask={createTask}
          onDeleteTask={deleteTask}
          onUpdateTask={updateTask}
          onAddEntry={addEntry}
          today={todayIso}
          aspirations={safeAspirations}
          goalResults={safeGoalResults}
          behaviors={safeBehaviors}
          habits={safeHabits}
          dayPlans={safeDayPlans}
          onOpenGoals={openGoals}
          onOpenGoal={openGoal}
          running={timer.running}
          elapsedMs={timer.elapsedMs}
          onStopTimer={timer.stop}
          onPrevWeek={goToPrevWeek}
          onNextWeek={goToNextWeek}
        />
      ) : viewMode === "week" ? (
        <TodoWeekView
          onToggleMainline={toggleMainline}
          viewMode={viewMode}
          onChangeViewMode={changeViewMode}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          tasks={safeTasks}
          entries={safeEntries}
          onCycleTaskStatus={cycleTaskStatus}
          onAddSubtasks={addSubtasks}
          onToggleSubtask={toggleSubtask}
          onDeleteSubtask={deleteSubtask}
          onEditSubtask={editSubtask}
          onReorderSubtask={reorderSubtask}
          onOpenAddModal={() => setIsModalOpen(true)}
          onCreateTask={createTask}
          onDeleteTask={deleteTask}
          onUpdateTask={updateTask}
          onAddEntry={addEntry}
          today={todayIso}
          aspirations={safeAspirations}
          goalResults={safeGoalResults}
          behaviors={safeBehaviors}
          habits={safeHabits}
          dayPlans={safeDayPlans}
          onOpenGoals={openGoals}
          onOpenGoal={openGoal}
          running={timer.running}
          elapsedMs={timer.elapsedMs}
          onStopTimer={timer.stop}
          onPrevWeek={goToPrevWeek}
          onNextWeek={goToNextWeek}
        />
      ) : viewMode === "habit" ? (
        <HabitLabView
          viewMode={viewMode}
          onChangeViewMode={changeViewMode}
          today={todayIso}
          aspirations={safeAspirations}
          behaviors={safeBehaviors}
          goalResults={safeGoalResults}
          dayPlans={safeDayPlans}
          onOpenGoals={openGoals}
          onOpenGoal={openGoal}
          running={timer.running}
          elapsedMs={timer.elapsedMs}
          onStopTimer={timer.stop}
          entries={safeEntries}
          tasks={safeTasks}
          habits={safeHabits}
          habitLogs={safeHabitLogs}
          onAddHabit={addHabit}
          habitHasLogs={habitHasLogs}
          onLogHabit={logHabit}
          onScheduleHabitDates={scheduleHabitDates}
          onSetHabitLogImpact={setHabitLogImpact}
          onUndoHabitLog={undoHabitLog}
          onSetHabitAnchor={setHabitAnchor}
          onToggleHabitMeasure={toggleHabitMeasure}
          onDeleteHabit={deleteHabit}
        />
      ) : (
        <TimeLogView
          viewMode={viewMode}
          onChangeViewMode={changeViewMode}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          tasks={safeTasks}
          entries={safeEntries}
          onAddEntries={addEntries}
          onDeleteEntry={deleteEntry}
          onUpdateEntry={updateEntry}
          onSetEntriesCategory={setEntriesCategory}
          onApplyCategories={applyEntryCategories}
          onUndoEntries={undoEntries}
          canUndoEntries={entriesHistory.length > 0}
          timer={timer}
          today={todayIso}
          aspirations={safeAspirations}
          dayPlans={safeDayPlans}
          onOpenGoals={openGoals}
          running={timer.running}
          elapsedMs={timer.elapsedMs}
          onStopTimer={timer.stop}
          onPrevWeek={goToPrevWeek}
          onNextWeek={goToNextWeek}
        />
      )}

      <AddTaskModal
        mode={viewMode === "week" ? "week" : "day"}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={createTask}
        selectedDate={selectedDate}
      />

      {/* 手机避开页头新增按钮；桌面仍放在右上角。 */}
      <button
        type="button"
        data-no-tab-swipe
        onClick={() => setIsSyncOpen(true)}
        aria-label="多设备同步"
        className="fixed bottom-4 right-4 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-[var(--color-border)] bg-white shadow-[0_2px_10px_rgba(0,0,0,0.12)] transition-colors hover:bg-[var(--color-bg-gray-light)] sm:bottom-auto sm:top-4"
      >
        {sync.status === "syncing" ? (
          <RefreshCw className="w-5 h-5 text-[var(--color-primary)] animate-spin" />
        ) : sync.code ? (
          <Cloud
            className={[
              "w-5 h-5",
              sync.status === "error" || sync.status === "not_configured"
                ? "text-[var(--color-danger)]"
                : "text-[var(--color-primary)]",
            ].join(" ")}
          />
        ) : (
          <CloudOff className="w-5 h-5 text-[var(--color-text-tertiary)]" />
        )}
        {sync.code && sync.status === "synced" && (
          <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-[var(--color-success)] border border-white" />
        )}
      </button>

      <SyncModal
        isOpen={isSyncOpen}
        onClose={() => setIsSyncOpen(false)}
        code={sync.code}
        status={sync.status}
        lastSyncedAt={sync.lastSyncedAt}
        onConnect={sync.setCode}
        onDisconnect={sync.disconnect}
        onRefresh={sync.refresh}
      />
    </main>
  );
}
