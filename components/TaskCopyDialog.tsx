"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { ISODate, Task } from "@/components/todo/types";
import { addDays, CN_WEEKDAY, parseISODate, toISODate } from "@/components/todo/date";
import { validCopyDate } from "@/components/todo/taskCopy";

export default function TaskCopyDialog({ task, onApply, onClose }: {
  task: Task; onApply: (dates: ISODate[]) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const submitted = useRef(false);
  const first = toISODate(addDays(parseISODate(task.date), 1));
  const [dates, setDates] = useState<ISODate[]>([first]);
  const [customDate, setCustomDate] = useState("");
  const [error, setError] = useState("");
  const days = Array.from({ length: 7 }, (_, i) => toISODate(addDays(parseISODate(first), i)));
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement as HTMLElement | null;
    element?.showModal();
    return () => { element?.close(); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  function toggle(day: ISODate) {
    setDates(prev => prev.includes(day) ? prev.filter(value => value !== day) : [...prev, day].sort());
    setError("");
  }
  function label(day: ISODate) {
    const d = parseISODate(day);
    return `${d.getMonth() + 1}/${d.getDate()} ${CN_WEEKDAY[d.getDay()]}`;
  }
  function submit() {
    const selected = [...new Set([...dates, ...(customDate ? [customDate] : [])])];
    if (selected.some(day => !validCopyDate(day) || day === task.date)) {
      setError("请选择有效日期；原任务所在日期无需重复复制。"); return;
    }
    if (!selected.length || submitted.current) return;
    submitted.current = true;
    onApply((selected as ISODate[]).sort());
  }
  return createPortal(<dialog ref={dialog} aria-labelledby="task-copy-title" data-no-tab-swipe
    onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    className="fixed inset-x-0 bottom-0 top-auto m-0 mx-auto max-h-[85dvh] w-full max-w-[420px] overflow-y-auto rounded-t-[20px] border border-[var(--color-border)] bg-[var(--color-bg-white)] p-4 text-[var(--color-text-primary)] shadow-lg backdrop:bg-black/20 sm:inset-0 sm:m-auto sm:rounded-xl">
    <form onSubmit={e => { e.preventDefault(); submit(); }}>
      <div className="mb-3 flex items-center justify-between">
        <h2 id="task-copy-title" className="text-[14px] font-semibold">复制到…</h2>
        <button type="button" aria-label="关闭复制" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-[var(--color-bg-gray-light)]"><X className="h-4 w-4" /></button>
      </div>
      <p className="mb-3 text-[13px] font-medium break-words">{task.title}</p>
      <p className="mb-3 text-[12px] text-[var(--color-text-secondary)]">选择日期，可多选。原任务仍保留在 {label(task.date)}。</p>
      <div className="mb-3 grid grid-cols-4 gap-2">
        {days.map(day => <button type="button" key={day} aria-pressed={dates.includes(day)} onClick={() => toggle(day)}
          className={`min-h-11 rounded-lg border px-1 py-2 text-[12px] ${dates.includes(day) ? "border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]" : "border-[var(--color-border)] text-[var(--color-text-secondary)]"}`}>{label(day)}</button>)}
        <button type="button" onClick={() => { setDates(prev => [...new Set([...prev, ...days])].sort()); setError(""); }} className="min-h-11 rounded-lg text-[12px] text-[var(--color-primary)]">这七天</button>
      </div>
      <div className="mb-3 flex items-center gap-2">
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-[var(--color-border)] p-2 text-[12px]">
          <span className="shrink-0 text-[var(--color-text-secondary)]">其他日期</span>
          <input type="date" aria-label="其他复制日期" value={customDate} onChange={e => { setCustomDate(e.target.value); setError(""); }} className="min-w-0 flex-1 bg-transparent" />
        </label>
        <button type="button" onClick={() => {
          if (!validCopyDate(customDate) || customDate === task.date) { setError("请选择有效日期，且不要与原任务同一天。"); return; }
          setDates(prev => [...new Set([...prev, customDate])].sort()); setCustomDate(""); setError("");
        }} className="min-h-11 px-2 text-[12px] text-[var(--color-primary)]">加入</button>
      </div>
      {dates.filter(day => !days.includes(day)).map(day => <button key={day} type="button" onClick={() => toggle(day)} aria-label={`取消 ${day}`}
        className="mb-2 mr-2 rounded-lg bg-[var(--color-primary-light)] px-3 py-2 text-[12px] text-[var(--color-primary)]">{label(day)} ×</button>)}
      <p className="rounded-lg bg-[var(--color-bg-gray-lighter)] p-3 text-[11px] leading-relaxed text-[var(--color-text-secondary)]">保留目标 / KR、时间安排、所有步骤、最小启动和当前进度。新任务为待办；不复制计时记录、随记和当天关键任务标记。复制后各自独立修改。</p>
      {error && <p role="alert" className="mt-2 text-[12px] text-[var(--color-danger)]">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="min-h-11 rounded-lg px-4 text-[12px] text-[var(--color-text-secondary)]">取消</button>
        <button type="submit" disabled={!dates.length && !customDate} className="min-h-11 rounded-lg bg-[var(--color-primary)] px-4 text-[12px] font-medium text-white disabled:opacity-40">复制到 {new Set([...dates, ...(customDate ? [customDate] : [])]).size} 天</button>
      </div>
    </form>
  </dialog>, document.body);
}
