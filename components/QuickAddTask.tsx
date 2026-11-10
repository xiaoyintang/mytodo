"use client";

import { useRef, useState, type ReactNode, type RefObject } from "react";
import { CalendarDays, Check, Clock, Flag, Mic, Plus, Sparkles, Square, Timer, X } from "lucide-react";
import { useDraftDictation } from "@/components/todo/useDraftDictation";
import type { Aspiration, ISODate, Task } from "@/components/todo/types";
import { assignTaskIdentities } from "@/components/todo/taskIdentity";
import { CN_WEEKDAY, toISODate } from "@/components/todo/date";
import type { ParsedTask } from "@/components/todo/llmtask";

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

type DraftTask = ParsedTask & { aspirationId?: string };
export default function QuickAddTask({ onCreate, date, inputRef, compact = false, showDate = false, trailingAction, localVoice = false, aspirations = [] }: {
  aspirations?: Aspiration[];
  onCreate: (task: Omit<Task, "id">) => void;
  date: ISODate;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  trailingAction?: ReactNode;
  localVoice?: boolean;
  compact?: boolean;
  showDate?: boolean;
}) {
  const localRef = useRef<HTMLTextAreaElement>(null);
  const fieldRef = inputRef ?? localRef;
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState("");
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<DraftTask[] | null>(null);
  const voice = useDraftDictation(date, setInput);
  const { phase } = voice;
  const draft = input;

  function createManual() {
    const title = input.trim();
    if (!title || parsing || phase) return;
    onCreate({ title, date, status: "todo" });
    setInput("");
    setError("");
    setPreview(null);
    fieldRef.current?.focus();
  }

  async function handleParse() {
    const text = input.trim();
    if (!text || parsing || phase) return;
    setParsing(true);
    setError("");
    setPreview(null);
    const tasks = await fetchAITasks(text);
    setParsing(false);
    if (!tasks) {
      setError("AI 暂时不可用，可点击加号直接添加原文");
      return;
    }
    if (tasks.length === 0) {
      setError('没识别出任务，换个说法，如"明天下午3点开会"');
      return;
    }
    setPreview(assignTaskIdentities(tasks, text, aspirations));
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
        ...(t.aspirationId && aspirations.some(a => a.id === t.aspirationId && !a.archived) ? { aspirationId: t.aspirationId } : {}),
        targetMinutes: t.targetMinutes,
        ...(t.steps?.length ? { subtasks: t.steps.map((title) => ({
          id: crypto.randomUUID(), title: title.trim(), done: false,
        })) } : {}),
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

  function updatePreview(i: number, updates: Partial<DraftTask>) {
    setPreview((current) =>
      current?.map((task, index) => index === i ? { ...task, ...updates } : task) ?? null,
    );
  }

  const canCreatePreview = Boolean(
    preview?.length && preview.every((task) => task.title.trim() && /^\d{4}-\d{2}-\d{2}$/.test(task.date) && (!task.endTime || task.startTime) && (!task.steps || task.steps.every((step) => step.trim()))),
  );

  return (
    <div className="w-full flex flex-col gap-2">
      {compact && !editing ? (
        <button type="button" onClick={() => setEditing(true)}
          aria-label={`在 ${date} 添加任务`}
          className="flex min-h-9 w-full items-center gap-1.5 rounded-md px-2 text-left text-[12px] text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-bg-gray-light)] hover:text-[var(--color-primary)]">
          <Plus className="h-3.5 w-3.5" />添加任务
        </button>
      ) : <div className={compact ? "flex items-start gap-1.5" : "flex flex-col gap-1.5 sm:flex-row sm:items-start"}>
        <div className={`relative min-w-0 sm:flex-1 ${compact ? "flex-1" : ""}`}>
          <div aria-hidden="true" className={`invisible max-h-48 overflow-hidden whitespace-pre-wrap [overflow-wrap:anywhere] rounded-lg border border-transparent px-3 py-2 text-base leading-6 sm:text-sm sm:leading-6 ${compact ? "min-h-10" : "min-h-16"}`}>{draft + "\u200b"}</div>
        <textarea
          ref={fieldRef}
          autoFocus={compact}
          aria-label={compact ? `${date} 的任务标题` : "新任务标题"}
          rows={compact ? 1 : 2}
          value={draft}
          readOnly={!!phase}
          disabled={parsing}
          onBlur={() => { if (compact && !input.trim()) setEditing(false); }}
          onChange={(e) => {
            setInput(e.target.value);
            setError("");
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || e.keyCode === 229) return;
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); return handleParse(); }
            if (e.key === "Escape" && compact) { setInput(""); setEditing(false); }
          }}
          placeholder="写下任务，回车 AI 识别；加号直接添加"
          aria-busy={parsing}
          className="absolute inset-0 h-full w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-white)] px-3 py-2 text-base leading-6 sm:text-sm sm:leading-6 placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
        />
        </div>
        <div className="flex shrink-0 items-center justify-end gap-1.5">
        {localVoice && <button type="button" onClick={() => voice.toggle(() => { setError(""); setPreview(null); })} disabled={parsing || phase === "finishing"}
          aria-label={voice.aria} aria-pressed={!!phase}
          className="flex min-h-10 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-[var(--color-primary)] hover:bg-[var(--color-primary-light)] disabled:opacity-50">
          {phase ? <Square className="size-4" /> : <Mic className="size-4" />}
          {voice.label}
        </button>}
        <button type="button" onClick={createManual} disabled={!input.trim() || parsing || !!phase}
          aria-label="直接添加任务" data-full-text="直接添加，不经过 AI"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary)] text-white transition-opacity disabled:opacity-35">
          <Plus className="h-4 w-4" />
        </button>
        {!compact && <button
          type="button"
          aria-label="用 AI 解析复杂安排"
          data-full-text="用 AI 解析时间、重复、任务步骤或多条任务"
          onClick={handleParse}
          disabled={!input.trim() || parsing || !!phase}
          className={[
            "flex h-9 items-center gap-1 rounded-lg px-2.5 text-[12px] font-semibold transition-colors whitespace-nowrap",
            input.trim() && !parsing
              ? "border border-[var(--color-border)] text-[var(--color-primary)] hover:bg-[var(--color-primary-light)]"
              : "bg-[var(--color-bg-gray-light)] text-[var(--color-text-tertiary)] cursor-not-allowed",
          ].join(" ")}
        >
          <Sparkles className="h-3.5 w-3.5" />
          {parsing ? "解析中" : "AI"}
        </button>}
        {trailingAction}
        </div>
      </div>}
      {localVoice && <div role="status" aria-live={phase === "listening" ? "off" : "polite"} className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
        {voice.help}
        {phase && phase !== "permission" && <button type="button" onClick={voice.discard} className="shrink-0 underline">放弃本次听写</button>}
      </div>}
      {compact && parsing && <span role="status" className="text-[12px] text-[var(--color-text-tertiary)]">AI 解析中…</span>}
      {showDate && <span className="text-[10px] text-[var(--color-text-tertiary)]">加号直接添加到 {date.slice(5).replace("-", "/")} · 也可在下方每天的卡片里添加</span>}

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

              <div className="ml-2 border-l border-[var(--color-border)] pl-3">
                {!!t.steps?.length && <p className="mb-1 text-[11px] text-[var(--color-text-tertiary)]">{t.steps.length} 个步骤 · 创建后均为待办</p>}
                {t.steps?.map((step, stepIndex) => (
                  <div key={stepIndex} className="flex items-start gap-1">
                    <span className="pt-2 text-[11px] tabular-nums text-[var(--color-text-tertiary)]">{stepIndex + 1}.</span>
                    <textarea
                      rows={2}
                      value={step}
                      aria-label={`第 ${i + 1} 个任务的第 ${stepIndex + 1} 个步骤`}
                      onChange={(event) => updatePreview(i, { steps: t.steps?.map((value, index) => index === stepIndex ? event.target.value : value) })}
                      className="min-w-0 flex-1 resize-y rounded-md border border-transparent px-2 py-1.5 text-[12px] text-[var(--color-text-secondary)] outline-none hover:border-[var(--color-border)] focus:border-[var(--color-primary)]"
                    />
                    <button type="button" aria-label={`移除第 ${i + 1} 个任务的第 ${stepIndex + 1} 个步骤`}
                      onClick={() => updatePreview(i, { steps: t.steps?.filter((_, index) => index !== stepIndex) })}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-gray-light)]">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <button type="button" aria-label={`为第 ${i + 1} 个任务添加步骤`}
                  onClick={() => updatePreview(i, { steps: [...(t.steps ?? []), ""] })}
                  className="flex min-h-9 items-center gap-1 text-[11px] text-[var(--color-primary)]">
                  <Plus className="h-3 w-3" />添加步骤
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <label className="flex h-8 max-w-full items-center gap-1 rounded-md border border-[var(--color-border)] px-2 text-[11px] text-[var(--color-text-secondary)]">
                  身份
                  <select aria-label={`第 ${i + 1} 个任务归属身份`} value={t.aspirationId ?? ""}
                    onChange={e => updatePreview(i, { aspirationId: e.target.value || undefined, identityName: undefined })}
                    className="max-w-40 bg-transparent">
                    <option value="">未归属</option>
                    {aspirations.filter(a => !a.archived).map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
                  </select>
                </label>
                {t.identityName && !t.aspirationId && !aspirations.some(a => !a.archived && a.title === t.identityName) &&
                  <span className="text-[11px] text-[var(--color-text-secondary)]">没找到「{t.identityName}」，可以手选</span>}
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
            <p className="text-[11px] text-[var(--color-danger)]">请补全标题、日期和步骤（不用的步骤可移除）；填写结束时间时也需要填写开始时间。</p>
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
