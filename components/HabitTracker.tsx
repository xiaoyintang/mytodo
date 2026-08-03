"use client";

import { useState } from "react";
import type { Habit, HabitLog, ISODate, TimeEntry } from "@/components/todo/types";
import { formatMinutes } from "@/components/todo/time";
import { Check, Clock, Link2, Plus, Trash2, Undo2 } from "lucide-react";

type Props = {
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
        <span className="text-[var(--color-text-primary)] text-[16px] font-semibold">今天</span>
        <span className="text-[var(--color-text-tertiary)] text-[12px]">
          做了就点一下 · 不看连续天数
        </span>
      </div>

      <div className="w-full flex flex-col gap-2">
        {live.map((h) => {
          const isDuration = h.measure === "duration";
          const ledger = isDuration ? fromLedger(h, entries, today) : null;
          const count = isDuration
            ? (ledger?.count ?? 0)
            : logs.filter((l) => l.habitId === h.id && l.date === today).length;
          const done = count > 0;
          const flash = justTapped === h.id;

          return (
            <div
              key={h.id}
              className={[
                "w-full flex flex-col gap-1.5 px-3.5 py-3 rounded-[12px] border transition-colors duration-300",
                flash
                  ? "bg-[#F0FDF4] border-[#16A34A]"
                  : done
                    ? "bg-white border-[var(--color-primary)]"
                    : "bg-white border-[var(--color-border)]",
              ].join(" ")}
            >
              {/* 锚点：在我 ___ 之后 */}
              {editAnchor === h.id ? (
                <div className="w-full flex items-center gap-2">
                  <span className="text-[11px] text-[var(--color-text-tertiary)] flex-shrink-0">在我</span>
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
                    className="flex-1 px-2 py-1 rounded border border-[var(--color-primary)] text-[12px] bg-white focus:outline-none"
                  />
                  <span className="text-[11px] text-[var(--color-text-tertiary)] flex-shrink-0">之后</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setEditAnchor(h.id);
                    setDraft(h.anchor ?? "");
                  }}
                  className="self-start text-[11px] text-left"
                >
                  {h.anchor ? (
                    <span className="text-[var(--color-text-tertiary)]">
                      在我 <span className="text-[var(--color-text-secondary)] font-medium">{h.anchor}</span> 之后
                    </span>
                  ) : (
                    <span className="text-[var(--color-primary)]">+ 配个锚点（什么之后做）</span>
                  )}
                </button>
              )}

              <div className="w-full flex items-center gap-2.5">
                <div className="flex-1 flex flex-col gap-0.5 min-w-0">
                  <span className="text-[14px] font-medium text-[var(--color-text-primary)] leading-snug">
                    {h.title}
                  </span>
                  <span className="flex items-center gap-1 text-[11px] text-[var(--color-text-tertiary)]">
                    {isDuration ? (
                      <>
                        <Link2 className="w-3 h-3" />
                        {count > 0
                          ? `今天 ${count} 次 · ${formatMinutes(ledger?.minutes ?? 0)}（来自记录）`
                          : "在「记录」里记一笔就自动算上"}
                      </>
                    ) : count > 0 ? (
                      <span className="text-[var(--color-primary)] font-semibold text-[12px]">
                        今天 {count} 次
                      </span>
                    ) : (
                      <>
                        今天还没做 ·{" "}
                        <button
                          type="button"
                          onClick={() => onToggleMeasure(h.id)}
                          className="underline hover:text-[var(--color-text-secondary)]"
                        >
                          改成按时长记
                        </button>
                      </>
                    )}
                  </span>
                </div>

                {isDuration ? (
                  <button
                    type="button"
                    onClick={() => onToggleMeasure(h.id)}
                    className="w-[52px] h-[44px] rounded-xl bg-[var(--color-bg-gray-lighter)] border border-[var(--color-border)] flex items-center justify-center flex-shrink-0 hover:bg-[var(--color-bg-gray-light)] transition-colors"
                    aria-label="改成点一下计次"
                    title="这条其实是点一下就完事的？点这里改成计次"
                  >
                    <Clock className="w-4 h-4 text-[var(--color-text-tertiary)]" />
                  </button>
                ) : (
                  <>
                    {count > 0 && (
                      <button
                        type="button"
                        onClick={() => onUndoLog(h.id)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 hover:bg-[var(--color-bg-gray-light)] transition-colors"
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
                        "w-[52px] h-[44px] rounded-xl flex items-center justify-center flex-shrink-0",
                        "text-white font-bold transition-all active:scale-90",
                        flash ? "bg-[#16A34A] scale-105" : "bg-[var(--color-primary)] hover:bg-[#1d4ed8]",
                      ].join(" ")}
                      aria-label={`记一次「${h.title}」`}
                    >
                      {flash ? <Check className="w-5 h-5" strokeWidth={3} /> : <Plus className="w-5 h-5" strokeWidth={3} />}
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={() => onDeleteHabit(h.id)}
                  className="w-[18px] h-[18px] flex items-center justify-center flex-shrink-0"
                  aria-label="移出习惯表"
                >
                  <Trash2 className="w-[15px] h-[15px] text-[#A1A1AA]" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
