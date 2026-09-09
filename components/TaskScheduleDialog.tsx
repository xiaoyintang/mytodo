"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, X } from "lucide-react";
import TimePicker from "@/components/TimePicker";
import type { ISODate, Task } from "@/components/todo/types";
import { addDays, parseISODate, startOfWeek, toISODate } from "@/components/todo/date";

export type TaskSchedule = Pick<Task, "date" | "startTime" | "endTime" | "targetMinutes">;

export default function TaskScheduleDialog({ task, today, focusTime, onApply, onClose }: {
  task: Task;
  today: ISODate;
  focusTime: boolean;
  onApply: (schedule: TaskSchedule) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const dateInput = useRef<HTMLInputElement>(null);
  const [date, setDate] = useState(task.date);
  const [start, setStart] = useState(task.startTime ?? "");
  const [end, setEnd] = useState(task.endTime ?? "");
  const [error, setError] = useState("");
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement as HTMLElement | null;
    element?.showModal();
    if (focusTime) element?.querySelector<HTMLInputElement>("[data-time-picker] input")?.focus();
    return () => {
      element?.close();
      if (previous?.isConnected) previous.focus();
    };
  }, [focusTime]);

  function apply(nextDate: ISODate) {
    const currentStart = start;
    const currentEnd = end;
    if (!nextDate || (currentEnd && !currentStart)) {
      setError(!nextDate ? "请选择日期" : "请填写开始时间，或清除结束时间");
      return;
    }
    onApply({ date: nextDate, startTime: currentStart || undefined, endTime: currentEnd || undefined,
      targetMinutes: currentStart ? undefined : task.targetMinutes });
  }

  const shortcuts: Array<[string, ISODate]> = [
    ["今天", today],
    ["明天", toISODate(addDays(parseISODate(today), 1))],
    ["下周一", toISODate(addDays(startOfWeek(parseISODate(today)), 7))],
  ];

  return createPortal(
    <dialog ref={dialog} aria-labelledby="task-schedule-title" data-no-tab-swipe
      onCancel={onClose}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      className="ui-sheet fixed inset-x-0 bottom-0 top-auto m-0 mx-auto w-full max-w-[360px] overflow-visible bg-[var(--color-bg-white)] p-4 text-[var(--color-text-primary)] backdrop:bg-black/20 sm:inset-0 sm:m-auto">
      <div className="mx-auto mb-3 h-1 w-8 rounded-full bg-[var(--color-border)] sm:hidden" />
      <div className="mb-3 flex items-center gap-2">
        <h2 id="task-schedule-title" className="flex-1 text-[13px] font-semibold">调整安排</h2>
        <button type="button" onClick={onClose} aria-label="关闭改期" className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[var(--color-bg-gray-light)]"><X className="h-4 w-4" /></button>
      </div>
      <p className="mb-3 truncate text-[12px] text-[var(--color-text-secondary)]" data-full-text={task.title}>{task.title}</p>
      <div className="mb-3 grid grid-cols-3 gap-1.5">
        {shortcuts.map(([label, day]) => <button key={label} type="button" onClick={() => apply(day)}
          className="rounded-md bg-[var(--color-bg-gray-light)] py-2 text-[12px] font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-primary-light)] hover:text-[var(--color-primary)]">{label}</button>)}
      </div>
      <form onSubmit={(event) => { event.preventDefault(); apply((dateInput.current?.value || date) as ISODate); }}>
        <label className="flex items-center gap-2 rounded-[10px] border border-[var(--color-border)] px-3 py-2 text-[12px] text-[var(--color-text-secondary)]">
          <CalendarDays className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-tertiary)]" />
          <span className="sr-only">任务日期</span>
          <input ref={dateInput} type="date" required value={date} onChange={(event) => { setDate(event.target.value as ISODate); setError(""); }} className="min-w-0 flex-1 bg-transparent text-[12px] text-[var(--color-text-primary)] outline-none" />
        </label>
        <div className="mt-3 rounded-[10px] bg-[var(--color-bg-gray-lighter)] p-3">
          <div className="mb-2 flex items-center justify-between text-[11px]">
            <span className="text-[var(--color-text-secondary)]">时间 <span className="text-[var(--color-text-tertiary)]">· 可选</span></span>
            {(start || end) && <button type="button" onClick={() => { setStart(""); setEnd(""); setError(""); }} className="text-[var(--color-primary)]">不限时段</button>}
          </div>
          <div className="flex items-center gap-2">
            <TimePicker value={start} onChange={(value) => { setStart(value); setError(""); }} placeholder="开始时间" label="开始时间" />
            <span className="text-[var(--color-text-tertiary)]">–</span>
            <TimePicker value={end} onChange={(value) => { setEnd(value); setError(""); }} placeholder="结束时间" label="结束时间" />
          </div>
        </div>
        {task.targetMinutes && start && <p className="mt-2 text-[11px] text-[var(--color-text-secondary)]">设置固定时间后，将取消原来的时长目标。</p>}
        {start && end && end < start && <p className="mt-2 text-[11px] text-[var(--color-text-secondary)]">结束时间为次日 {end}</p>}
        {error && <p role="alert" className="mt-2 text-[12px] text-[var(--color-danger)]">{error}</p>}
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-[10px] text-[var(--color-text-tertiary)]">仅改日期时保留原时间</span>
          <button type="submit" className="rounded-md bg-[var(--color-primary)] px-4 py-1.5 text-[12px] font-medium text-white">保存</button>
        </div>
      </form>
    </dialog>, document.body,
  );
}
