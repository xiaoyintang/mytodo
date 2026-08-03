"use client";

import { useState } from "react";
import type { BehaviorCard, ISODate, Task } from "@/components/todo/types";
import { addDays, toISODate } from "@/components/todo/date";
import { CalendarPlus, Check } from "lucide-react";

type Props = {
  card: BehaviorCard;
  tasks: Task[];
  onSchedule: (cardId: string, title: string, date: ISODate) => void;
};

function cnDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(m)}月${Number(d)}日`;
}

/** 一次性任务的出口：挑个日子，直接写进日视图 */
export default function ScheduleOnetime({ card, tasks, onSchedule }: Props) {
  const [open, setOpen] = useState(false);
  const scheduled = card.taskId ? tasks.find((t) => t.id === card.taskId) : undefined;

  if (scheduled) {
    return (
      <span className="flex items-center gap-1 text-[11px] text-[var(--color-success)] flex-shrink-0">
        <Check className="w-3 h-3" />
        已排到 {cnDate(scheduled.date)}
        {scheduled.status === "done" ? " · 已完成" : ""}
      </span>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 px-2 py-1 rounded-md border border-[#4F46E5] text-[11px] font-medium text-[#4F46E5] hover:bg-[#EEF2FF] transition-colors flex-shrink-0"
      >
        <CalendarPlus className="w-3 h-3" />
        排到某天
      </button>
    );
  }

  const today = toISODate(new Date());
  const tomorrow = toISODate(addDays(new Date(), 1));

  return (
    <div className="flex items-center gap-1 flex-shrink-0">
      {(
        [
          ["今天", today],
          ["明天", tomorrow],
        ] as Array<[string, ISODate]>
      ).map(([label, date]) => (
        <button
          key={label}
          type="button"
          onClick={() => {
            onSchedule(card.id, card.text, date);
            setOpen(false);
          }}
          className="px-2 py-1 rounded-md bg-[#4F46E5] text-white text-[11px] font-medium hover:opacity-90 transition-opacity"
        >
          {label}
        </button>
      ))}
      <input
        type="date"
        onChange={(e) => {
          if (!e.target.value) return;
          onSchedule(card.id, card.text, e.target.value as ISODate);
          setOpen(false);
        }}
        className="w-[26px] px-0 py-1 rounded-md border border-[var(--color-border)] text-[11px] bg-white"
        title="选个日子"
      />
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="px-1.5 py-1 text-[11px] text-[var(--color-text-tertiary)]"
      >
        取消
      </button>
    </div>
  );
}
