"use client";

import { useId, useState } from "react";
import type { EntryHistoryChoice } from "@/components/todo/entryHistory";

type Props = {
  value: string;
  onChange: (value: string) => void;
  history: EntryHistoryChoice[];
  onSelect: (choice: EntryHistoryChoice) => void;
  onCommit?: () => void;
  onCancel?: () => void;
  autoFocus?: boolean;
  label: string;
};

export default function EntryNameInput({ value, onChange, history, onSelect, onCommit, onCancel, autoFocus, label }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(-1);
  const listId = useId();
  const options = history.filter((item) => `${item.title} ${item.goalLabel} ${item.taskLabel ?? ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  function choose(choice: EntryHistoryChoice) {
    setOpen(false);
    setQuery("");
    setActive(-1);
    onSelect(choice);
  }
  return <div className="relative min-w-0 w-full" onBlur={(event) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setOpen(false);
    onCommit?.();
  }}>
    <input
      autoFocus={autoFocus}
      aria-label={label}
      role="combobox"
      aria-expanded={open}
      aria-controls={open ? listId : undefined}
      aria-autocomplete="list"
      aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
      value={value}
      placeholder="事项名称"
      onFocus={(event) => { setOpen(true); setQuery(""); setActive(-1); event.currentTarget.select(); }}
      onClick={() => setOpen(true)}
      onChange={(event) => { onChange(event.target.value); setQuery(event.target.value); setOpen(true); setActive(-1); }}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing || event.keyCode === 229) return;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          setOpen(true);
          const next = event.key === "ArrowDown" ? Math.min(active + 1, options.length - 1) : Math.max(active - 1, 0);
          setActive(next);
          requestAnimationFrame(() => document.getElementById(`${listId}-${next}`)?.scrollIntoView({ block: "nearest" }));
        } else if (event.key === "Enter") {
          event.preventDefault();
          if (open && active >= 0 && options[active]) choose(options[active]);
          else { setOpen(false); onCommit?.(); }
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          onCancel?.();
        }
      }}
      className="w-full min-w-0 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-white)] px-2.5 py-1.5 text-[13px] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary)]"
    />
    {open && <div className="absolute left-0 top-full z-40 mt-1 w-full min-w-[min(18rem,calc(100vw-4rem))] rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-white)] p-1 shadow-lg">
      <div className="px-2 py-1 text-[11px] text-[var(--color-text-tertiary)]">今天做过 · 沿用目标和计入任务</div>
      <div id={listId} role="listbox" aria-label="历史事项" className="max-h-52 overflow-y-auto overscroll-contain">
        {options.map((item, index) => <button
          key={JSON.stringify([item.title, item.aspirationId, item.taskId])}
          id={`${listId}-${index}`}
          type="button"
          role="option"
          aria-selected={active === index}
          onClick={() => choose(item)}
          className={`flex w-full flex-col gap-0.5 rounded-md px-2 py-2 text-left hover:bg-[var(--color-bg-gray-lighter)] focus-visible:outline-[var(--color-primary)] ${active === index ? "bg-[var(--color-bg-gray-lighter)]" : ""}`}
        >
          <span className="line-clamp-2 text-[13px] text-[var(--color-text-primary)]">{item.title}</span>
          <span className="line-clamp-1 text-[11px] text-[var(--color-text-secondary)]">{item.goalLabel}</span>
          <span className="line-clamp-1 text-[11px] text-[var(--color-text-tertiary)]">{item.taskLabel ? `计入「${item.taskLabel}」` : "不计入任务"}</span>
        </button>)}
        {!options.length && <div className="px-2 py-3 text-[12px] text-[var(--color-text-tertiary)]">{history.length ? "今天没有匹配的事项，可以直接输入新名称" : "今天还没有记录，可以直接输入名称"}</div>}
      </div>
    </div>}
  </div>;
}
