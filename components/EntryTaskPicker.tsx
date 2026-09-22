"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Link2, Search, X } from "lucide-react";
import type { Aspiration, Task } from "@/components/todo/types";
import { goalColor } from "@/components/todo/goal";

type Props = {
  tasks: Task[];
  aspirations: Aspiration[];
  value?: string;
  label: string;
  onChange: (taskId?: string) => void;
  initiallyOpen?: boolean;
  onClose?: () => void;
};

/** 就地展开，避免手机原生 select 和长列表弹层遮挡记录。 */
export default function EntryTaskPicker({ tasks, aspirations, value, label, onChange, initiallyOpen = false, onClose }: Props) {
  const [open, setOpen] = useState(initiallyOpen);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(-1);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const selected = tasks.find(task => task.id === value);
  const goalFor = (task: Task) => aspirations.find(goal => goal.id === task.aspirationId);
  const matched = tasks.filter(task => `${task.title} ${goalFor(task)?.title ?? ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const options: (Task | undefined)[] = [undefined, ...matched];
  function close() { setOpen(false); setQuery(""); setActive(-1); onClose?.(); }
  function choose(task?: Task) { onChange(task?.id); close(); trigger.current?.focus(); }
  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) { setOpen(false); setQuery(""); setActive(-1); onClose?.(); }
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open, onClose]);
  useEffect(() => {
    if (open && active >= 0) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, open, listId]);

  return <div ref={root} className="min-w-0 w-full" onKeyDown={event => {
    if (event.key === "Escape" && open) { event.stopPropagation(); event.preventDefault(); close(); trigger.current?.focus(); }
  }}>
    {!initiallyOpen && <button ref={trigger} type="button" aria-label={label} aria-expanded={open} aria-controls={open ? listId : undefined}
      onClick={() => open ? close() : setOpen(true)}
      className="flex min-h-10 w-full items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-white)] px-2.5 text-left text-[12px] text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-primary)] focus-visible:outline-[var(--color-primary)]">
      <Link2 className="h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate" data-full-text={selected?.title}>{selected?.title ?? (value ? "已关联任务（不在当天）" : "不计入任务")}</span>
      <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
    </button>}
    {open && <div className={`${initiallyOpen ? "" : "mt-1.5"} rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-white)] p-2 shadow-sm`}>
      <div className="mb-1 flex items-center justify-between gap-2 px-1">
        <span className="text-[12px] font-semibold text-[var(--color-text-primary)]">计入任务 <span className="ml-1 text-[11px] font-normal text-[var(--color-text-tertiary)]">记录当天 · {tasks.length} 项</span></span>
        <button type="button" aria-label="关闭任务选择" onClick={() => { close(); trigger.current?.focus(); }} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-gray-light)]"><X className="h-4 w-4" /></button>
      </div>
      <div className="mb-1.5 flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-gray-lighter)] px-2.5 focus-within:border-[var(--color-primary)]">
        <Search className="h-4 w-4 shrink-0 text-[var(--color-text-tertiary)]" />
        <input autoFocus value={query} role="combobox" aria-label={label} aria-expanded={true} aria-controls={listId} aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          placeholder="搜索任务或所属目标"
          onChange={event => { setQuery(event.target.value); setActive(-1); }}
          onKeyDown={event => {
            if (event.nativeEvent.isComposing || event.keyCode === 229) return;
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault(); setActive(event.key === "ArrowDown" ? Math.min(active + 1, options.length - 1) : Math.max(active - 1, 0));
            } else if (event.key === "Enter") {
              event.preventDefault(); event.stopPropagation();
              if (active >= 0 && active < options.length) choose(options[active]);
            }
          }}
          className="min-h-10 min-w-0 flex-1 bg-transparent text-[13px] text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-tertiary)]" />
      </div>
      <div id={listId} role="listbox" aria-label="记录当天可计入的任务" className="max-h-60 overflow-y-auto overscroll-contain">
        {options.map((task, index) => {
          const goal = task ? goalFor(task) : undefined;
          const picked = task ? value === task.id : !value;
          return <button key={task?.id ?? "none"} id={`${listId}-${index}`} type="button" role="option" aria-selected={picked}
            onClick={() => choose(task)}
            className={`flex min-h-11 w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors focus-visible:outline-[var(--color-primary)] ${picked ? "bg-[var(--color-primary-light)]" : active === index ? "bg-[var(--color-bg-gray-light)]" : "hover:bg-[var(--color-bg-gray-lighter)]"}`}>
            <div className="min-w-0 flex-1">
              <div className={`break-words text-[13px] ${picked ? "font-medium text-[var(--color-primary)]" : "text-[var(--color-text-primary)]"}`}>{task?.title ?? "不计入任务"}</div>
              {task && <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[var(--color-text-tertiary)]">
                <span className="flex min-w-0 items-center gap-1"><span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: goal ? goalColor(goal, aspirations.indexOf(goal)) : "var(--color-text-tertiary)" }} /><span className="break-words">{goal?.title ?? "未归属目标"}</span></span>
                <span>{task.startTime ?? "不限时间"}</span><span>{task.status === "done" ? "已完成" : task.status === "in_progress" ? "进行中" : "待办"}</span>
              </div>}
            </div>
            {picked && <Check className="h-4 w-4 shrink-0 text-[var(--color-primary)]" />}
          </button>;
        })}
        {!matched.length && <p className="px-2.5 py-3 text-[12px] text-[var(--color-text-tertiary)]">{query ? "没有匹配的任务，试试其他关键词" : "这一天还没有任务，可以暂不关联"}</p>}
      </div>
      <p className="mt-1.5 border-t border-[var(--color-border)] px-1 pt-2 text-[11px] text-[var(--color-text-tertiary)]">选中后计入该任务，并沿用所属目标；不修改记录名称和时长。</p>
    </div>}
  </div>;
}
