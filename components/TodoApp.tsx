"use client";

import { useMemo, useState } from "react";
import TodoDayView from "@/components/TodoDayView";
import TodoWeekView from "@/components/TodoWeekView";
import TimeLogView from "@/components/TimeLogView";
import HabitLabView from "@/components/HabitLabView";
import AddTaskModal from "@/components/AddTaskModal";
import SyncModal from "@/components/SyncModal";
import type {
  Aspiration,
  AspirationKind,
  BehaviorCard,
  BehaviorType,
  EntryCategory,
  ISODate,
  Task,
  TimeEntry,
  ViewMode,
  TaskStatus,
} from "@/components/todo/types";
import { toISODate, parseISODate, addDays, startOfWeek } from "@/components/todo/date";
import { useLocalStorageState } from "@/components/todo/storage";
import { useCloudSync } from "@/components/todo/sync";
import { Cloud, CloudOff, RefreshCw } from "lucide-react";

const STORAGE_KEY = "mytodo.tasks.v1";
const ENTRIES_KEY = "mytodo.entries.v1";
// 习惯实验室（一期只存本地，暂不进云同步）
const ASPIRATIONS_KEY = "mytodo.aspirations.v1";
const BEHAVIORS_KEY = "mytodo.behaviors.v1";
const EMPTY_ENTRIES: TimeEntry[] = [];
const EMPTY_ASPIRATIONS: Aspiration[] = [];
const EMPTY_BEHAVIORS: BehaviorCard[] = [];

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

  const [viewMode, setViewMode] = useState<ViewMode>("day");
  const [selectedDate, setSelectedDate] = useState<ISODate>(todayIso);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSyncOpen, setIsSyncOpen] = useState(false);
  // 时间记录撤回栈：每次用户改动记录前先存一份快照，最多留 30 步
  const [entriesHistory, setEntriesHistory] = useState<TimeEntry[][]>([]);

  const safeTasks = hydrated ? tasks : seedTasks(todayIso);
  const safeEntries = entriesHydrated ? entries : EMPTY_ENTRIES;
  const safeAspirations = aspHydrated ? aspirations : EMPTY_ASPIRATIONS;
  const safeBehaviors = behHydrated ? behaviorCards : EMPTY_BEHAVIORS;

  // 多设备同步码
  const sync = useCloudSync({
    hydrated: hydrated && entriesHydrated,
    tasks,
    entries,
    setTasks,
    setEntries,
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
  function createTask(taskData: Omit<Task, "id">) {
    const newTask: Task = {
      ...taskData,
      id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    };
    setTasks((prev) => [...prev, newTask]);
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
  function addEntries(entryList: Omit<TimeEntry, "id">[]) {
    snapshotEntries();
    const newEntries: TimeEntry[] = entryList.map((e, i) => ({
      ...e,
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

  function createAspiration(title: string, kind: AspirationKind) {
    const a: Aspiration = {
      id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title,
      kind,
      createdAt: Date.now(),
    };
    setAspirations((prev) => [...prev, a]);
  }

  // 删愿望连它下面的行为一起删，不留孤儿卡片
  function deleteAspiration(id: string) {
    setAspirations((prev) => prev.filter((a) => a.id !== id));
    setBehaviorCards((prev) => prev.filter((b) => b.aspirationId !== id));
  }

  // 收集口回车即存：不带 type → 未判定；魔法棒收进来的自带 type
  function addBehaviors(aspirationId: string, items: Array<{ text: string; type?: BehaviorType }>) {
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
    results: Array<{ id: string; type: BehaviorType; reason?: string; hasDecision?: boolean }>,
  ) {
    const byId = new Map(results.map((r) => [r.id, r]));
    setBehaviorCards((prev) =>
      prev.map((b) => {
        const r = byId.get(b.id);
        if (!r || b.typeSource === "user") return b;
        return { ...b, type: r.type, typeSource: "ai", reason: r.reason, hasDecision: r.hasDecision };
      }),
    );
  }

  // 改条目文字。文字变了，AI 之前那条判定就作废了（理由是针对旧文字说的），
  // 退回未判定等下次重判；但你手动定过的类型保留——那是你的意图，不是对文字的推断。
  function updateBehaviorText(id: string, text: string) {
    setBehaviorCards((prev) =>
      prev.map((b) => {
        if (b.id !== id || b.text === text) return b;
        const aiJudged = b.typeSource !== "user";
        return {
          ...b,
          text,
          type: aiJudged ? "unsorted" : b.type,
          typeSource: aiJudged ? undefined : b.typeSource,
          reason: undefined,
          hasDecision: undefined,
        };
      }),
    );
  }

  // 手动改判：以后 AI 不再覆盖这条
  function setBehaviorType(id: string, type: BehaviorType) {
    setBehaviorCards((prev) =>
      prev.map((b) => (b.id === id ? { ...b, type, typeSource: "user" } : b)),
    );
  }

  // 焦点地图两轴（0-100，现在只落 25/75 两档）
  function setBehaviorAxis(id: string, patch: { impact?: number; feasibility?: number }) {
    setBehaviorCards((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }

  // 重排：清掉这个愿望下所有可重复行为的两轴
  function resetBehaviorAxes(aspirationId: string) {
    setBehaviorCards((prev) =>
      prev.map((b) =>
        b.aspirationId === aspirationId ? { ...b, impact: undefined, feasibility: undefined } : b,
      ),
    );
  }

  function deleteBehavior(id: string) {
    setBehaviorCards((prev) => prev.filter((b) => b.id !== id));
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
      {viewMode === "day" ? (
        <TodoDayView
          viewMode={viewMode}
          onChangeViewMode={setViewMode}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          tasks={safeTasks}
          entries={safeEntries}
          onCycleTaskStatus={cycleTaskStatus}
          onOpenAddModal={() => setIsModalOpen(true)}
          onCreateTask={createTask}
          onDeleteTask={deleteTask}
          onUpdateTask={updateTask}
          onAddEntry={addEntry}
          onPrevWeek={goToPrevWeek}
          onNextWeek={goToNextWeek}
        />
      ) : viewMode === "week" ? (
        <TodoWeekView
          viewMode={viewMode}
          onChangeViewMode={setViewMode}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          tasks={safeTasks}
          entries={safeEntries}
          onCycleTaskStatus={cycleTaskStatus}
          onOpenAddModal={() => setIsModalOpen(true)}
          onCreateTask={createTask}
          onDeleteTask={deleteTask}
          onUpdateTask={updateTask}
          onAddEntry={addEntry}
          onPrevWeek={goToPrevWeek}
          onNextWeek={goToNextWeek}
        />
      ) : viewMode === "habit" ? (
        <HabitLabView
          viewMode={viewMode}
          onChangeViewMode={setViewMode}
          aspirations={safeAspirations}
          behaviors={safeBehaviors}
          onCreateAspiration={createAspiration}
          onDeleteAspiration={deleteAspiration}
          onAddBehaviors={addBehaviors}
          onApplyJudgements={applyJudgements}
          onUpdateBehaviorText={updateBehaviorText}
          onSetBehaviorType={setBehaviorType}
          onSetBehaviorAxis={setBehaviorAxis}
          onResetBehaviorAxes={resetBehaviorAxes}
          onDeleteBehavior={deleteBehavior}
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
