export type ViewMode = "day" | "week" | "log" | "habit";

export type TaskStatus = "todo" | "in_progress" | "done";

export type TaskPriority = "normal" | "high";

export type TaskTag = "工作" | "进行中" | "已完成" | "学习" | "高优先级" | "协作" | "复盘" | "习惯";

export type ISODate = `${number}-${number}-${number}`; // YYYY-MM-DD (best-effort)

/**
 * 任务的一个子步骤。**内嵌在 Task 里，不单开一张表**——
 * 子任务没有独立生命：只属于一个任务、跟着任务删、不需要跨任务查询。
 * 内嵌还白捡一个好处：云同步已经覆盖 tasks，一行同步代码都不用改。
 *
 * 它同时顶掉了 GTD 的「下一步行动」字段——所谓 nextAction 就是
 * "只能有一条、还不能打勾的子任务"，有了列表就不需要那个残废版本了。
 */
export interface SubTask {
  id: string;
  title: string;
  done: boolean;
}

export interface Task {
  id: string;
  title: string;
  date: ISODate;
  /** 属于哪个目标（可选，不强制。新建任务时默认沿用上次选的） */
  aspirationId?: string;
  startTime?: string; // "HH:mm"
  endTime?: string; // "HH:mm"
  status: TaskStatus;
  priority?: TaskPriority;
  tag?: TaskTag;
  /** 时长目标任务（柳比歇夫模式）：不限定时间段，只要求累计投入时长（分钟） */
  targetMinutes?: number;
  /** 拆出来的子步骤。**不要求拆完**——加一条做一条也行，GTD 的省力点就在这 */
  subtasks?: SubTask[];
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
  /** 目标色（任务卡、主线条、投入图上都用它）。旧数据没有，按序号兜底 */
  color?: string;
  /** 每周投入天数上限 1-7；null / undefined = 不限。超了只提示不拦 */
  weeklyLimit?: number | null;
}

/**
 * 某一天的安排。**不是新实体**——"主线"就是"这天主推哪几个目标"，
 * 底层只是 Aspiration id + 日期的关联，不建 MainLine 表。
 */
export interface DayPlan {
  date: ISODate;
  /** 今日主线，可多条 */
  primaryAspirationIds: string[];
  /** 今天那 1 件必做（阶段二用），全局每天最多 1 个 */
  mustDoTaskId?: string;
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
  /**
   * 这条为什么不好"无脑做"。按三个时刻排优先级，**只报最早的那一个**——
   * 修好早的往往顺手把晚的也修了，同时喊两条只会吵。
   * - `timing`   ① 起点：没说什么时候做（只对可重复行为有意义，一次性任务靠排期给时机）
   * - `decision` ② 过程：中间要当场判断/挑选/评估
   * - `endpoint` ③ 终点：做到什么程度算完，说不出来
   * 「缺动作」不在这儿——那由 type=aspiration/outcome 表达，行上直接给「拆成行为」
   */
  blocker?: "timing" | "decision" | "endpoint";
  /** @deprecated 老数据兼容：等价于 blocker="endpoint"。重判一次就会换成 blocker */
  hasDecision?: boolean;
  /** 焦点地图两轴（二期填）：影响力 / 我能不能做到 */
  impact?: number;
  feasibility?: number;
  /** 一次性任务排进日视图之后，关联的那个 Task 的 id */
  taskId?: string;
}

/**
 * 计量方式，由行为本身决定，不是每次让用户选：
 * - count 发生型：俯卧撑、手机放客厅。锚点一天可能触发好几次，所以是累加次数，
 *   不算时长、不进时间台账（"俯卧撑1分钟"会污染柳比歇夫统计）
 * - duration 时长型：看书、练琴。你照旧在「记录」里记一笔，
 *   习惯这边靠同名匹配自动读出今天的次数和分钟数，不用打第二次卡
 */
export type HabitMeasure = "count" | "duration";

/** 从黄金行为毕业出来的微习惯 */
export interface Habit {
  id: string;
  title: string;
  /** 锚点（福格 MAP 里的 P）：「在我 ___ 之后，我会 ___」。可以先不填 */
  anchor?: string;
  measure: HabitMeasure;
  behaviorId?: string; // 来自哪条黄金行为
  aspirationId?: string; // 属于哪个愿望
  createdAt: number;
  archived?: boolean;
}

/** 发生型习惯的一次打卡。一天可以有多条——锚点一天可能触发好几次 */
export interface HabitLog {
  id: string;
  habitId: string;
  date: ISODate;
  at: string; // "HH:mm"
  /** 做完之后立刻记下的正向变化。可选，不给打卡增加负担。 */
  impact?: string;
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
  aspirationId?: string; // 属于哪个目标（阶段三：计时时默认填今日主线）
  category?: EntryCategory; // 大类（关键词规则或 AI 判定）
  categorySource?: "user" | "ai"; // "user"=手动改过，以后同名记录都听它的，AI 不再覆盖
}
