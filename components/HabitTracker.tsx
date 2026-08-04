"use client";

import { useState } from "react";
import type { Aspiration, Habit, HabitLog, ISODate, TimeEntry } from "@/components/todo/types";
import { formatMinutes } from "@/components/todo/time";
import { Check, ChevronDown, ChevronRight, Clock, Plus, Target, Trash2, Undo2 } from "lucide-react";
import { useLocalStorageState } from "@/components/todo/storage";
import ConfirmDialog from "@/components/ConfirmDialog";

type Props = {
  aspirations: Aspiration[];
  habits: Habit[];
  logs: HabitLog[];
  entries: TimeEntry[];
  today: ISODate;
  onLog: (habitId: string) => void;
  onUndoLog: (habitId: string) => void;
  onSetAnchor: (habitId: string, anchor: string) => void;
  onToggleMeasure: (habitId: string) => void;
  onDeleteHabit: (habitId: string) => void;
  hasLogs: (habitId: string) => boolean;
};

const EMPTY_COLLAPSED: string[] = [];

/** 时长型习惯今天的成绩：直接从时间台账里按同名记录算，不要求打第二次卡 */
function fromLedger(habit: Habit, entries: TimeEntry[], today: ISODate) {
  const title = habit.title.trim();
  const hit = entries.filter((e) => e.date === today && e.title.trim() === title);
  return { count: hit.length, minutes: hit.reduce((s, e) => s + e.minutes, 0) };
}

export default function HabitTracker({
  aspirations,
  habits,
  logs,
  entries,
  today,
  onLog,
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
  const [confirmRemove, setConfirmRemove] = useState<Habit | null>(null);

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

  function tap(h: Habit) {
    onLog(h.id);
    // 点一下要有回应——这一下就是奖励本身（福格的「庆祝」）
    setJustTapped(h.id);
    try {
      navigator.vibrate?.(12); // 安卓上多一层触感；iOS 不支持，静默忽略
    } catch {
      /* ignore */
    }
    setTimeout(() => setJustTapped((cur) => (cur === h.id ? null : cur)), 750);
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
      if (h.measure === "duration") return sum + fromLedger(h, entries, today).count;
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
          做了就点一下 · 不看连续天数
        </span>
      </div>

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
            const ledger = isDuration ? fromLedger(h, entries, today) : null;
            const count = isDuration
              ? (ledger?.count ?? 0)
              : logs.filter((l) => l.habitId === h.id && l.date === today).length;
            const flash = justTapped === h.id;
            const editing = editAnchor === h.id;

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

                <div className="w-full flex items-start gap-1.5">
                  <span className="flex-1 min-w-0 text-[13px] font-medium text-[var(--color-text-primary)] leading-snug break-words">
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

                  {/* 今天的成绩，一小段，不单独占行 */}
                  <span
                    key={`${h.id}-${count}`}
                    className={[
                      "text-[11px] tabular-nums flex-shrink-0 mt-[3px]",
                      count > 0 ? "text-[var(--color-primary)] font-semibold" : "text-[var(--color-text-tertiary)]",
                      flash ? "animate-habit-pop text-[#16A34A]" : "",
                    ].join(" ")}
                  >
                    {isDuration
                      ? count > 0
                        ? `${count}次 ${formatMinutes(ledger?.minutes ?? 0)}`
                        : "记录里记"
                      : count > 0
                        ? `${count}次`
                        : "—"}
                  </span>

                  {isDuration ? (
                    <button
                      type="button"
                      onClick={() => onToggleMeasure(h.id)}
                      className="w-9 h-8 rounded-lg bg-[var(--color-bg-gray-lighter)] border border-[var(--color-border)] flex items-center justify-center flex-shrink-0"
                      title="按时长记（成绩来自「记录」）。点这里改成点一下计次"
                    >
                      <Clock className="w-3.5 h-3.5 text-[var(--color-text-tertiary)]" />
                    </button>
                  ) : (
                    <>
                      {count > 0 && (
                        <button
                          type="button"
                          onClick={() => onUndoLog(h.id)}
                          className="w-6 h-8 flex items-center justify-center flex-shrink-0"
                          aria-label="点错了，撤掉一次"
                          title="点错了，撤掉一次"
                        >
                          <Undo2 className="w-3.5 h-3.5 text-[#A1A1AA]" />
                        </button>
                      )}
                      <div className="relative flex-shrink-0">
                        {flash && (
                          <span className="animate-habit-float-up pointer-events-none absolute -top-1 left-1/2 -translate-x-1/2 text-[15px] font-bold text-[#16A34A]">
                            +1
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => tap(h)}
                          className={[
                            "w-11 h-8 rounded-lg flex items-center justify-center",
                            "text-white transition-all duration-200 active:scale-90",
                            flash ? "bg-[#16A34A] scale-110" : "bg-[var(--color-primary)] hover:bg-[#1d4ed8]",
                          ].join(" ")}
                          aria-label={`记一次「${h.title}」`}
                        >
                          {flash ? (
                            <Check className="w-4 h-4" strokeWidth={3} />
                          ) : (
                            <Plus className="w-4 h-4" strokeWidth={3} />
                          )}
                        </button>
                      </div>
                    </>
                  )}

                  <button
                    type="button"
                    onClick={() => setConfirmRemove(h)}
                    className="w-4 h-8 flex items-center justify-center flex-shrink-0"
                    aria-label="移出习惯表"
                    title="移出习惯表（行为还在焦点地图上，随时能加回来）"
                  >
                    <Trash2 className="w-[13px] h-[13px] text-[#A1A1AA]" />
                  </button>
                </div>
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
