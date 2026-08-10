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
          className="flex items-center gap-2.5 rounded-[11px] border border-[#BBF7D0] bg-gradient-to-r from-[#F0FDF4] to-white px-3 py-2.5"
          aria-live="polite"
        >
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[#16A34A] text-white">
            <Sparkles className="h-3.5 w-3.5" strokeWidth={2.5} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-semibold text-[var(--color-text-primary)]">
              今天已有 <strong className="tabular-nums text-[#15803D]">{todayActionCount}</strong> 次行动发生
            </p>
            <p className="mt-0.5 truncate text-[10px] text-[var(--color-text-tertiary)]">
              {todayTargetTitles.length > 0
                ? `正在推动「${todayTargetTitles.slice(0, 2).join("」「")}」`
                : `${todayActiveHabits.length} 个习惯已经从“想做”变成“做过”`}
            </p>
          </div>
          {todayImpacts[0] && (
            <span className="flex-shrink-0 rounded-full border border-[#BBF7D0] bg-white px-2 py-0.5 text-[10px] font-medium text-[#15803D]">
              {todayImpacts[0]}
            </span>
          )}
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

          {!isShut(g.key) && (
            <div className="overflow-hidden rounded-[11px] border border-[var(--color-border)] bg-white divide-y divide-[var(--color-border)]">
              {g.items.map((h) => {
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
                const statusText = isDuration
                  ? count > 0
                    ? (ledger?.minutes ?? 0) > 0
                      ? `今天 ${formatMinutes(ledger?.minutes ?? 0)}`
                      : `今天 ${count} 次`
                    : "今天未记录"
                  : count > 0
                    ? `今天 ${count} 次`
                    : "今天未发生";

                return (
                  <div
                    key={h.id}
                    className={[
                      "flex min-h-[66px] w-full items-center gap-2 px-2.5 py-2 transition-colors duration-300",
                      flash ? "animate-habit-glow bg-[#F0FDF4]" : count > 0 ? "bg-[#FCFFFD]" : "bg-white",
                    ].join(" ")}
                  >
                    <div className="relative flex-shrink-0">
                      {flash && (
                        <span className="animate-habit-float-up pointer-events-none absolute -top-3 left-1/2 z-10 -translate-x-1/2 text-[13px] font-bold text-[#16A34A]">
                          +1
                        </span>
                      )}
                      {isDuration ? (
                        <button
                          type="button"
                          onClick={() => onToggleMeasure(h.id)}
                          className={[
                            "flex h-9 w-9 items-center justify-center rounded-full border transition-colors",
                            count > 0
                              ? "border-[#16A34A] bg-[#16A34A] text-white"
                              : "border-[var(--color-border)] bg-[var(--color-bg-gray-lighter)] text-[var(--color-text-secondary)]",
                          ].join(" ")}
                          title="按时长记，成绩来自「记录」。点击切换为计次"
                          aria-label={`「${h.title}」按时长记录，点击切换为计次`}
                        >
                          <Clock className="h-4 w-4" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => tap(h)}
                          className={[
                            "flex h-9 w-9 items-center justify-center rounded-full border transition-all duration-200 active:scale-90",
                            count > 0 || flash
                              ? "border-[#16A34A] bg-[#16A34A] text-white shadow-[0_3px_10px_rgba(22,163,74,0.2)]"
                              : "border-[var(--color-primary)] bg-white text-[var(--color-primary)] hover:bg-[var(--color-primary-light)]",
                          ].join(" ")}
                          aria-label={`记一次「${h.title}」`}
                          title={count > 0 ? "再记一次" : "我做了"}
                        >
                          {count > 0 || flash ? (
                            <Check className="h-4 w-4" strokeWidth={3} />
                          ) : (
                            <Plus className="h-4 w-4" strokeWidth={3} />
                          )}
                        </button>
                      )}
                      {!isDuration && count > 1 && (
                        <span className="absolute -right-1.5 -top-1 flex min-w-[16px] h-4 items-center justify-center rounded-full border border-white bg-[#15803D] px-1 text-[8px] font-bold text-white">
                          {count}
                        </span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      {editing ? (
                        <div className="flex w-full items-center gap-1">
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
                            placeholder="完成什么动作之后？"
                            autoFocus
                            className="min-w-0 flex-1 rounded-md border border-[var(--color-primary)] bg-white px-2 py-1.5 text-[11px] focus:outline-none"
                          />
                          <span className="flex-shrink-0 text-[9px] text-[var(--color-text-tertiary)]">之后</span>
                        </div>
                      ) : (
                        <>
                          <span
                            className="line-clamp-2 text-[13px] font-semibold leading-snug text-[var(--color-text-primary)]"
                            title={h.title}
                          >
                            {h.title}
                          </span>
                          <div className="mt-1 flex min-w-0 items-center gap-1 text-[9px] tabular-nums text-[var(--color-text-tertiary)]">
                            {h.anchor ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditAnchor(h.id);
                                  setDraft(h.anchor ?? "");
                                }}
                                className="max-w-[105px] truncate text-left text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                                title={`在「${h.anchor}」之后`}
                              >
                                在「{h.anchor}」后
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditAnchor(h.id);
                                  setDraft("");
                                }}
                                className="flex-shrink-0 text-[var(--color-primary)]"
                              >
                                ＋锚点
                              </button>
                            )}
                            <span>·</span>
                            <span
                              key={`${h.id}-${count}`}
                              className={[
                                "flex-shrink-0",
                                count > 0 ? "font-semibold text-[#15803D]" : "",
                                flash ? "animate-habit-pop" : "",
                              ].join(" ")}
                            >
                              {statusText}
                            </span>
                            {stats.total > 0 && (
                              <>
                                <span>·</span>
                                <span className="flex-shrink-0">累计 {stats.total}</span>
                                <span>·</span>
                                <span className="truncate">30天 {stats.days30}天</span>
                              </>
                            )}
                          </div>
                        </>
                      )}
                    </div>

                    <div className="flex flex-shrink-0 items-center gap-0.5">
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
                          "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
                          todayTask?.status === "done"
                            ? "bg-[#F0FDF4] text-[#15803D]"
                            : todayTask
                              ? "bg-[var(--color-bg-gray-lighter)] text-[var(--color-text-tertiary)]"
                              : "text-[var(--color-primary)] hover:bg-[var(--color-primary-light)]",
                        ].join(" ")}
                        aria-label={
                          todayTask?.status === "done"
                            ? `「${h.title}」的今日任务已完成`
                            : todayTask
                              ? `「${h.title}」已排到今天`
                              : `把「${h.title}」排到今天`
                        }
                        title={todayTask ? "已排到今天" : "排到今天"}
                      >
                        {todayTask ? (
                          <CalendarCheck2 className="h-3.5 w-3.5" />
                        ) : (
                          <CalendarPlus className="h-3.5 w-3.5" />
                        )}
                      </button>
                      {canUndoManual && !isDuration && (
                        <button
                          type="button"
                          onClick={() => {
                            onUndoLog(h.id);
                            if (celebration?.habitId === h.id) dismissCelebration();
                          }}
                          className="flex h-8 w-7 items-center justify-center rounded-lg hover:bg-[var(--color-bg-gray-light)]"
                          aria-label="点错了，撤掉一次"
                          title="撤掉最近一次"
                        >
                          <Undo2 className="h-3.5 w-3.5 text-[#A1A1AA]" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setConfirmRemove(h)}
                        className="flex h-8 w-7 items-center justify-center rounded-lg hover:bg-[var(--color-bg-gray-light)]"
                        aria-label="移出习惯表"
                        title="移出习惯表（行为仍保留在焦点地图）"
                      >
                        <Trash2 className="h-[13px] w-[13px] text-[#A1A1AA]" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}

      {celebration && (
        <div
          key={celebration.logId}
          className="animate-habit-celebrate-in fixed bottom-4 left-1/2 z-50 w-[380px] max-w-[calc(100vw-24px)] -translate-x-1/2 overflow-hidden rounded-[14px] border border-[#86EFAC] bg-[#F0FDF4] p-3.5 shadow-[0_12px_32px_rgba(22,101,52,0.2)]"
          role="status"
        >
          <button
            type="button"
            onClick={() => dismissCelebration()}
            className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full text-[#86A690] hover:bg-white/70"
            aria-label="收起完成反馈"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <div className="flex items-start gap-2.5 pr-7">
            <div className="animate-habit-check-burst relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#16A34A] text-white">
              <Check className="h-4 w-4" strokeWidth={3} />
              <span className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-[#60A5FA]" />
              <span className="absolute -bottom-0.5 -left-1 h-1 w-1 rounded-full bg-[#F59E0B]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[10px] font-medium text-[#4F6F5B]">{celebration.title}</p>
              <p className="mt-0.5 text-[13px] font-bold text-[#166534]">{celebration.headline}</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-[#3F6650]">
                {celebration.detail}
              </p>
            </div>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-[#DCFCE7] pt-2.5">
            <span className="mr-0.5 text-[10px] font-medium text-[#4F6F5B]">
              {celebration.impact ? "正向变化" : "现在有什么感觉？"}
            </span>
            {POSITIVE_IMPACTS.map((impact) => {
              const selected = celebration.impact === impact;
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
      )}

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
