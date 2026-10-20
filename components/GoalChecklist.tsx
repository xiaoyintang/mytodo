"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { CalendarDays, Check, ChevronDown, Flag, GripVertical, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import TaskScheduleDialog, { type TaskSchedule } from "@/components/TaskScheduleDialog";
import type { BehaviorCard, GoalResult, ISODate, Task, TimeEntry } from "@/components/todo/types";
import { goalProgress, goalRetro, reorderGoalItems, type GoalItem } from "@/components/todo/goalProgress";
import { addDays, parseISODate, toISODate } from "@/components/todo/date";
import { formatMinutes } from "@/components/todo/time";

type Props = {
  goal: GoalResult;
  color: string;
  items: GoalItem[];
  behaviors: BehaviorCard[];
  entries: TimeEntry[];
  today: ISODate;
  onAdd: (title: string) => void;
  /** 用日视图同一个排期弹窗：日期 + 时间段 / 时长目标。 */
  onSchedule: (item: GoalItem, schedule: TaskSchedule) => void;
  onRename: (behaviorId: string, text: string) => void;
  /** 检查清单里写的是不是能直接做的动作；返回 false 表示 AI 不可用。 */
  onCheck: () => Promise<boolean>;
  onComplete: (item: GoalItem) => void;
  onReopen: (item: GoalItem) => void;
  onReorder: (keys: string[]) => void;
  onDelete: (behaviorId: string) => void;
  onFinish: () => void;
  onReopenGoal: () => void;
  onRetroNote: (note: string) => void;
};

