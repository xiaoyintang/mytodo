"use client";

import { useMemo, useState } from "react";
import TodoDayView from "@/components/TodoDayView";
import TodoWeekView from "@/components/TodoWeekView";
import TimeLogView from "@/components/TimeLogView";
import AddTaskModal from "@/components/AddTaskModal";
import SyncModal from "@/components/SyncModal";
import type { ISODate, Task, TimeEntry, ViewMode, TaskStatus } from "@/components/todo/types";
import { toISODate, parseISODate, addDays, startOfWeek } from "@/components/todo/date";
import { useLocalStorageState } from "@/components/todo/storage";
import { useCloudSync } from "@/components/todo/sync";
import { Cloud, CloudOff, RefreshCw } from "lucide-react";

const STORAGE_KEY = "mytodo.tasks.v1";
const ENTRIES_KEY = "mytodo.entries.v1";
const EMPTY_ENTRIES: TimeEntry[] = [];

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

  const [viewMode, setViewMode] = useState<ViewMode>("day");
  const [selectedDate, setSelectedDate] = useState<ISODate>(todayIso);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSyncOpen, setIsSyncOpen] = useState(false);

  const safeTasks = hydrated ? tasks : seedTasks(todayIso);
  const safeEntries = entriesHydrated ? entries : EMPTY_ENTRIES;

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

  // 新增时间记录（批量，用于自然语言解析出多笔的场景）
  function addEntries(entryList: Omit<TimeEntry, "id">[]) {
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
    setEntries((prev) => prev.filter((e) => e.id !== entryId));
  }

  // 更新时间记录（台账行内编辑）
  function updateEntry(entryId: string, updates: Partial<Omit<TimeEntry, "id">>) {
    setEntries((prev) => prev.map((e) => (e.id === entryId ? { ...e, ...updates } : e)));
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
