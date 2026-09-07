"use client";

import { useState } from "react";
import { CalendarDays, Check, Clock, Flag, Sparkles, Timer, X } from "lucide-react";
import type { ISODate, Task } from "@/components/todo/types";
import { CN_WEEKDAY, toISODate } from "@/components/todo/date";

type ParsedTask = {
  title: string;
  date: string;
  startTime?: string;
  endTime?: string;
  priority?: "high";
  targetMinutes?: number;
};

// 比服务端 8 秒超时多留一点响应时间；失败重试一次。
async function fetchAITasks(text: string): Promise<ParsedTask[] | null> {
  const now = new Date();
  const today = toISODate(now);
  const weekday = CN_WEEKDAY[now.getDay()];
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const res = await fetch("/api/parse-task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, today, weekday }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.status === 501) return null;
      if (res.ok) {
        const d = await res.json();
        if (Array.isArray(d.tasks)) return d.tasks;
      }
    } catch {
      /* 超时/网络 → 重试 */
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

export default function QuickAddTask({ onCreate }: { onCreate: (task: Omit<Task, "id">) => void }) {
  const [input, setInput] = useState("");
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<ParsedTask[] | null>(null);

  async function handleParse() {
    const text = input.trim();
    if (!text || parsing) return;
    setParsing(true);
    setError("");
    setPreview(null);
    const tasks = await fetchAITasks(text);
    setParsing(false);
    if (!tasks) {
      setError("AI 解析失败或未配置，可点「新增」手动建");
      return;
    }
    if (tasks.length === 0) {
      setError('没识别出任务，换个说法，如"明天下午3点开会"');
      return;
    }
    setPreview(tasks);
  }

  function handleConfirm() {
    if (!preview || !canCreatePreview) return;
    for (const t of preview) {
      onCreate({
        title: t.title.trim(),
        date: t.date as ISODate,
        status: "todo",
        startTime: t.targetMinutes ? undefined : t.startTime || undefined,
        endTime: t.targetMinutes ? undefined : t.endTime || undefined,
        priority: t.priority,
        targetMinutes: t.targetMinutes,
      });
    }
    setPreview(null);
    setInput("");
    setError("");
  }

  function removePreview(i: number) {
    if (!preview) return;
    const next = preview.filter((_, idx) => idx !== i);
    setPreview(next.length ? next : null);
  }

  function updatePreview(i: number, updates: Partial<ParsedTask>) {
    setPreview((current) =>
      current?.map((task, index) => index === i ? { ...task, ...updates } : task) ?? null,
    );
  }

  const canCreatePreview = Boolean(
    preview?.length && preview.every((task) => task.title.trim() && /^\d{4}-\d{2}-\d{2}$/.test(task.date) && (!task.endTime || task.startTime)),
  );

  return (
    <div className="w-full flex flex-col gap-2">
      <div className="flex gap-1.5">
        <input
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setError("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) handleParse();
          }}
          placeholder="添加任务，时间也可以直接写在这里"
          className="h-9 min-w-0 flex-1 rounded-lg border border-[var(--color-border)] bg-white px-3 text-[13px] placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
        />
        <button
          type="button"
          onClick={handleParse}
          disabled={!input.trim() || parsing}
          className={[
            "flex h-9 items-center gap-1 rounded-lg px-2.5 text-[12px] font-semibold transition-colors whitespace-nowrap",
            input.trim() && !parsing
              ? "bg-[var(--color-primary)] text-white hover:bg-[#1d4ed8]"
              : "bg-[var(--color-bg-gray-light)] text-[var(--color-text-tertiary)] cursor-not-allowed",
          ].join(" ")}
        >
          <Sparkles className="h-3.5 w-3.5" />
          {parsing ? "解析中" : "AI"}
        </button>
      </div>

      {error && <p className="text-[12px] text-[var(--color-danger)]">{error}</p>}

      {preview && (
        <div className="flex flex-col gap-2 p-3 rounded-[10px] bg-[var(--color-bg-gray-lighter)] border border-[var(--color-border)]">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[12px] font-medium text-[var(--color-text-secondary)]">
              识别出 {preview.length} 个任务
            </span>
            <span className="text-[10px] text-[var(--color-text-tertiary)]">创建前可以直接修改</span>
          </div>
          <p className="text-[10px] text-[var(--color-text-tertiary)]">留空时间表示当天完成即可；每个日期各创建一条任务。</p>
          {preview.map((t, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-lg border border-[var(--color-border)] bg-white px-2.5 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <input
                  type="text"
                  value={t.title}
                  onChange={(event) => updatePreview(i, { title: event.target.value })}
                  aria-label={`第 ${i + 1} 个任务标题`}
                  className="h-8 min-w-0 flex-1 rounded-md border border-transparent px-1.5 text-[13px] font-medium text-[var(--color-text-primary)] outline-none transition-colors hover:border-[var(--color-border)] focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]"
                />
                <button
                  type="button"
                  onClick={() => removePreview(i)}
                  className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md hover:bg-[var(--color-bg-gray-light)]"
                  aria-label={`移除第 ${i + 1} 个任务`}
                >
                  <X className="h-3.5 w-3.5 text-[var(--color-text-tertiary)]" />
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <label className="flex h-8 items-center gap-1 rounded-md border border-[var(--color-border)] px-2 text-[10px] text-[var(--color-text-tertiary)] focus-within:border-[var(--color-primary)]">
                  <CalendarDays className="h-3 w-3 flex-shrink-0" />
                  <input
                    type="date"
                    value={t.date}
                    onChange={(event) => updatePreview(i, { date: event.target.value })}
                    aria-label={`第 ${i + 1} 个任务日期`}
                    className="w-[108px] bg-transparent text-[11px] font-medium text-[var(--color-text-secondary)] outline-none"
                  />
                </label>

                <select
                  aria-label={`第 ${i + 1} 个任务时间方式`}
                  value={t.targetMinutes ? "target" : "range"}
                  onChange={(event) => updatePreview(i, event.target.value === "target"
                    ? { targetMinutes: 30, startTime: undefined, endTime: undefined }
                    : { targetMinutes: undefined })}
                  className="h-8 max-w-full rounded-md border border-[var(--color-border)] bg-white px-1 text-[11px] text-[var(--color-text-secondary)]"
                >
                  <option value="range">具体时间（可留空）</option>
                  <option value="target">只记投入时长</option>
                </select>
                {t.targetMinutes ? (
                  <label className="flex h-8 items-center gap-1 rounded-md border border-[var(--color-border)] px-2 text-[10px] text-[var(--color-text-tertiary)] focus-within:border-[var(--color-primary)]">
                    <Timer className="h-3 w-3" />
                    <input
                      type="number"
                      min="1"
                      value={t.targetMinutes}
                      onChange={(event) => updatePreview(i, { targetMinutes: Math.max(1, Number(event.target.value) || 1) })}
                      aria-label={`第 ${i + 1} 个任务目标分钟`}
                      className="w-11 bg-transparent text-[11px] font-medium tabular-nums text-[var(--color-text-secondary)] outline-none"
                    />
                    分钟
                  </label>
                ) : (
                  <>
                    <label className="flex h-8 items-center gap-1 rounded-md border border-[var(--color-border)] px-2 text-[10px] text-[var(--color-text-tertiary)] focus-within:border-[var(--color-primary)]">
                      <Clock className="h-3 w-3" />
                      开始
                      <input
                        type="time"
                        value={t.startTime ?? ""}
                        onChange={(event) => updatePreview(i, { startTime: event.target.value })}
                        aria-label={`第 ${i + 1} 个任务开始时间`}
                        className="w-[66px] bg-transparent text-[11px] font-medium tabular-nums text-[var(--color-text-secondary)] outline-none"
                      />
                    </label>
                    <label className="flex h-8 items-center gap-1 rounded-md border border-[var(--color-border)] px-2 text-[10px] text-[var(--color-text-tertiary)] focus-within:border-[var(--color-primary)]">
                      结束
                      <input
                        type="time"
                        value={t.endTime ?? ""}
                        onChange={(event) => updatePreview(i, { endTime: event.target.value })}
                        aria-label={`第 ${i + 1} 个任务结束时间`}
                        className="w-[66px] bg-transparent text-[11px] font-medium tabular-nums text-[var(--color-text-secondary)] outline-none"
                      />
                    </label>
                  </>
                )}

                <button
                  type="button"
                  onClick={() => updatePreview(i, { priority: t.priority === "high" ? undefined : "high" })}
                  aria-pressed={t.priority === "high"}
                  className={[
                    "flex h-8 items-center gap-1 rounded-md border px-2 text-[10px] font-medium transition-colors",
                    t.priority === "high"
                      ? "border-[#FECACA] bg-[#FEF2F2] text-[var(--color-danger)]"
                      : "border-[var(--color-border)] text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-gray-light)]",
                  ].join(" ")}
                >
                  <Flag className="h-3 w-3" fill={t.priority === "high" ? "currentColor" : "none"} />
                  高优
                </button>
              </div>
            </div>
          ))}
          {!canCreatePreview && (
            <p className="text-[11px] text-[var(--color-danger)]">请补全任务标题和日期；填写结束时间时也需要填写开始时间。</p>
          )}
          <div className="flex justify-end gap-2 mt-1">
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="px-3 py-1.5 text-[12px] text-[var(--color-text-secondary)] hover:bg-white rounded transition-colors"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!canCreatePreview}
              className={[
                "flex items-center gap-1 rounded px-4 py-1.5 text-[12px] font-medium transition-colors",
                canCreatePreview
                  ? "bg-[var(--color-primary)] text-white hover:bg-[#1d4ed8]"
                  : "cursor-not-allowed bg-[var(--color-bg-gray-light)] text-[var(--color-text-tertiary)]",
              ].join(" ")}
            >
              <Check className="w-3.5 h-3.5" />
              创建
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
