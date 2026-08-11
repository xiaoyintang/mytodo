"use client";

import { useState } from "react";
import { Sparkles, X, Check, Flag, Timer } from "lucide-react";
import type { ISODate, Task } from "@/components/todo/types";
import { CN_WEEKDAY, parseISODate, toISODate } from "@/components/todo/date";
import { formatMinutes } from "@/components/todo/time";

type ParsedTask = {
  title: string;
  date: string;
  startTime?: string;
  endTime?: string;
  priority?: "high";
  targetMinutes?: number;
};

// AI 建任务请求：8 秒超时 + 失败重试一次
async function fetchAITasks(text: string): Promise<ParsedTask[] | null> {
  const now = new Date();
  const today = toISODate(now);
  const weekday = CN_WEEKDAY[now.getDay()];
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
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
    }
  }
  return null;
}

function dateLabel(d: string): string {
  const today = toISODate(new Date());
  if (d === today) return "今天";
  const date = parseISODate(d);
  return `${date.getMonth() + 1}/${date.getDate()} ${CN_WEEKDAY[date.getDay()]}`;
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
    if (!preview) return;
    for (const t of preview) {
      onCreate({
        title: t.title,
        date: t.date as ISODate,
        status: "todo",
        startTime: t.targetMinutes ? undefined : t.startTime,
        endTime: t.targetMinutes ? undefined : t.endTime,
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
            if (e.key === "Enter") handleParse();
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
          <span className="text-[12px] font-medium text-[var(--color-text-secondary)]">
            识别出 {preview.length} 个任务，确认后创建
          </span>
          {preview.map((t, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-[var(--color-border)]">
              <div className="flex-1 flex flex-col min-w-0">
                <span
                  className="truncate text-[13px] font-medium text-[var(--color-text-primary)]"
                  data-full-text={t.title}
                >
                  {t.title}
                </span>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] text-[var(--color-text-tertiary)]">{dateLabel(t.date)}</span>
                  {t.targetMinutes ? (
                    <span className="flex items-center gap-0.5 text-[11px] font-medium text-[var(--color-primary)]">
                      <Timer className="w-3 h-3" />
                      当天待办 · {formatMinutes(t.targetMinutes)}
                    </span>
                  ) : t.startTime ? (
                    <span className="text-[11px] text-[var(--color-text-tertiary)]">
                      {t.startTime}
                      {t.endTime ? ` - ${t.endTime}` : ""}
                    </span>
                  ) : (
                    <span className="text-[11px] font-medium text-[var(--color-primary)]">当天待办</span>
                  )}
                  {t.priority === "high" && (
                    <span className="flex items-center gap-0.5 text-[10px] font-medium text-[var(--color-danger)]">
                      <Flag className="w-3 h-3" fill="currentColor" strokeWidth={0} />
                      高优
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => removePreview(i)}
                className="w-6 h-6 flex items-center justify-center flex-shrink-0"
              >
                <X className="w-4 h-4 text-[var(--color-text-tertiary)]" />
              </button>
            </div>
          ))}
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
              className="flex items-center gap-1 px-4 py-1.5 text-[12px] bg-[var(--color-primary)] text-white rounded hover:bg-[#1d4ed8] transition-colors font-medium"
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
