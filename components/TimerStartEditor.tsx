"use client";

import { useState } from "react";
import { Clock, Pencil } from "lucide-react";
import TimePicker from "@/components/TimePicker";
import { toISODate } from "@/components/todo/date";
import { timerStartTimestamp } from "@/components/todo/timerStart";

const clock = (value: Date) => `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;

export default function TimerStartEditor({ startedAt, onAdjust }: {
  startedAt: number;
  onAdjust: (startedAt: number, expectedStart: number) => boolean;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [error, setError] = useState("");
  const start = new Date(startedAt);
  const timestamp = timerStartTimestamp(date, time);
  const invalid = timestamp === null || timestamp > Date.now();
  const label = `${toISODate(start) === toISODate(new Date()) ? "" : `${start.getMonth() + 1}月${start.getDate()}日 `}${clock(start)}`;

  function save() {
    if (timestamp === null) { setError("请填写有效的开始日期和时间"); return; }
    if (timestamp > Date.now()) { setError("开始时间不能晚于现在"); return; }
    if (!onAdjust(timestamp, startedAt)) { setError("计时已发生变化，请重新打开调整"); return; }
    setOpen(false);
  }

  if (!open) return <button type="button" aria-label="调整计时开始时间"
    onClick={() => { setDate(toISODate(start)); setTime(clock(start)); setError(""); setOpen(true); }}
    className="flex min-h-11 items-center gap-1.5 self-start rounded-lg px-2 text-[12px] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-gray-light)]">
    <Clock className="h-3.5 w-3.5" />从 {label} 开始<Pencil className="h-3 w-3" />
  </button>;

  return <section aria-label="调整计时开始时间" data-no-tab-swipe
    className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-gray-lighter)] p-3">
    <div className="mb-2 flex items-center justify-between gap-2">
      <span className="text-[13px] font-medium text-[var(--color-text-primary)]">实际开始时间</span>
      <button type="button" onClick={() => {
        const earlier = new Date((timestamp ?? startedAt) - 10 * 60000);
        setDate(toISODate(earlier)); setTime(clock(earlier)); setError("");
      }} className="min-h-11 rounded-lg px-2 text-[12px] text-[var(--color-primary)] hover:bg-[var(--color-primary-light)]">提前 10 分钟</button>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <input type="date" aria-label="计时开始日期" value={date} max={toISODate(new Date())}
        onChange={event => { setDate(event.target.value); setError(""); }}
        className="h-11 min-w-0 rounded-lg border border-[var(--color-border)] bg-white px-2 text-[13px] text-[var(--color-text-primary)]" />
      <TimePicker label="计时开始时间" value={time} onChange={value => { setTime(value); setError(""); }} />
    </div>
    <p className="mt-2 text-[11px] text-[var(--color-text-tertiary)]">保存后立即更新计时数字和本次用时，不会改动已有记录。</p>
    {(error || (timestamp !== null && invalid)) && <p role="alert" className="mt-2 text-[12px] text-[var(--color-danger)]">{error || "开始时间不能晚于现在"}</p>}
    <div className="mt-2 flex justify-end gap-2">
      <button type="button" onClick={() => setOpen(false)} className="min-h-11 rounded-lg px-3 text-[13px] text-[var(--color-text-secondary)]">取消</button>
      <button type="button" onClick={save} disabled={invalid} className="min-h-11 rounded-lg bg-[var(--color-primary)] px-3 text-[13px] font-medium text-white disabled:opacity-40">保存开始时间</button>
    </div>
  </section>;
}
