export type ViewMode = "day" | "week" | "log";

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
  /** 时长目标任务（柳比歇夫模式）：不限定时间段，只要求累计投入时长（分钟） */
  targetMinutes?: number;
  /** 手动完成进度 0-100（非时长目标任务用；与状态联动：0=待办 100=已完成 其余=进行中） */
  progress?: number;
}

/** 一笔时间开销记录（柳比歇夫时间台账的一行） */
export interface TimeEntry {
  id: string;
  date: ISODate;
  title: string;
  minutes: number;
  startTime?: string; // "HH:mm"，事后补记可以没有
  endTime?: string; // "HH:mm"
  taskId?: string; // 关联的任务（计入该任务的时长目标进度）
}

