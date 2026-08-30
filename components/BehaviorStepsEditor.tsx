"use client";

import { useRef, useState } from "react";
import type { BehaviorStep } from "@/components/todo/types";
import { callBehaviorAPI } from "@/components/todo/behaviorApi";
import StartActionEditor from "@/components/StartActionEditor";
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  ListChecks,
  Plus,
  Trash2,
  Wand2,
  Sparkles,
} from "lucide-react";

type DropPlacement = { targetId: string; edge: "before" | "after" };

type Props = {
  behaviorTitle: string;
  goal: string;
  steps: BehaviorStep[];
  onChange: (steps: BehaviorStep[]) => void;
  mode?: "procedure" | "task" | "task-package";
};

function stepId(): string {
  return `bs-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function reorderSteps(
  steps: BehaviorStep[],
  sourceId: string,
  targetId: string,
  edge: "before" | "after",
): BehaviorStep[] {
  if (sourceId === targetId) return steps;
  const sourceIndex = steps.findIndex((step) => step.id === sourceId);
  if (sourceIndex < 0) return steps;
  const next = [...steps];
  const [source] = next.splice(sourceIndex, 1);
  const targetIndex = next.findIndex((step) => step.id === targetId);
  if (targetIndex < 0) return steps;
  next.splice(targetIndex + (edge === "after" ? 1 : 0), 0, source);
  return next;
}

export default function BehaviorStepsEditor({
  behaviorTitle,
  goal,
  steps,
  onChange,
  mode = "procedure",
}: Props) {
  const [open, setOpen] = useState(steps.length > 0);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropPlacement, setDropPlacement] = useState<DropPlacement | null>(null);
  const [starterStepId, setStarterStepId] = useState<string | null>(null);
  const dragRef = useRef<{ sourceId: string; placement: DropPlacement | null } | null>(null);
  const draftRef = useRef<HTMLTextAreaElement | null>(null);
  const isTaskFlow = mode === "task" || mode === "task-package";
  const flowLabel = isTaskFlow ? "任务步骤" : "固定流程";

  function openEditor() {
    setOpen(true);
    requestAnimationFrame(() => draftRef.current?.focus());
  }

  function addDraft() {
    const titles = draft
      .split(/\r?\n/)
      .map((title) => title.trim())
      .filter(Boolean);
    if (titles.length === 0) return;
    onChange([...steps, ...titles.map((title) => ({ id: stepId(), title }))]);
    setDraft("");
    setError(null);
  }

  function commitEdit(step: BehaviorStep) {
    const title = editingText.trim();
    if (title && title !== step.title) {
      onChange(steps.map((item) => (item.id === step.id ? { ...item, title } : item)));
    }
    setEditingId(null);
  }

  async function generateSteps() {
    setAiBusy(true);
    setError(null);
    const res = await callBehaviorAPI({ mode: "breakdown", text: behaviorTitle, goal });
    setAiBusy(false);
    if (!res.ok) {
      setError(res.noKey ? "还没有配置 AI，先手动写步骤也可以。" : "这次没有拆出来，稍后再试。 ");
      return;
    }
    const raw = Array.isArray(res.data.subtasks) ? res.data.subtasks : [];
    const titles = raw
      .map((item) => String(item ?? "").trim())
      .filter(Boolean)
      .slice(0, 8);
    const onlyRepeatsParent =
      titles.length === 1 && titles[0].replace(/\s/g, "") === behaviorTitle.replace(/\s/g, "");
    if (titles.length === 0 || onlyRepeatsParent) {
      setError(`AI 看不出${flowLabel}。你可以把现成步骤一行一条贴进来。`);
      setOpen(true);
      requestAnimationFrame(() => draftRef.current?.focus());
      return;
    }
    onChange(titles.map((title) => ({ id: stepId(), title })));
    setOpen(true);
  }

  function beginDrag(event: React.PointerEvent<HTMLButtonElement>, sourceId: string) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const placement = { targetId: sourceId, edge: "before" as const };
    dragRef.current = { sourceId, placement };
    setDraggingId(sourceId);
    setDropPlacement(placement);
  }

  function moveDrag(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    event.preventDefault();
    const hit = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-behavior-step-id]");
    const targetId = hit?.dataset.behaviorStepId;
    if (!hit || !targetId) return;
    const rect = hit.getBoundingClientRect();
    const placement: DropPlacement = {
      targetId,
      edge: event.clientY < rect.top + rect.height / 2 ? "before" : "after",
    };
    if (
      drag.placement?.targetId === placement.targetId &&
      drag.placement.edge === placement.edge
    ) return;
    drag.placement = placement;
    setDropPlacement(placement);
  }

  function endDrag(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* pointer capture may already be gone */
    }
    if (drag?.placement && drag.sourceId !== drag.placement.targetId) {
      onChange(reorderSteps(steps, drag.sourceId, drag.placement.targetId, drag.placement.edge));
    }
    dragRef.current = null;
    setDraggingId(null);
    setDropPlacement(null);
  }

  function cancelDrag() {
    dragRef.current = null;
    setDraggingId(null);
    setDropPlacement(null);
  }

  if (steps.length === 0 && !open) {
    return (
      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={openEditor}
          className="flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-white px-2 py-1 text-[10px] font-medium text-[var(--color-text-secondary)] transition-colors hover:border-[#93C5FD] hover:text-[var(--color-primary)]"
        >
          <ListChecks className="h-3 w-3" />
          {mode === "task-package" ? "自己拆成任务包" : `添加${flowLabel}`}
        </button>
        <button
          type="button"
          onClick={generateSteps}
          disabled={aiBusy}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary-light)] disabled:opacity-50"
        >
          <Wand2 className="h-3 w-3" />
          {aiBusy ? "拆解中…" : "AI 拆步骤"}
        </button>
        {error && <span className="w-full text-[10px] leading-snug text-[#B45309]">{error}</span>}
      </div>
    );
  }

  return (
    <div className="mt-0.5 overflow-hidden rounded-lg border border-[#BFDBFE] bg-[#F8FAFF]">
      <div className="flex items-center gap-2 px-2.5 py-2">
        <ListChecks className="h-3.5 w-3.5 flex-shrink-0 text-[var(--color-primary)]" />
        <button type="button" onClick={() => setOpen((value) => !value)} className="min-w-0 flex-1 text-left">
          <span className="block text-[11px] font-semibold text-[var(--color-text-primary)]">
            {flowLabel}{steps.length > 0 ? ` · ${steps.length} 步` : ""}
          </span>
          <span className="block text-[9px] leading-snug text-[var(--color-text-tertiary)]">
            {isTaskFlow
              ? "这些步骤共同完成父任务，不单独评分；排进日程后可逐项勾选"
              : "整体评分，步骤不单独打分；排成任务后可逐项勾选"}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-text-tertiary)] hover:bg-white"
          aria-label={`${open ? "收起" : "展开"}${flowLabel}`}
        >
          {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-[#DBEAFE] px-2 py-2">
          {mode === "task-package" && steps.length === 0 && (
            <p className="mb-2 rounded-md bg-white px-2 py-1.5 text-[9px] leading-snug text-[var(--color-text-secondary)]">
              添加第一步后，它会成为可评分、可排日程的任务包；如果这套流程以后还会重复，可以再改成可重复流程。
            </p>
          )}
          {steps.length > 0 && (
            <div className="mb-2 flex flex-col gap-1">
              {steps.map((step, index) => {
                const isDragging = draggingId === step.id;
                const isTarget = dropPlacement?.targetId === step.id && draggingId !== null;
                const ownsStarter = Boolean(step.startAction);
                const showsStarter = ownsStarter || starterStepId === step.id;
                return (
                  <div key={step.id} className="flex flex-col">
                    <div
                      data-behavior-step-id={step.id}
                      className={[
                        "relative flex items-start gap-1.5 rounded-md border border-transparent bg-white px-2 py-1.5 transition-[opacity,box-shadow]",
                        isDragging ? "opacity-45" : "",
                        isTarget ? "shadow-[0_2px_8px_rgba(37,99,235,0.12)]" : "",
                      ].join(" ")}
                    >
                    {isTarget && dropPlacement?.edge === "before" && (
                      <span className="pointer-events-none absolute -top-[2px] left-2 right-2 h-[2px] rounded-full bg-[var(--color-primary)]" />
                    )}
                    {isTarget && dropPlacement?.edge === "after" && (
                      <span className="pointer-events-none absolute -bottom-[2px] left-2 right-2 h-[2px] rounded-full bg-[var(--color-primary)]" />
                    )}
                    <span className="mt-[1px] flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-[#DBEAFE] text-[9px] font-semibold text-[var(--color-primary)]">
                      {index + 1}
                    </span>
                    {editingId === step.id ? (
                      <input
                        type="text"
                        value={editingText}
                        onChange={(event) => setEditingText(event.target.value)}
                        onBlur={() => commitEdit(step)}
                        onKeyDown={(event) => {
                          if (event.nativeEvent.isComposing) return;
                          if (event.key === "Enter") event.currentTarget.blur();
                          if (event.key === "Escape") setEditingId(null);
                        }}
                        autoFocus
                        className="min-w-0 flex-1 rounded border border-[var(--color-primary)] px-1 text-[11px] outline-none"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(step.id);
                          setEditingText(step.title);
                        }}
                        className="min-w-0 flex-1 text-left text-[11px] leading-snug text-[var(--color-text-primary)]"
                        title="点击修改"
                      >
                        {step.title}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setStarterStepId((current) => (current === step.id ? null : step.id))
                      }
                      className={[
                        "-mt-[1px] flex h-5 w-5 flex-shrink-0 items-center justify-center rounded",
                        ownsStarter ? "bg-[#F3E8FF] text-[#7C3AED]" : "text-[var(--color-text-tertiary)] hover:bg-[#FAF5FF] hover:text-[#7C3AED]",
                      ].join(" ")}
                      aria-label={`为「${step.title}」设置最小启动`}
                      title={ownsStarter ? "已设置最小启动" : "这一步难开始时，再把它缩小"}
                    >
                      <Sparkles className="h-3 w-3" />
                    </button>
                    {steps.length > 1 && (
                      <button
                        type="button"
                        onPointerDown={(event) => beginDrag(event, step.id)}
                        onPointerMove={moveDrag}
                        onPointerUp={endDrag}
                        onPointerCancel={cancelDrag}
                        onKeyDown={(event) => {
                          if (event.key === "ArrowUp" && index > 0) {
                            event.preventDefault();
                            onChange(reorderSteps(steps, step.id, steps[index - 1].id, "before"));
                          }
                          if (event.key === "ArrowDown" && index < steps.length - 1) {
                            event.preventDefault();
                            onChange(reorderSteps(steps, step.id, steps[index + 1].id, "after"));
                          }
                        }}
                        className="-mt-[1px] flex h-5 w-5 flex-shrink-0 touch-none select-none items-center justify-center rounded cursor-grab active:cursor-grabbing"
                        aria-label={`拖动调整「${step.title}」顺序`}
                        title="拖动调整顺序"
                      >
                        <GripVertical className="h-3.5 w-3.5 text-[var(--color-text-tertiary)]" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onChange(steps.filter((item) => item.id !== step.id))}
                      className="-mt-[1px] flex h-5 w-5 flex-shrink-0 items-center justify-center rounded"
                      aria-label={`删除${flowLabel}`}
                    >
                      <Trash2 className="h-3 w-3 text-[#A1A1AA]" />
                    </button>
                    </div>
                    {showsStarter && (
                      <div className="ml-5">
                        <StartActionEditor
                          key={`${step.id}-${ownsStarter ? "saved" : "new"}`}
                          value={step.startAction}
                          targetStep={step}
                          autoEdit={!ownsStarter}
                          onChange={(next) => {
                            onChange(
                              steps.map((item) =>
                                item.id === step.id
                                  ? {
                                      ...item,
                                      startAction: next
                                        ? {
                                            ...next,
                                            kind: "minimum",
                                            targetStepId: step.id,
                                            done: undefined,
                                          }
                                        : undefined,
                                    }
                                  : item,
                              ),
                            );
                            if (!next) setStarterStepId(null);
                            else setStarterStepId(step.id);
                          }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex items-end gap-1.5">
            <textarea
              ref={draftRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) return;
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  addDraft();
                }
              }}
              rows={1}
              placeholder="添加一步；也可一行一条粘贴"
              className="min-h-8 min-w-0 flex-1 resize-none rounded-md border border-[#BFDBFE] bg-white px-2 py-1.5 text-[10px] leading-snug outline-none placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-primary)]"
            />
            <button
              type="button"
              onClick={addDraft}
              disabled={!draft.trim()}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-[var(--color-primary)] text-white disabled:bg-[var(--color-bg-gray)] disabled:text-[var(--color-text-tertiary)]"
              aria-label={`添加${flowLabel}`}
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          {steps.length === 0 && (
            <button
              type="button"
              onClick={generateSteps}
              disabled={aiBusy}
              className="mt-1.5 flex items-center gap-1 text-[10px] font-medium text-[var(--color-primary)] disabled:opacity-50"
            >
              <Wand2 className="h-3 w-3" />
              {aiBusy ? "拆解中…" : "让 AI 先拆一版"}
            </button>
          )}
          {error && <p className="mt-1 text-[10px] leading-snug text-[#B45309]">{error}</p>}
        </div>
      )}
    </div>
  );
}
