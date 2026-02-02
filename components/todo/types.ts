export type ViewMode = "day" | "week";

export type TaskStatus = "todo" | "in_progress" | "done";

export type TaskPriority = "normal" | "high";

export type TaskTag = "工作" | "进行中" | "已完成" | "学习" | "高优先级" | "协作" | "复盘" | "习惯";

export type ISODate = `${number}-${number}-${number}`; // YYYY-MM-DD (best-effort)

export interface Task {
  id: string;
  title: string;
  date: ISODate;
  startTime?: string; // "HH:mm"
  endTime?: string; // "HH:mm"
  status: TaskStatus;
  priority?: TaskPriority;
  tag?: TaskTag;
}

