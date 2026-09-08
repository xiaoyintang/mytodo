"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
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
  const timeInput = useRef<HTMLInputElement>(null);
  const endInput = useRef<HTMLInputElement>(null);
  const [date, setDate] = useState(task.date);
  const [start, setStart] = useState(task.startTime ?? "");
  const [end, setEnd] = useState(task.endTime ?? "");
  const [error, setError] = useState("");
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement as HTMLElement | null;
    element?.showModal();
    (focusTime ? timeInput : dateInput).current?.focus();
    return () => {
      element?.close();
      if (previous?.isConnected) previous.focus();
    };
  }, [focusTime]);

  function apply(nextDate: ISODate) {
    const currentStart = timeInput.current?.value ?? start;
    const currentEnd = endInput.current?.value ?? end;
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
  const inputClass = "h-10 min-w-0 w-full rounded-lg border border-[var(--color-border)] bg-white px-2 text-[13px] text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none";

  return createPortal(
    <dialog ref={dialog} aria-labelledby="task-schedule-title" data-no-tab-swipe
      onCancel={onClose}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      className="fixed inset-x-0 bottom-0 top-auto m-0 mx-auto w-full max-w-[390px] rounded-t-2xl border border-[var(--color-border)] bg-white p-4 text-[var(--color-text-primary)] shadow-xl backdrop:bg-black/30 sm:inset-0 sm:m-auto sm:rounded-2xl">
      <div className="mb-3 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 id="task-schedule-title" className="text-[15px] font-semibold">{focusTime ? "修改时间" : "任务改期"}</h2>
          <p className="mt-1 truncate text-[12px] text-[var(--color-text-secondary)]" data-full-text={task.title}>{task.title}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="关闭改期" className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[var(--color-bg-gray-light)]"><X className="h-4 w-4" /></button>
      </div>
      <div className="mb-4 grid grid-cols-3 gap-2">
        {shortcuts.map(([label, day]) => <button key={label} type="button" onClick={() => apply(day)}
          className="rounded-lg bg-[var(--color-primary-light)] py-2 text-[12px] font-semibold text-[var(--color-primary)] hover:opacity-80">{label}</button>)}
      </div>
      <form onSubmit={(event) => { event.preventDefault(); apply((dateInput.current?.value || date) as ISODate); }}>
        <label className="block text-[11px] text-[var(--color-text-secondary)]">其他日期
          <input ref={dateInput} type="date" required value={date} onChange={(event) => { setDate(event.target.value as ISODate); setError(""); }} className={`${inputClass} mt-1`} />
        </label>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="text-[11px] text-[var(--color-text-secondary)]">开始时间
            <input ref={timeInput} type="time" value={start} onChange={(event) => { setStart(event.target.value); setError(""); }} className={`${inputClass} mt-1`} />
          </label>
          <label className="text-[11px] text-[var(--color-text-secondary)]">结束时间
            <input ref={endInput} type="time" value={end} onChange={(event) => { setEnd(event.target.value); setError(""); }} className={`${inputClass} mt-1`} />
          </label>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
          <span className="text-[var(--color-text-tertiary)]">改日期默认保留时间；留空则当天完成即可</span>
          <button type="button" onClick={() => { setStart(""); setEnd(""); setError(""); }} className="shrink-0 text-[var(--color-primary)]">不限时段</button>
        </div>
        {task.targetMinutes && start && <p className="mt-2 text-[11px] text-[var(--color-text-secondary)]">设置固定时间后，将取消原来的时长目标。</p>}
        {start && end && end < start && <p className="mt-2 text-[11px] text-[var(--color-text-secondary)]">结束时间为次日 {end}</p>}
        {error && <p role="alert" className="mt-2 text-[12px] text-[var(--color-danger)]">{error}</p>}
        <button type="submit" className="mt-4 h-10 w-full rounded-lg bg-[var(--color-primary)] text-[13px] font-semibold text-white">保存安排</button>
      </form>
    </dialog>, document.body,
  );
}
