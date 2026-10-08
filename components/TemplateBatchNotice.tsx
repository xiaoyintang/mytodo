"use client";

import { Redo2, Undo2 } from "lucide-react";
import type { TemplateBatch } from "@/components/todo/templateHistory";

export default function TemplateBatchNotice({ batches, onToggle }: {
  batches: TemplateBatch[];
  onToggle: (id: string) => void;
}) {
  if (!batches.length) return null;
  return <div className="flex flex-col gap-2">
    {batches.map(batch => <div key={batch.id} className="flex items-center gap-3 rounded-lg bg-[var(--color-primary-light)] px-3 py-1.5">
      <div className="min-w-0 flex-1 text-[12px] text-[var(--color-text-secondary)]" aria-live="polite">
        <span className="block truncate font-medium" data-full-text={batch.name}>{batch.name} · {batch.tasks.length} 项</span>
        <span className="text-[11px]">{batch.notice ?? "从模板加入，可整批撤回"}</span>
      </div>
      <button type="button" onClick={() => onToggle(batch.id)}
        disabled={batch.removed ? batch.removed.length === 0 : batch.tasks.length === 0}
        aria-label={`${batch.removed ? "恢复" : "撤回"}模板 ${batch.name} 的这批任务`}
        className="flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-2 text-[12px] font-medium text-[var(--color-primary)] hover:bg-white/60 disabled:opacity-40">
        {batch.removed ? <Redo2 className="h-3.5 w-3.5" /> : <Undo2 className="h-3.5 w-3.5" />}
        {batch.removed ? "恢复" : "撤回这批"}
      </button>
    </div>)}
  </div>;
}
