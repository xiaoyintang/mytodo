"use client";

import { useMemo, useState } from "react";
import TodoDayView from "@/components/TodoDayView";
import TodoWeekView from "@/components/TodoWeekView";
import TimeLogView from "@/components/TimeLogView";
import HabitLabView from "@/components/HabitLabView";
import GoalsView from "@/components/GoalsView";
import AddTaskModal from "@/components/AddTaskModal";
import SyncModal from "@/components/SyncModal";
import type {
  Aspiration,
  AspirationKind,
  BehaviorCard,
  BehaviorType,
  DayPlan,
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
import { toISODate, parseISODate, addDays, startOfWeek } from "@/components/todo/date";
import { useLocalStorageState } from "@/components/todo/storage";
import { useCloudSync } from "@/components/todo/sync";
import { nextGoalColor } from "@/components/todo/goal";
import { useTimer } from "@/components/todo/useTimer";
import { Cloud, CloudOff, RefreshCw } from "lucide-react";

const STORAGE_KEY = "mytodo.tasks.v1";
const ENTRIES_KEY = "mytodo.entries.v1";
// 习惯实验室（一期只存本地，暂不进云同步）
const ASPIRATIONS_KEY = "mytodo.aspirations.v1";
const BEHAVIORS_KEY = "mytodo.behaviors.v1";
const HABITS_KEY = "mytodo.habits.v1";
const HABIT_LOGS_KEY = "mytodo.habitlogs.v1";
const DAY_PLANS_KEY = "mytodo.dayplans.v1";
const EMPTY_ENTRIES: TimeEntry[] = [];
const EMPTY_ASPIRATIONS: Aspiration[] = [];
const EMPTY_BEHAVIORS: BehaviorCard[] = [];
const EMPTY_HABITS: Habit[] = [];
const EMPTY_HABIT_LOGS: HabitLog[] = [];
const EMPTY_DAY_PLANS: Record<string, DayPlan> = {};

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

// Status cycle: todo → in_progress → done → todo
const STATUS_CYCLE: Record<TaskStatus, TaskStatus> = {
  todo: "in_progress",
  in_progress: "done",
  done: "todo",
};

export default function TodoApp() {
  const todayIso = useMemo(() => toISODate(new Date()), []);
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
  const [goalsOpen, setGoalsOpen] = useState(false); // 从常驻条进的目标管理页
  const [selectedDate, setSelectedDate] = useState<ISODate>(todayIso);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSyncOpen, setIsSyncOpen] = useState(false);
  // 时间记录撤回栈：每次用户改动记录前先存一份快照，最多留 30 步
  const [entriesHistory, setEntriesHistory] = useState<TimeEntry[][]>([]);
  // 习惯实验室的撤回栈（愿望 + 行为一起快照）
  const [labHistory, setLabHistory] = useState<
    Array<{ aspirations: Aspiration[]; behaviors: BehaviorCard[]; restoreTasks?: Task[] }>
  >([]);

  const safeTasks = hydrated ? tasks : seedTasks(todayIso);
  const safeEntries = entriesHydrated ? entries : EMPTY_ENTRIES;
  const safeAspirations = aspHydrated ? aspirations : EMPTY_ASPIRATIONS;
  const safeBehaviors = behHydrated ? behaviorCards : EMPTY_BEHAVIORS;
  const safeHabits = habitsHydrated ? habits : EMPTY_HABITS;
  const safeHabitLogs = logsHydrated ? habitLogs : EMPTY_HABIT_LOGS;
  const safeDayPlans = plansHydrated ? dayPlans : EMPTY_DAY_PLANS;

  // 多设备同步码
  // 计时器提到这一层，才能进云同步（手机上开始，电脑上看得到还在跑）
  const timer = useTimer((entry) => addEntries([entry]));

  const labHydrated = aspHydrated && behHydrated && habitsHydrated && logsHydrated && plansHydrated;
  const lab = useMemo(
    () => ({ aspirations, behaviors: behaviorCards, habits, habitLogs, dayPlans }),
    [aspirations, behaviorCards, habits, habitLogs, dayPlans],
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
      if (patch.behaviors) setBehaviorCards(patch.behaviors);
      if (patch.habits) setHabits(patch.habits);
      if (patch.habitLogs) setHabitLogs(patch.habitLogs);
      if (patch.dayPlans) setDayPlans(patch.dayPlans);
    },
    adoptTimer: timer.adopt,
  });

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

  function addSubtasks(taskId: string, titles: string[]) {
    const now = Date.now();
    patchSubtasks(taskId, (list) => [
      ...list,
      ...titles
        .map((x) => x.trim())
        .filter(Boolean)
        .map((title, i) => ({
          id: `st-${now}-${i}-${Math.random().toString(36).slice(2, 7)}`,
          title,
          done: false,
        })),
    ]);
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
  function snapshotLab(restoreTasks?: Task[]) {
    setLabHistory((h) => [
      ...h.slice(-29),
      { aspirations, behaviors: behaviorCards, restoreTasks },
    ]);
  }

  function undoLab() {
    if (labHistory.length === 0) return;
    const prev = labHistory[labHistory.length - 1];
    setAspirations(prev.aspirations);
    setBehaviorCards(prev.behaviors);
    // 只把当时被连带删掉的任务加回来，不整包覆盖 tasks——
    // 否则会把用户在日视图里的其他改动一起回滚
    if (prev.restoreTasks?.length) {
      setTasks((cur) => {
        const have = new Set(cur.map((t) => t.id));
        return [...cur, ...prev.restoreTasks!.filter((t) => !have.has(t.id))];
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
    setBehaviorCards((prev) => prev.filter((b) => b.aspirationId !== id));
  }

  // 收集口回车即存：不带 type → 未判定；魔法棒收进来的自带 type
  function addBehaviors(aspirationId: string, items: Array<{ text: string; type?: BehaviorType }>) {
    snapshotLab();
    const now = Date.now();
    const cards: BehaviorCard[] = items.map((it, i) => ({
      id: `b-${now}-${i}-${Math.random().toString(36).slice(2, 7)}`,
      aspirationId,
      text: it.text,
      type: it.type ?? "unsorted",
      typeSource: it.type ? "ai" : undefined,
      createdAt: now,
    }));
    setBehaviorCards((prev) => [...prev, ...cards]);
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
    const aspirationId = behaviorCards.find((b) => b.id === cardId)?.aspirationId;
    setTasks((prev) => [
      ...prev,
      { id: taskId, title, date, status: "todo" as TaskStatus, aspirationId },
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
  function logHabit(habitId: string) {
    const d = new Date();
    const log: HabitLog = {
      id: `hl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      habitId,
      date: toISODate(d) as ISODate,
      at: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
    };
    setHabitLogs((prev) => [...prev, log]);
  }

  // 点错了撤掉今天最后一次
  function undoHabitLog(habitId: string) {
    const todayIso2 = toISODate(new Date());
    setHabitLogs((prev) => {
      let lastIdx = -1;
      prev.forEach((l, i) => {
        if (l.habitId === habitId && l.date === todayIso2) lastIdx = i;
      });
      if (lastIdx < 0) return prev;
      return prev.filter((_, i) => i !== lastIdx);
    });
  }

  // 焦点地图两轴（0-100，现在只落 25/75 两档）
  function setBehaviorAxis(id: string, patch: { impact?: number; feasibility?: number }) {
    setBehaviorCards((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }

  // 重排：清掉这个愿望下所有可重复行为的两轴
  function resetBehaviorAxes(aspirationId: string) {
    snapshotLab();
    setBehaviorCards((prev) =>
      prev.map((b) =>
        b.aspirationId === aspirationId ? { ...b, impact: undefined, feasibility: undefined } : b,
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

  return (
    <main className="h-full w-full bg-[#F5F5F5] flex items-start justify-center p-8 overflow-auto">
      {goalsOpen ? (
        <GoalsView
          aspirations={safeAspirations}
          behaviors={safeBehaviors}
          tasks={safeTasks}
          habits={safeHabits}
          entries={safeEntries}
          // 固定用"今天所在那周"，不跟 selectedDate 走——目标页和日期无关，
          // 翻到上周再点进来却显示"本周"，没人猜得到
          weekDates={Array.from({ length: 7 }).map(
            (_, i) => toISODate(addDays(startOfWeek(parseISODate(todayIso), true), i)) as ISODate,
          )}
          onBack={() => setGoalsOpen(false)}
          onCreateAspiration={createAspiration}
          onDeleteAspiration={deleteAspiration}
          onAddBehaviors={addBehaviors}
          onApplyJudgements={applyJudgements}
          onSetBehaviorType={setBehaviorType}
          onShrinkBehavior={shrinkBehavior}
          onEditBehaviorText={editBehaviorText}
          onScheduleBehavior={scheduleBehavior}
          onUnscheduleBehavior={unscheduleBehavior}
          onSetBehaviorAxis={setBehaviorAxis}
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
          onChangeViewMode={setViewMode}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          tasks={safeTasks}
          entries={safeEntries}
          onCycleTaskStatus={cycleTaskStatus}
          onAddSubtasks={addSubtasks}
          onDeleteSubtask={deleteSubtask}
          onEditSubtask={editSubtask}
          onToggleSubtask={toggleSubtask}
          onOpenAddModal={() => setIsModalOpen(true)}
          onCreateTask={createTask}
          onDeleteTask={deleteTask}
          onUpdateTask={updateTask}
          onAddEntry={addEntry}
          today={todayIso}
          aspirations={safeAspirations}
          dayPlans={safeDayPlans}
          onOpenGoals={() => setGoalsOpen(true)}
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
          onChangeViewMode={setViewMode}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          tasks={safeTasks}
          entries={safeEntries}
          onCycleTaskStatus={cycleTaskStatus}
          onAddSubtasks={addSubtasks}
          onToggleSubtask={toggleSubtask}
          onDeleteSubtask={deleteSubtask}
          onEditSubtask={editSubtask}          onOpenAddModal={() => setIsModalOpen(true)}
          onCreateTask={createTask}
          onDeleteTask={deleteTask}
          onUpdateTask={updateTask}
          onAddEntry={addEntry}
          today={todayIso}
          aspirations={safeAspirations}
          dayPlans={safeDayPlans}
          onOpenGoals={() => setGoalsOpen(true)}
          running={timer.running}
          elapsedMs={timer.elapsedMs}
          onStopTimer={timer.stop}
          onPrevWeek={goToPrevWeek}
          onNextWeek={goToNextWeek}
        />
      ) : viewMode === "habit" ? (
        <HabitLabView
          viewMode={viewMode}
          onChangeViewMode={setViewMode}
          today={todayIso}
          aspirations={safeAspirations}
          dayPlans={safeDayPlans}
          onOpenGoals={() => setGoalsOpen(true)}
          running={timer.running}
          elapsedMs={timer.elapsedMs}
          onStopTimer={timer.stop}
          entries={safeEntries}
          habits={safeHabits}
          habitLogs={safeHabitLogs}
          onAddHabit={addHabit}
          habitHasLogs={habitHasLogs}
          onLogHabit={logHabit}
          onUndoHabitLog={undoHabitLog}
          onSetHabitAnchor={setHabitAnchor}
          onToggleHabitMeasure={toggleHabitMeasure}
          onDeleteHabit={deleteHabit}
        />
      ) : (
        <TimeLogView
          viewMode={viewMode}
          onChangeViewMode={setViewMode}
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
          onOpenGoals={() => setGoalsOpen(true)}
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

      {/* 多设备同步：右上角浮动按钮 */}
      <button
        type="button"
        onClick={() => setIsSyncOpen(true)}
        aria-label="多设备同步"
        className="fixed top-4 right-4 z-40 w-11 h-11 rounded-full bg-white shadow-[0_2px_10px_rgba(0,0,0,0.12)] border border-[var(--color-border)] flex items-center justify-center hover:bg-[var(--color-bg-gray-light)] transition-colors"
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
