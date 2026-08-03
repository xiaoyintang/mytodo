export type ViewMode = "day" | "week" | "log" | "habit";

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

// ===== 习惯实验室（福格行为设计）=====

/** 愿望("想更健康"，抽象) vs 结果("一个月瘦5斤"，可衡量)——两者都不是行为 */
export type AspirationKind = "aspiration" | "outcome";

/** 一个愿望/结果，行为集群挂在它下面 */
export interface Aspiration {
  id: string;
  title: string;
  kind: AspirationKind;
  createdAt: number;
}

/**
 * 条目类型。收集时一律是 unsorted，批量判定后才落到后面五类之一。
 * 前两类（愿望/成果）执行不了，要拆成行为；onetime 做完就没了；
 * habit / stop 是可重复行为，只有它们进焦点地图。
 */
export type BehaviorType =
  | "unsorted"
  | "aspiration"
  | "outcome"
  | "onetime"
  | "habit"
  | "stop";

/** 行为集群里的一张卡 */
export interface BehaviorCard {
  id: string;
  aspirationId: string;
  text: string;
  type: BehaviorType;
  createdAt: number;
  /** "user" = 用户手动改判过，AI 不再覆盖 */
  typeSource?: "ai" | "user";
  /** AI 判定理由（一句话） */
  reason?: string;
  /** 这条行为内部藏着"需要当场判断"的成分（如"挑出有问题的那句"），建议改写成零决策版本 */
  hasDecision?: boolean;
  /** 焦点地图两轴（二期填）：影响力 / 我能不能做到 */
  impact?: number;
  feasibility?: number;
}

/** 记录的大类，用于"今天时间都去哪了"的饼图 */
export type EntryCategory = "正事" | "娱乐" | "休息";

/** 一笔时间开销记录（柳比歇夫时间台账的一行） */
export interface TimeEntry {
  id: string;
  date: ISODate;
  title: string;
  minutes: number;
  startTime?: string; // "HH:mm"，事后补记可以没有
  endTime?: string; // "HH:mm"
  taskId?: string; // 关联的任务（计入该任务的时长目标进度）
  category?: EntryCategory; // 大类（关键词规则或 AI 判定）
  categorySource?: "user" | "ai"; // "user"=手动改过，以后同名记录都听它的，AI 不再覆盖
}

