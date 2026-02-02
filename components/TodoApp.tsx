"use client";

import { useMemo, useState } from "react";
import TodoDayView from "@/components/TodoDayView";
import TodoWeekView from "@/components/TodoWeekView";
import AddTaskModal from "@/components/AddTaskModal";
import type { ISODate, Task, ViewMode, TaskStatus } from "@/components/todo/types";
import { toISODate } from "@/components/todo/date";
import { useLocalStorageState } from "@/components/todo/storage";

const STORAGE_KEY = "mytodo.tasks.v1";

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

  const [viewMode, setViewMode] = useState<ViewMode>("day");
  const [selectedDate, setSelectedDate] = useState<ISODate>(todayIso);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const safeTasks = hydrated ? tasks : seedTasks(todayIso);

  // Toggle task status: todo → in_progress → done → todo
  function cycleTaskStatus(taskId: string) {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== taskId) return t;
        return { ...t, status: STATUS_CYCLE[t.status] };
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

  return (
    <main className="h-full w-full bg-[#F5F5F5] flex items-start justify-center p-8 overflow-auto">
      {viewMode === "day" ? (
        <TodoDayView
          viewMode={viewMode}
          onChangeViewMode={setViewMode}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          tasks={safeTasks}
          onCycleTaskStatus={cycleTaskStatus}
          onOpenAddModal={() => setIsModalOpen(true)}
          onDeleteTask={deleteTask}
        />
      ) : (
        <TodoWeekView
          viewMode={viewMode}
          onChangeViewMode={setViewMode}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          tasks={safeTasks}
          onCycleTaskStatus={cycleTaskStatus}
          onOpenAddModal={() => setIsModalOpen(true)}
          onDeleteTask={deleteTask}
        />
      )}

      <AddTaskModal
        mode={viewMode}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={createTask}
        selectedDate={selectedDate}
      />
    </main>
  );
}
