"use client";

import { useRef, useState } from "react";
import { ChevronDown, MessageSquareText, Pencil, Plus, Trash2 } from "lucide-react";
import type { Aspiration, GoalResult, Task, TaskNote } from "@/components/todo/types";
import { createTaskNote, editTaskNote } from "@/components/todo/taskNotes";

type Props = { task: Task; goal?: Aspiration; result?: GoalResult; onChange: (notes: TaskNote[]) => void };

export default function TaskNotes({ task, goal, result, onChange }: Props) {
  const [open, setOpen] = useState(Boolean(task.notes?.length));
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const submitted = useRef(false);
  const notes = task.notes ?? [];
  const buttonClass = "min-h-9 rounded-lg px-2.5 text-[12px] font-medium transition-colors hover:bg-[var(--color-bg-gray-light)] focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]";

  function begin(note?: TaskNote) {
    submitted.current = false;
    setDraft(note?.text ?? "");
    setEditing(note?.id ?? "new");
    setOpen(true);
  }

  function save() {
    if (!draft.trim() || !editing || submitted.current) return;
    submitted.current = true;
    if (editing === "new") {
      const note = createTaskNote(task, draft, goal, result);
      if (note) onChange([...notes, note]);
    } else {
      onChange(editTaskNote(notes, editing, draft));
    }
    setEditing(null);
    setDraft("");
  }

  return (
    <section aria-label="任务随记" data-no-tab-swipe className="mb-4 rounded-xl border border-[var(--color-border)] p-3">
      <div className="flex items-center justify-between gap-2">
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className={`${buttonClass} flex items-center gap-2 text-[var(--color-text-secondary)]`}>
          <MessageSquareText className="h-4 w-4" />随记{notes.length > 0 && ` ${notes.length}`}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {!editing && <button type="button" onClick={() => begin()} className={`${buttonClass} flex items-center gap-1 bg-[var(--color-primary-light)] text-[var(--color-primary)]`}><Plus className="h-4 w-4" />记一下</button>}
      </div>
      {open && <div className="mt-2">
        {editing && <div className="mb-3">
          <textarea autoFocus aria-label="随记内容" value={draft} rows={3}
            placeholder="刚才发生了什么？卡在哪，或什么让你顺利开始了？"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.nativeEvent.isComposing || event.keyCode === 229) return;
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); save(); }
              if (event.key === "Escape") { event.preventDefault(); setEditing(null); }
            }}
            className="w-full resize-y rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-white)] px-3 py-2 text-[14px] leading-relaxed text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary)]" />
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="text-[11px] text-[var(--color-text-secondary)]">写一句也可以，不用急着分析原因</span>
            <div className="flex shrink-0 gap-1">
              <button type="button" onClick={() => setEditing(null)} className={`${buttonClass} text-[var(--color-text-secondary)]`}>取消</button>
              <button type="button" onClick={save} disabled={!draft.trim()} className="min-h-9 rounded-lg bg-[var(--color-primary)] px-3 text-[12px] font-medium text-white disabled:opacity-40">保存随记</button>
            </div>
          </div>
        </div>}
        {!notes.length && !editing && <p className="px-2 pb-1 text-[12px] text-[var(--color-text-secondary)]">卡住了，或顺利开始了，都可以记一句。</p>}
        <div className="max-h-64 space-y-3 overflow-y-auto">
          {[...notes].reverse().map((note) => <article key={note.id} className="border-t border-[var(--color-border)] pt-2">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[11px] text-[var(--color-text-secondary)]">{new Date(note.createdAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}{note.updatedAt ? " · 已编辑" : ""}</span>
              <div className="flex">
                <button type="button" disabled={Boolean(editing)} aria-label="编辑随记" onClick={() => begin(note)} className={`${buttonClass} text-[var(--color-text-secondary)] disabled:opacity-30`}><Pencil className="h-3.5 w-3.5" /></button>
                <button type="button" disabled={Boolean(editing)} aria-label="删除随记" onClick={() => setDeleting(note.id)} className={`${buttonClass} text-[var(--color-text-secondary)] disabled:opacity-30`}><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
            <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-[var(--color-text-primary)]">{note.text}</p>
            {note.context.stepTitle && <p className="mt-1 break-words text-[11px] text-[var(--color-text-secondary)]">当时的步骤：{note.context.stepTitle}</p>}
            {(note.context.aspirationTitle || note.context.resultTitle) && <p className="mt-1 break-words text-[11px] text-[var(--color-text-secondary)]">{[note.context.aspirationTitle, note.context.resultTitle].filter(Boolean).join(" › ")}</p>}
            {deleting === note.id && <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]" role="group" aria-label="确认删除随记">
              <span>删除这条随记？</span>
              <button type="button" onClick={() => setDeleting(null)} className={buttonClass}>保留</button>
              <button type="button" className={`${buttonClass} text-[var(--color-danger)]`} onClick={() => { onChange(notes.filter((item) => item.id !== note.id)); setDeleting(null); }}>确认删除</button>
            </div>}
          </article>)}
        </div>
      </div>}
    </section>
  );
}
