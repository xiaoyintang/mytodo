"use client";

import { useEffect, useRef, useState } from "react";
import type { Aspiration, Habit, HabitLog, ISODate, Task, TimeEntry } from "@/components/todo/types";
import { formatMinutes } from "@/components/todo/time";
import { toISODate } from "@/components/todo/date";
import {
  Check,
  CalendarCheck2,
  CalendarPlus,
  ChevronDown,
  ChevronRight,
  Clock,
  Plus,
  Sparkles,
  Target,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { useLocalStorageState } from "@/components/todo/storage";
import ConfirmDialog from "@/components/ConfirmDialog";

type Props = {
  aspirations: Aspiration[];
  habits: Habit[];
  logs: HabitLog[];
  entries: TimeEntry[];
  tasks: Task[];
  today: ISODate;
  onLog: (habitId: string) => string;
  onScheduleToday: (habitId: string) => void;
  onSetLogImpact: (logId: string, impact: string) => void;
  onUndoLog: (habitId: string) => void;
  onSetAnchor: (habitId: string, anchor: string) => void;
  onToggleMeasure: (habitId: string) => void;
  onDeleteHabit: (habitId: string) => void;
  hasLogs: (habitId: string) => boolean;
};

const EMPTY_COLLAPSED: string[] = [];
const POSITIVE_IMPACTS = ["更轻松", "更清醒", "更有能量", "更踏实"];
const MILESTONES = new Set([3, 7, 10, 25, 50, 100, 200, 365]);

type Celebration = {
  habitId: string;
  logId: string;
  title: string;
  headline: string;
  detail: string;
  impact?: string;
};

function celebrationCopy(total: number, todayCount: number, aspirationTitle?: string) {
  if (total === 1) {
    return {
      headline: "第一次发生，值得记住",
      detail: aspirationTitle
        ? `这不是计划。你已经为「${aspirationTitle}」做了一次真实行动。`
        : "这不是“打算做”，而是一次已经发生的行动。",
    };
  }
  if (MILESTONES.has(total)) {
    return {
      headline: `这是累计第 ${total} 次`,
      detail: aspirationTitle
        ? `一次次行动，正在让「${aspirationTitle}」变得更真实。`
        : "你正在把偶然发生，慢慢变成更自然的选择。",
    };
  }
  if (todayCount > 1) {
    return {
      headline: `今天第 ${todayCount} 次`,
      detail: aspirationTitle
        ? `你又为「${aspirationTitle}」投了一票。`
        : "重复正在降低下一次行动的启动成本。",
    };
  }
  return {
    headline: "这次算数",
    detail: aspirationTitle
      ? `你刚刚为「${aspirationTitle}」投了一票。`
      : "它已经从“想做”变成了“做过”。",
  };
}

/**
 * 累计次数 + 最近 30 天做了几天。
 * **不做连续天数**：streak 越长断掉的代价越大，而断掉是概率事件，时间够长必然发生，
 * 期望结局是"越成功崩得越惨"。累计次数只增不减，断了没有损失事件。
 */
function habitStats(h: Habit, logs: HabitLog[], entries: TimeEntry[], today: ISODate) {
  const from = new Date(today);
  from.setDate(from.getDate() - 29);
  const fromISO = toISODate(from);

  if (h.measure === "duration") {
    const hit = entries.filter((e) => e.title.trim() === h.title.trim());
    const taskLogs = logs.filter(
      (log) =>
        log.habitId === h.id &&
        !!log.taskId &&
        !hit.some((entry) => entry.taskId && entry.taskId === log.taskId),
    );
    return {
      total: hit.length + taskLogs.length,
      days30: new Set([
        ...hit.filter((e) => e.date >= fromISO && e.date <= today).map((e) => e.date),
        ...taskLogs.filter((log) => log.date >= fromISO && log.date <= today).map((log) => log.date),
      ]).size,
    };
  }
  const mine = logs.filter((l) => l.habitId === h.id);
  return {
    total: mine.length,
    days30: new Set(mine.filter((l) => l.date >= fromISO && l.date <= today).map((l) => l.date)).size,
  };
}

/** 时长型习惯今天的成绩：优先读时间台账，也承认由关联 Todo 完成产生的那一次。 */
function fromLedger(habit: Habit, entries: TimeEntry[], logs: HabitLog[], today: ISODate) {
  const title = habit.title.trim();
  const hit = entries.filter((e) => e.date === today && e.title.trim() === title);
  const scheduledLogs = logs.filter(
    (log) =>
      log.habitId === habit.id &&
      log.date === today &&
      !!log.taskId &&
      !hit.some((entry) => entry.taskId && entry.taskId === log.taskId),
  );
  return {
    count: hit.length + scheduledLogs.length,
    minutes: hit.reduce((s, e) => s + e.minutes, 0),
    scheduledCount: scheduledLogs.length,
  };
}

export default function HabitTracker({
  aspirations,
  habits,
  logs,
  entries,
  tasks,
  today,
  onLog,
  onScheduleToday,
  onSetLogImpact,
  onUndoLog,
  onSetAnchor,
  onToggleMeasure,
  onDeleteHabit,
  hasLogs,
}: Props) {
  // 收起哪些目标分组（记在本地，刷新后还是你上次那样）
  const { value: collapsed, setValue: setCollapsed } = useLocalStorageState<string[]>(
    "mytodo.habitgroups.collapsed.v1",
    EMPTY_COLLAPSED,
  );
  const [editAnchor, setEditAnchor] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [justTapped, setJustTapped] = useState<string | null>(null);
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<Habit | null>(null);
  const celebrationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (celebrationTimer.current) clearTimeout(celebrationTimer.current);
    };
  }, []);

  const live = habits.filter((h) => !h.archived);
  if (live.length === 0) return null;

  // 按目标分组：习惯多了以后得知道每条是为哪个愿望服务的
  const groups: Array<{ key: string; title: string | null; items: Habit[] }> = [];
  for (const a of aspirations) {
    const items = live.filter((h) => h.aspirationId === a.id);
    if (items.length > 0) groups.push({ key: a.id, title: a.title, items });
  }
  const orphans = live.filter((h) => !h.aspirationId || !aspirations.some((a) => a.id === h.aspirationId));
  if (orphans.length > 0) groups.push({ key: "__none__", title: null, items: orphans });

  const todayActiveHabits = live.filter((h) => {
    if (h.measure === "duration") return fromLedger(h, entries, logs, today).count > 0;
    return logs.some((l) => l.habitId === h.id && l.date === today);
  });
  const todayActionCount = live.reduce((sum, h) => {
    if (h.measure === "duration") return sum + fromLedger(h, entries, logs, today).count;
    return sum + logs.filter((l) => l.habitId === h.id && l.date === today).length;
  }, 0);
  const todayTargetTitles = Array.from(
    new Set(
      todayActiveHabits
        .map((h) => aspirations.find((a) => a.id === h.aspirationId)?.title)
        .filter((title): title is string => Boolean(title)),
    ),
  );
  const todayImpacts = Array.from(
    new Set(
      logs
        .filter((l) => l.date === today && l.impact)
        .map((l) => l.impact as string)
        .reverse(),
    ),
  ).slice(0, 3);

  function dismissCelebration(afterMs = 0) {
    if (celebrationTimer.current) clearTimeout(celebrationTimer.current);
    celebrationTimer.current = setTimeout(() => setCelebration(null), afterMs);
  }

  function tap(h: Habit) {
    const logId = onLog(h.id);
    const aspirationTitle = aspirations.find((a) => a.id === h.aspirationId)?.title;
    const currentStats = habitStats(h, logs, entries, today);
    const todayCount = logs.filter((l) => l.habitId === h.id && l.date === today).length + 1;
    const copy = celebrationCopy(currentStats.total + 1, todayCount, aspirationTitle);

    // 不只闪一下：把“发生了什么、为什么算数”明确说出来，再允许顺手记下正向影响。
    setCelebration({ habitId: h.id, logId, title: h.title, ...copy });
    dismissCelebration(6500);
    setJustTapped(h.id);
    try {
      navigator.vibrate?.(12); // 安卓上多一层触感；iOS 不支持，静默忽略
    } catch {
      /* ignore */
    }
    setTimeout(() => setJustTapped((cur) => (cur === h.id ? null : cur)), 750);
  }

  function chooseImpact(impact: string) {
    if (!celebration) return;
    onSetLogImpact(celebration.logId, impact);
    setCelebration((current) => (current ? { ...current, impact } : current));
    dismissCelebration(1800);
  }

  function isShut(key: string): boolean {
    return collapsed.includes(key);
  }

  function toggleGroup(key: string) {
    setCollapsed((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  /** 这一组今天一共记了多少次（时长型的从台账算） */
  function groupDone(items: Habit[]): number {
    return items.reduce((sum, h) => {
      if (h.measure === "duration") return sum + fromLedger(h, entries, logs, today).count;
      return sum + logs.filter((l) => l.habitId === h.id && l.date === today).length;
    }, 0);
  }

  function saveAnchor(id: string) {
    onSetAnchor(id, draft.trim());
    setEditAnchor(null);
  }

  return (
    <div className="w-full flex flex-col gap-3">
      <div className="w-full flex items-center justify-between">
        <span className="text-[var(--color-text-primary)] text-[15px] font-semibold">今天</span>
        <span className="text-[var(--color-text-tertiary)] text-[11px]">
          只积累，不因中断清零
        </span>
      </div>

      {todayActionCount > 0 && (
        <div
          className="relative overflow-hidden rounded-[14px] border border-[#BBF7D0] bg-gradient-to-br from-[#F0FDF4] via-white to-[#EFF6FF] px-4 py-3.5"
          aria-live="polite"
        >
          <div className="absolute -right-5 -top-7 h-20 w-20 rounded-full bg-[#86EFAC]/20" />
          <div className="relative flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#16A34A] text-white shadow-[0_5px_14px_rgba(22,163,74,0.22)]">
              <Sparkles className="h-4 w-4" strokeWidth={2.5} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-1.5">
                <strong className="text-[24px] leading-none tabular-nums text-[#15803D]">
                  {todayActionCount}
                </strong>
                <span className="text-[13px] font-semibold text-[var(--color-text-primary)]">
                  次行动已经真实发生
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-[var(--color-text-secondary)]">
                {todayTargetTitles.length > 0
                  ? `正在推动「${todayTargetTitles.slice(0, 2).join("」「")}」${todayTargetTitles.length > 2 ? `等 ${todayTargetTitles.length} 个目标` : ""}`
                  : `今天有 ${todayActiveHabits.length} 个习惯从“想做”变成了“做过”`}
              </p>
              {todayImpacts.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] text-[var(--color-text-tertiary)]">今天感受到</span>
                  {todayImpacts.map((impact) => (
                    <span
                      key={impact}
                      className="rounded-full border border-[#BBF7D0] bg-white/80 px-2 py-0.5 text-[10px] font-medium text-[#15803D]"
                    >
                      {impact}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {groups.map((g) => (
        <div key={g.key} className="w-full flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => toggleGroup(g.key)}
            className="w-full flex items-center gap-1.5 text-left"
          >
            {isShut(g.key) ? (
              <ChevronRight className="w-3 h-3 text-[var(--color-text-tertiary)] flex-shrink-0" />
            ) : (
              <ChevronDown className="w-3 h-3 text-[var(--color-text-tertiary)] flex-shrink-0" />
            )}
            <Target className="w-3 h-3 text-[var(--color-primary)] flex-shrink-0" />
            <span className="text-[11px] font-semibold text-[var(--color-text-secondary)] truncate">
              {g.title ?? "没有归属的目标"}
            </span>
            <span className="text-[10px] text-[var(--color-text-tertiary)] flex-shrink-0">
              {g.items.length}
            </span>
            <div className="flex-1" />
            {/* 收起来也得知道今天动没动过 */}
            {isShut(g.key) && (
              <span className="text-[10px] text-[var(--color-text-tertiary)] flex-shrink-0">
                {groupDone(g.items) > 0 ? `今天 ${groupDone(g.items)} 次` : "今天还没做"}
              </span>
            )}
          </button>

          {!isShut(g.key) && g.items.map((h) => {
            const isDuration = h.measure === "duration";
            const ledger = isDuration ? fromLedger(h, entries, logs, today) : null;
            const count = isDuration
              ? (ledger?.count ?? 0)
              : logs.filter((l) => l.habitId === h.id && l.date === today).length;
            const todayTask = tasks.find(
              (task) => task.sourceHabitId === h.id && task.date === today,
            );
            const canUndoManual = logs.some(
              (log) => log.habitId === h.id && log.date === today && !log.taskId,
            );
            const flash = justTapped === h.id;
            const editing = editAnchor === h.id;
            const stats = habitStats(h, logs, entries, today);
            const activeCelebration = celebration?.habitId === h.id ? celebration : null;

            return (
              <div
                key={h.id}
                className={[
                  "w-full flex flex-col gap-0.5 px-3 py-2 rounded-[10px] border transition-colors duration-300",
                  flash ? "animate-habit-glow " : "",
                  flash
                    ? "bg-[#F0FDF4] border-[#16A34A]"
                    : count > 0
                      ? "bg-white border-[var(--color-primary)]"
                      : "bg-white border-[var(--color-border)]",
                ].join(" ")}
              >
                {/* 累计 + 最近30天：只增不减的数字，不做连续天数、不做完成率 */}
                {/* 有锚点才占一行；没有的话下面挂个小链接，省一整行 */}
                {editing ? (
                  <div className="w-full flex items-center gap-1.5">
                    <span className="text-[10px] text-[var(--color-text-tertiary)] flex-shrink-0">在我</span>
                    <input
                      type="text"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.nativeEvent.isComposing) return;
                        if (e.key === "Enter") saveAnchor(h.id);
                        else if (e.key === "Escape") setEditAnchor(null);
                      }}
                      onBlur={() => saveAnchor(h.id)}
                      placeholder="看完一集动漫 / 刷完牙 / 吃完饭放下碗"
                      autoFocus
                      className="flex-1 min-w-0 px-2 py-1 rounded border border-[var(--color-primary)] text-[12px] bg-white focus:outline-none"
                    />
                    <span className="text-[10px] text-[var(--color-text-tertiary)] flex-shrink-0">之后</span>
                  </div>
                ) : (
                  h.anchor && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditAnchor(h.id);
                        setDraft(h.anchor ?? "");
                      }}
                      className="self-start text-[10px] text-[var(--color-text-tertiary)] leading-snug text-left"
                    >
                      在我 <span className="text-[var(--color-text-secondary)] font-medium">{h.anchor}</span> 之后
                    </button>
                  )
                )}

                <div className="w-full flex items-center gap-3 py-0.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-1">
                      <span className="min-w-0 flex-1 break-words text-[14px] font-semibold leading-snug text-[var(--color-text-primary)]">
                        {h.title}
                        {!h.anchor && !editing && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditAnchor(h.id);
                              setDraft("");
                            }}
                            className="ml-1.5 text-[10px] font-normal text-[var(--color-primary)]"
                          >
                            ＋锚点
                          </button>
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={() => setConfirmRemove(h)}
                        className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md hover:bg-[var(--color-bg-gray-light)]"
                        aria-label="移出习惯表"
                        title="移出习惯表（行为还在焦点地图上，随时能加回来）"
                      >
                        <Trash2 className="h-[13px] w-[13px] text-[#A1A1AA]" />
                      </button>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] tabular-nums text-[var(--color-text-tertiary)]">
                      <span
                        key={`${h.id}-${count}`}
                        className={[
                          count > 0 ? "font-semibold text-[#15803D]" : "",
                          flash ? "animate-habit-pop text-[#16A34A]" : "",
                        ].join(" ")}
                      >
                        {isDuration
                          ? count > 0
                            ? (ledger?.minutes ?? 0) > 0
                              ? `今天 ${count} 次 · ${formatMinutes(ledger?.minutes ?? 0)}`
                              : `今天 ${count} 次 · 由 Todo 记下`
                            : "今天还没有时长记录"
                          : count > 0
                            ? `今天 ${count} 次`
                            : "今天还没发生"}
                      </span>
                      {stats.total > 0 && <span>累计 {stats.total}</span>}
                      {stats.total > 0 && <span>近 30 天 {stats.days30} 天</span>}
                      <button
                        type="button"
                        onClick={() => {
                          if (todayTask) return;
                          onScheduleToday(h.id);
                          try {
                            navigator.vibrate?.(8);
                          } catch {
                            /* ignore */
                          }
                        }}
                        disabled={Boolean(todayTask)}
                        className={[
                          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium transition-colors",
                          todayTask?.status === "done"
                            ? "border-[#BBF7D0] bg-[#F0FDF4] text-[#15803D]"
                            : todayTask
                              ? "border-[var(--color-border)] bg-[var(--color-bg-gray-lighter)] text-[var(--color-text-tertiary)]"
                              : "border-[#BFDBFE] bg-[var(--color-primary-light)] text-[var(--color-primary)] hover:border-[var(--color-primary)]",
                        ].join(" ")}
                        aria-label={
                          todayTask?.status === "done"
                            ? `「${h.title}」的今日任务已完成`
                            : todayTask
                              ? `「${h.title}」已排到今天`
                              : `把「${h.title}」排到今天`
                        }
                      >
                        {todayTask ? (
                          <CalendarCheck2 className="h-3 w-3" />
                        ) : (
                          <CalendarPlus className="h-3 w-3" />
                        )}
                        {todayTask?.status === "done" ? "今日已完成" : todayTask ? "已在今日" : "排到今天"}
                      </button>
                    </div>
                  </div>

                  {isDuration ? (
                    <button
                      type="button"
                      onClick={() => onToggleMeasure(h.id)}
                      className="flex h-10 flex-shrink-0 items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-gray-lighter)] px-3 text-[11px] font-medium text-[var(--color-text-secondary)]"
                      title="按时长记，成绩来自「记录」。点这里改成点一下计次"
                    >
                      <Clock className="h-3.5 w-3.5" />
                      记录读取
                    </button>
                  ) : (
                    <div className="flex flex-shrink-0 items-center gap-1">
                      {canUndoManual && (
                        <button
                          type="button"
                          onClick={() => onUndoLog(h.id)}
                          className="flex h-10 w-7 items-center justify-center rounded-lg hover:bg-[var(--color-bg-gray-light)]"
                          aria-label="点错了，撤掉一次"
                          title="点错了，撤掉一次"
                        >
                          <Undo2 className="h-3.5 w-3.5 text-[#A1A1AA]" />
                        </button>
                      )}
                      <div className="relative">
                        {flash && (
                          <span className="animate-habit-float-up pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 text-[15px] font-bold text-[#16A34A]">
                            +1
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => tap(h)}
                          className={[
                            "flex h-10 min-w-[88px] items-center justify-center gap-1.5 rounded-xl px-3 text-[12px] font-semibold text-white shadow-sm",
                            "transition-all duration-200 active:scale-95",
                            flash
                              ? "scale-105 bg-[#16A34A] shadow-[0_5px_14px_rgba(22,163,74,0.25)]"
                              : "bg-[var(--color-primary)] hover:bg-[#1d4ed8]",
                          ].join(" ")}
                          aria-label={`记一次「${h.title}」`}
                        >
                          {flash ? (
                            <Check className="h-4 w-4" strokeWidth={3} />
                          ) : (
                            <Plus className="h-4 w-4" strokeWidth={3} />
                          )}
                          {flash ? "记下了" : count > 0 ? "再记一次" : "我做了"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {activeCelebration && (
                  <div
                    key={activeCelebration.logId}
                    className="animate-habit-celebrate-in relative mt-2 overflow-hidden rounded-[12px] border border-[#BBF7D0] bg-[#F0FDF4] p-3"
                    role="status"
                  >
                    <button
                      type="button"
                      onClick={() => dismissCelebration()}
                      className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-[#86A690] hover:bg-white/70"
                      aria-label="收起完成反馈"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                    <div className="flex items-start gap-2.5 pr-6">
                      <div className="animate-habit-check-burst relative flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#16A34A] text-white">
                        <Check className="h-4 w-4" strokeWidth={3} />
                        <span className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-[#60A5FA]" />
                        <span className="absolute -bottom-0.5 -left-1 h-1 w-1 rounded-full bg-[#F59E0B]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-bold text-[#166534]">{activeCelebration.headline}</p>
                        <p className="mt-0.5 text-[11px] leading-relaxed text-[#3F6650]">
                          {activeCelebration.detail}
                        </p>
                      </div>
                    </div>

                    <div className="mt-2.5 border-t border-[#DCFCE7] pt-2.5">
                      <p className="text-[10px] font-medium text-[#4F6F5B]">
                        {activeCelebration.impact ? "正向变化也记下来了" : "做完后，有什么正向变化？（可选）"}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {POSITIVE_IMPACTS.map((impact) => {
                          const selected = activeCelebration.impact === impact;
                          return (
                            <button
                              key={impact}
                              type="button"
                              onClick={() => chooseImpact(impact)}
                              aria-pressed={selected}
                              className={[
                                "rounded-full border px-2.5 py-1 text-[10px] font-medium transition-all active:scale-95",
                                selected
                                  ? "border-[#16A34A] bg-[#16A34A] text-white"
                                  : "border-[#BBF7D0] bg-white text-[#3F6650] hover:border-[#4ADE80]",
                              ].join(" ")}
                            >
                              {selected && <Check className="mr-1 inline h-3 w-3" strokeWidth={3} />}
                              {impact}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      <ConfirmDialog
        isOpen={confirmRemove !== null}
        title="移出习惯表？"
        description={
          confirmRemove
            ? confirmRemove.behaviorId
              ? hasLogs(confirmRemove.id)
                ? `「${confirmRemove.title}」不再出现在这儿。打卡记录会留着，以后从焦点地图再加回来还能接上。行为本身还在焦点地图上，不会删。`
                : `「${confirmRemove.title}」不再出现在这儿。行为本身还在焦点地图上，随时能再加回来。`
              : hasLogs(confirmRemove.id)
                ? `「${confirmRemove.title}」是你直接加的，没有对应的行为卡。移出后打卡记录会留着，但要再养它得重新加一遍。`
                : `「${confirmRemove.title}」是你直接加的，移出后就没了（可以随时再写一遍）。`
            : undefined
        }
        confirmLabel="移出"
        onConfirm={() => {
          if (confirmRemove) onDeleteHabit(confirmRemove.id);
          setConfirmRemove(null);
        }}
        onCancel={() => setConfirmRemove(null)}
      />
    </div>
  );
}