function dateLabel(date: ISODate | undefined, today: ISODate): string | undefined {
  if (!date) return undefined;
  if (date === today) return "今天";
  if (date === toISODate(addDays(parseISODate(today), 1))) return "明天";
  const d = parseISODate(date);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function md(at: number): string {
  const d = new Date(at);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/**
 * 有终点的目标 = 一张有顺序的清单。**只排先后，不打分**（清单里的事缺一不可，没有"挑"的问题）。
 * 第一件没做完的就是下一步；在这里打钩 = 今天做完了（会生成一条今天已完成的任务，
 * 完成时间、经验值、成长记录都只有那一个来源）。
 */
export default function GoalChecklist({
  goal, color, items, behaviors, entries, today,
  onAdd, onSchedule, onRename, onCheck, onComplete, onReopen, onReorder, onDelete, onFinish, onReopenGoal, onRetroNote,
}: Props) {
  const [draft, setDraft] = useState("");
  const [scheduling, setScheduling] = useState<GoalItem | null>(null);
  const [renaming, setRenaming] = useState<{ key: string; text: string } | null>(null);
  const [checking, setChecking] = useState<"idle" | "busy" | "failed">("idle");
  const [showDone, setShowDone] = useState(false);
  const [drag, setDrag] = useState<{ key: string; target?: string; edge?: "before" | "after" } | null>(null);
  const [note, setNote] = useState(goal.retroNote ?? "");
  const listRef = useRef<HTMLUListElement>(null);

  const progress = goalProgress(items);
  const open = items.filter((item) => !item.done);
  const done = items.filter((item) => item.done).sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
  const finished = goal.status === "done";
  const retro = goalRetro(goal, items, entries, behaviors);
  const pct = progress.total ? (progress.done / progress.total) * 100 : 0;

  async function runCheck() {
    setChecking("busy");
    setChecking((await onCheck()) ? "idle" : "failed");
  }

  /** AI 对这件事的看法：还不是动作 / 没边界。只是提示，用户改了文字就消失。 */
  function hintOf(item: GoalItem): string | undefined {
    const card = item.behaviorId ? behaviors.find((candidate) => candidate.id === item.behaviorId) : undefined;
    if (!card?.checkedAs) return undefined;
    if (card.checkedAs === "aspiration" || card.checkedAs === "outcome") return `这还是一个结果，不是动作${card.reason ? `：${card.reason}` : ""}`;
    if (card.blocker === "endpoint") return `没有边界，不知道做到哪算完${card.reason ? `：${card.reason}` : ""}`;
    return undefined;
  }

  function draftTask(item: GoalItem): Task {
    return item.tasks.find((task) => task.status !== "done") ?? item.tasks[0]
      ?? { id: `draft-${item.key}`, title: item.title, date: today, status: "todo" };
  }

  function submit() {
    const text = draft.trim();
    if (!text) return;
    onAdd(text);
    setDraft("");
  }

  function onDragMove(event: ReactPointerEvent) {
    if (!drag) return;
    const row = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-goal-item]");
    const key = row?.dataset.goalItem;
    if (!row || !key || key === drag.key) return;
    const rect = row.getBoundingClientRect();
    setDrag({ ...drag, target: key, edge: event.clientY < rect.top + rect.height / 2 ? "before" : "after" });
  }

  function onDragEnd() {
    if (drag?.target && drag.edge) onReorder(reorderGoalItems(items, drag.key, drag.target, drag.edge));
    setDrag(null);
  }

  return (
    <section className="rounded-[12px] border border-[var(--color-border)] bg-white p-3" aria-label={`目标清单：${goal.title}`}>
      {goal.evidence && (
        <p className="mb-2 text-[11px] leading-relaxed text-[var(--color-text-secondary)]">
          <span className="font-semibold text-[var(--color-text-primary)]">完成标准：</span>{goal.evidence}
        </p>
      )}

      <div className="flex items-center gap-2">
        <span className="text-[18px] font-bold tabular-nums text-[var(--color-text-primary)]">
          {progress.done}<span className="text-[12px] font-medium text-[var(--color-text-tertiary)]"> / {progress.total}</span>
        </span>
        <span className="block h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--color-bg-gray-light)]">
          <span className="block h-full rounded-full transition-[width] duration-700" style={{ width: `${pct}%`, backgroundColor: color }} />
        </span>
        <span className="flex-shrink-0 text-[10px] text-[var(--color-text-tertiary)]">
          {finished ? `已结项 · 用时 ${retro.days} 天` : `第 ${retro.days} 天`}
        </span>
      </div>
      {!finished && open.some((item) => item.behaviorId) && (
        <div className="mt-1.5 flex items-center gap-2">
          <button type="button" onClick={runCheck} disabled={checking === "busy"}
            className="flex min-h-8 flex-shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-[#BFDBFE] bg-[var(--color-primary-light)] px-2 text-[11px] font-medium text-[var(--color-primary)] disabled:opacity-50">
            <Sparkles className={`h-3 w-3 ${checking === "busy" ? "animate-pulse" : ""}`} />
            {checking === "busy" ? "检查中…" : "检查是不是行为"}
          </button>
          <span className="text-[10px] text-[var(--color-text-tertiary)]">
            {checking === "failed" ? "AI 暂时不可用，稍后再试" : "看看写的是能直接做的动作，还是仍然是结果"}
          </span>
        </div>
      )}

      {!finished && progress.total > 0 && progress.done === progress.total && (
        <div className="mt-2 flex items-center gap-2 rounded-lg bg-[var(--color-success-light)] px-2.5 py-2">
          <Flag className="h-3.5 w-3.5 flex-shrink-0 text-[var(--color-success)]" />
          <span className="min-w-0 flex-1 text-[12px] text-[var(--color-text-primary)]">清单都做完了，可以结项了吗？</span>
          <button type="button" onClick={onFinish}
            className="min-h-8 flex-shrink-0 rounded-lg bg-[var(--color-success)] px-3 text-[12px] font-semibold text-white">
            结项
          </button>
        </div>
      )}

      {finished && (
        <div className="mt-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-gray-lighter)] p-2.5">
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 text-[12px] font-semibold text-[var(--color-text-primary)]">复盘</p>
            <button type="button" onClick={onReopenGoal}
              className="flex min-h-8 items-center gap-1 px-1 text-[11px] text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]">
              <RotateCcw className="h-3 w-3" />重新打开
            </button>
          </div>
          <p className="text-[11px] text-[var(--color-text-secondary)]">
            {md(retro.startedAt)} → {retro.endedAt ? md(retro.endedAt) : "今天"} · 用了 {retro.days} 天
            {retro.minutes > 0 ? ` · 投入 ${formatMinutes(retro.minutes)}` : ""} · 完成 {progress.done} 件
          </p>
          <ol className="mt-2 flex flex-col gap-1 border-l border-[var(--color-border)] pl-2.5">
            {retro.timeline.map((row, index) => (
              <li key={`${row.title}-${index}`} className="flex items-baseline gap-2 text-[11px]">
                <span className="w-12 flex-shrink-0 tabular-nums text-[var(--color-text-tertiary)]">
                  {row.at ? md(row.at) : row.date ? `约 ${md(Date.parse(`${row.date}T12:00:00`))}` : "—"}
                </span>
                <span className="min-w-0 truncate text-[var(--color-text-primary)]" data-full-text={row.title}>{row.title}</span>
              </li>
            ))}
          </ol>
          <input type="text" value={note} onChange={(event) => setNote(event.target.value)}
            onBlur={() => note.trim() !== (goal.retroNote ?? "") && onRetroNote(note.trim())}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing || event.keyCode === 229) return;
              if (event.key === "Enter") (event.target as HTMLInputElement).blur();
            }}
            placeholder="这次学到了什么？（可不填）" aria-label="复盘一句话"
            className="mt-2 min-h-9 w-full rounded-lg border border-[var(--color-border)] bg-white px-2.5 text-[12px] outline-none focus:border-[var(--color-primary)]" />
        </div>
      )}

      <ul ref={listRef} className="mt-2 flex flex-col" onPointerMove={onDragMove} onPointerUp={onDragEnd} onPointerCancel={() => setDrag(null)}>
        {open.map((item) => {
          const isNext = item.key === progress.next?.key;
          const label = dateLabel(item.date, today);
          const dropBefore = drag?.target === item.key && drag.edge === "before";
          const dropAfter = drag?.target === item.key && drag.edge === "after";
          return (
            <li key={item.key} data-goal-item={item.key}
              className={[
                "border-b border-[var(--color-border)] last:border-b-0",
                dropBefore ? "shadow-[inset_0_2px_0_var(--color-primary)]" : "",
                dropAfter ? "shadow-[inset_0_-2px_0_var(--color-primary)]" : "",
                drag?.key === item.key ? "opacity-50" : "",
              ].join(" ")}>
              <div className={`flex min-h-11 items-center gap-1 ${isNext ? "rounded-md bg-[var(--color-primary-light)]" : ""}`}>
                <button type="button" aria-label={`拖动调整顺序：${item.title}`} data-no-tab-swipe
                  onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); setDrag({ key: item.key }); }}
                  className="flex h-9 w-6 flex-shrink-0 touch-none cursor-grab items-center justify-center text-[var(--color-text-tertiary)]">
                  <GripVertical className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => onComplete(item)} aria-label={`完成：${item.title}`}
                  className="flex h-9 w-7 flex-shrink-0 items-center justify-center">
                  <span className="h-4 w-4 rounded-full border-[1.5px] border-[var(--color-text-tertiary)] bg-white" />
                </button>
                <div className="min-w-0 flex-1 py-1.5">
                  {renaming?.key === item.key ? (
                    <input autoFocus value={renaming.text} aria-label="改名"
                      onChange={(event) => setRenaming({ key: item.key, text: event.target.value })}
                      onBlur={() => { if (renaming.text.trim() && renaming.text.trim() !== item.title) onRename(item.behaviorId!, renaming.text.trim()); setRenaming(null); }}
                      onKeyDown={(event) => {
                        if (event.nativeEvent.isComposing || event.keyCode === 229) return;
                        if (event.key === "Enter") (event.target as HTMLInputElement).blur();
                        if (event.key === "Escape") setRenaming(null);
                      }}
                      className="min-h-8 w-full rounded-md border border-[var(--color-primary)] px-2 text-[13px] outline-none" />
                  ) : (
                  <p className="flex min-w-0 items-baseline gap-1.5">
                    {isNext && <span className="flex-shrink-0 text-[10px] font-semibold text-[var(--color-primary)]">下一步</span>}
                    {item.behaviorId ? (
                      <button type="button" onClick={() => setRenaming({ key: item.key, text: item.title })} aria-label={`改名：${item.title}`}
                        className="min-w-0 truncate text-left text-[13px] text-[var(--color-text-primary)] hover:underline" data-full-text={item.title}>{item.title}</button>
                    ) : (
                      <span className="truncate text-[13px] text-[var(--color-text-primary)]" data-full-text={item.title}>{item.title}</span>
                    )}
                  </p>
                  )}
                  {hintOf(item) && <p className="text-[10px] leading-snug text-[#C2410C]">{hintOf(item)}</p>}
                  {(item.stepCount > 0 || item.tasks.length > 1) && (
                    <p className="text-[10px] text-[var(--color-text-tertiary)]">
                      {item.stepCount > 0 ? `${item.stepCount} 步` : ""}
                      {item.tasks.length > 1 ? `${item.stepCount > 0 ? " · " : ""}分 ${item.tasks.length} 次做` : ""}
                    </p>
                  )}
                </div>
                <button type="button" onClick={() => setScheduling(item)} aria-label={`${label ? "改期" : "排到某天"}：${item.title}`}
                  className={`flex min-h-8 flex-shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] ${label ? "text-[var(--color-text-secondary)]" : "text-[var(--color-primary)]"} hover:bg-[var(--color-bg-gray-light)]`}>
                  <CalendarDays className="h-3 w-3" />{label ? `${label}${item.tasks.find((task) => task.status !== "done")?.startTime ? ` ${item.tasks.find((task) => task.status !== "done")!.startTime}` : ""}` : "排期"}
                </button>
                {item.behaviorId && item.tasks.length === 0 && (
                  <button type="button" onClick={() => onDelete(item.behaviorId!)} aria-label={`删除：${item.title}`}
                    className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)]">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {!finished && (
        <input type="text" value={draft} onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.nativeEvent.isComposing || event.keyCode === 229) return;
            if (event.key === "Enter") { event.preventDefault(); submit(); }
          }}
          placeholder="＋ 加一件要做的事，回车即存" aria-label="给目标加一件事"
          className="mt-2 min-h-10 w-full rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-bg-gray-lighter)] px-3 text-[13px] outline-none focus:border-[var(--color-primary)] focus:bg-white" />
      )}

      {done.length > 0 && (
        <div className="mt-2">
          <button type="button" onClick={() => setShowDone(!showDone)} aria-expanded={showDone}
            className="flex min-h-8 items-center gap-1 text-[11px] text-[var(--color-text-secondary)]">
            <ChevronDown className={`h-3 w-3 transition-transform ${showDone ? "" : "-rotate-90"}`} />已完成 {done.length}
          </button>
          {showDone && (
            <ul className="flex flex-col">
              {done.map((item) => (
                <li key={item.key} className="flex min-h-9 items-center gap-1 pl-6">
                  <button type="button" onClick={() => onReopen(item)} aria-label={`取消完成：${item.title}`}
                    className="flex h-8 w-7 flex-shrink-0 items-center justify-center">
                    <span className="flex h-4 w-4 items-center justify-center rounded-full text-white" style={{ backgroundColor: color }}>
                      <Check className="h-2.5 w-2.5" strokeWidth={3} />
                    </span>
                  </button>
                  <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--color-text-tertiary)] line-through" data-full-text={item.title}>{item.title}</span>
                  <span className="flex-shrink-0 text-[10px] tabular-nums text-[var(--color-text-tertiary)]">
                    {item.completedAt ? md(item.completedAt) : dateLabel(item.date, today)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {scheduling && (
        <TaskScheduleDialog key={scheduling.key} task={draftTask(scheduling)} today={today} focusTime={false}
          onApply={(schedule) => { onSchedule(scheduling, schedule); setScheduling(null); }}
          onClose={() => setScheduling(null)} />
      )}
    </section>
  );
}
