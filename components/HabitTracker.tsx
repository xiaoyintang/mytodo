"use client";

import { useState } from "react";
import type { Aspiration, Habit, HabitLog, ISODate, TimeEntry } from "@/components/todo/types";
import { formatMinutes } from "@/components/todo/time";
import { Check, Clock, Link2, Plus, Target, Trash2, Undo2 } from "lucide-react";

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
};

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
}: Props) {
  const [editAnchor, setEditAnchor] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [justTapped, setJustTapped] = useState<string | null>(null);

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
    setTimeout(() => setJustTapped((cur) => (cur === h.id ? null : cur)), 600);
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
          <div className="w-full flex items-center gap-1.5">
            <Target className="w-3 h-3 text-[var(--color-primary)] flex-shrink-0" />
            <span className="text-[11px] font-semibold text-[var(--color-text-secondary)] truncate">
              {g.title ?? "没有归属的目标"}
            </span>
            <span className="text-[10px] text-[var(--color-text-tertiary)] flex-shrink-0">
              {g.items.length}
            </span>
          </div>

          {g.items.map((h) => {
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
                    className={[
                      "text-[11px] tabular-nums flex-shrink-0 mt-[3px]",
                      count > 0 ? "text-[var(--color-primary)] font-semibold" : "text-[var(--color-text-tertiary)]",
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
                      <button
                        type="button"
                        onClick={() => tap(h)}
                        className={[
                          "w-11 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
                          "text-white transition-all active:scale-90",
                          flash ? "bg-[#16A34A] scale-105" : "bg-[var(--color-primary)] hover:bg-[#1d4ed8]",
                        ].join(" ")}
                        aria-label={`记一次「${h.title}」`}
                      >
                        {flash ? (
                          <Check className="w-4 h-4" strokeWidth={3} />
                        ) : (
                          <Plus className="w-4 h-4" strokeWidth={3} />
                        )}
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    onClick={() => onDeleteHabit(h.id)}
                    className="w-4 h-8 flex items-center justify-center flex-shrink-0"
                    aria-label="移出习惯表"
                  >
                    <Trash2 className="w-[13px] h-[13px] text-[#A1A1AA]" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
