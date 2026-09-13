"use client";

import { useState, type ReactNode } from "react";
import { Check, Target, X } from "lucide-react";
import type { Aspiration, Task } from "@/components/todo/types";

export default function DailyFocusSection({ task, tasks, aspirations, isToday, onSelect, children }: {
  task?: Task;
  tasks: Task[];
  aspirations: Aspiration[];
  isToday: boolean;
  onSelect: (id: string | null) => void;
  children?: ReactNode;
}) {
  const [choosing, setChoosing] = useState(false);
  const [query, setQuery] = useState("");
  const label = isToday ? "今日关键任务" : "当天关键任务";
  const choices = tasks.filter((item) => item.status !== "done" && item.id !== task?.id && item.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const buttonClass = "min-h-9 rounded-lg px-2.5 text-[12px] font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary-light)] focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]";
  return <section aria-label={label} className={`rounded-xl border ${task ? "border-[var(--color-primary)]" : "border-[var(--color-border)]"} bg-[var(--color-bg-white)]`}>
    <div className="flex items-center gap-2 px-3 py-1.5">
      <Target className="h-4 w-4 shrink-0 text-[var(--color-primary)]" />
      <h2 className="min-w-0 flex-1 text-[13px] font-semibold text-[var(--color-text-primary)]">{label}</h2>
      {task?.status === "done" && <span className="flex items-center gap-1 text-[11px] font-medium text-[var(--color-success)]"><Check className="h-3.5 w-3.5" />已完成</span>}
      <button type="button" className={buttonClass} aria-expanded={choosing} onClick={() => { setChoosing(!choosing); setQuery(""); }}>{choosing ? "收起选择" : task ? "换一件" : "选一件"}</button>
      {task && <button type="button" onClick={() => onSelect(null)} aria-label="取消关键任务" data-full-text="取消关键任务，不删除任务" className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-gray-light)]"><X className="h-4 w-4" /></button>}
    </div>
    {!task && !choosing && <p className="px-3 pb-2.5 text-[11px] text-[var(--color-text-secondary)]">{isToday ? "今天" : "这一天"}有限的精力，优先留给哪一件？也可以暂时不选。</p>}
    {choosing && <div data-no-tab-swipe className="mx-3 mb-3 border-t border-[var(--color-border)] pt-2">
      <input aria-label="搜索当天任务" placeholder="从当天任务里选，不会新建任务" value={query} onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Escape") setChoosing(false); }}
        className="mb-2 min-h-10 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-white)] px-3 text-[14px] outline-none focus:border-[var(--color-primary)]" />
      <div className="max-h-60 overflow-y-auto">
        {choices.map((item) => <button key={item.id} type="button" onClick={() => { onSelect(item.id); setChoosing(false); }}
          className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-[var(--color-primary-light)] focus-visible:outline-[var(--color-primary)]">
          <span className="min-w-0 flex-1"><span data-full-text={item.title} className="block truncate text-[13px] font-medium text-[var(--color-text-primary)]">{item.title}</span>
            <span className="block truncate text-[11px] text-[var(--color-text-secondary)]">{item.startTime ?? "不限时段"}{item.aspirationId ? ` · ${aspirations.find((goal) => goal.id === item.aspirationId)?.title ?? ""}` : ""}</span></span>
          <span className="shrink-0 text-[12px] text-[var(--color-primary)]">选这件</span>
        </button>)}
        {!choices.length && <p className="py-3 text-[12px] text-[var(--color-text-secondary)]">{query ? "没有匹配的任务" : "暂无其他未完成任务，可以先在下方添加。"}</p>}
      </div>
    </div>}
    {task && <div className="border-t border-[var(--color-border)] px-3">
      {children}
      {task.status !== "done" && <p className="pb-2 text-[11px] text-[var(--color-text-secondary)]">优先保障，不要求最先做；按任务原有的完成标准推进。</p>}
    </div>}
  </section>;
}
