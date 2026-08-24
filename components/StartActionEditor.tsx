"use client";

import { useEffect, useState } from "react";
import type { StartAction } from "@/components/todo/types";
import { Check, Pencil, Play, Trash2, X } from "lucide-react";

type StepOption = {
  id: string;
  title: string;
  done?: boolean;
};

type Props = {
  value?: StartAction;
  steps?: StepOption[];
  onChange: (value?: StartAction) => void;
  /** 任务执行现场可以把起步动作标为完成；焦点地图只保存模板。 */
  executable?: boolean;
};

const KIND_INFO: Record<StartAction["kind"], { label: string; hint: string }> = {
  next: { label: "下一步", hint: "真正推进工作的第一下" },
  minimum: { label: "最小启动", hint: "只负责让自己开始，不代表完成任务" },
};

export default function StartActionEditor({
  value,
  steps = [],
  onChange,
  executable = false,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [kind, setKind] = useState<StartAction["kind"]>(value?.kind ?? "next");
  const [title, setTitle] = useState(value?.title ?? "");
  const [targetStepId, setTargetStepId] = useState(value?.targetStepId ?? "");

  useEffect(() => {
    if (editing) return;
    setKind(value?.kind ?? "next");
    setTitle(value?.title ?? "");
    setTargetStepId(value?.targetStepId ?? "");
  }, [editing, value?.kind, value?.targetStepId, value?.title]);

  function beginEdit() {
    setKind(value?.kind ?? "next");
    setTitle(value?.title ?? "");
    setTargetStepId(value?.targetStepId ?? (steps[0]?.id ?? ""));
    setEditing(true);
  }

  function save() {
    const nextTitle = title.trim();
    if (!nextTitle) return;
    onChange({
      kind,
      title: nextTitle,
      targetStepId: targetStepId || undefined,
      done: executable ? value?.done : undefined,
    });
    setEditing(false);
  }

  const targetStep = value?.targetStepId
    ? steps.find((step) => step.id === value.targetStepId)
    : undefined;
  const targetAlreadyDone = Boolean(targetStep?.done);
  const firstOpenStep = steps.find((step) => !step.done);
  const targetWaiting = Boolean(
    targetStep && firstOpenStep && targetStep.id !== firstOpenStep.id && !targetAlreadyDone,
  );

  if (!value && !editing) {
    return (
      <button
        type="button"
        onClick={beginEdit}
        className="mt-0.5 flex items-center gap-1 rounded-md border border-dashed border-[#A5B4FC] bg-[#F8FAFF] px-2 py-1 text-[10px] font-medium text-[#4F46E5] transition-colors hover:bg-[#EEF2FF]"
      >
        <Play className="h-3 w-3" />
        设计起步
      </button>
    );
  }

  if (editing) {
    return (
      <div className="mt-0.5 rounded-lg border border-[#C7D2FE] bg-[#F8FAFF] p-2">
        <div className="flex items-stretch gap-1.5">
          {(["next", "minimum"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setKind(option)}
              className={[
                "flex-1 rounded-md border px-2 py-1.5 text-left transition-colors",
                kind === option
                  ? "border-[#6366F1] bg-[#EEF2FF] text-[#4338CA]"
                  : "border-[var(--color-border)] bg-white text-[var(--color-text-secondary)]",
              ].join(" ")}
            >
              <span className="block text-[10px] font-semibold">{KIND_INFO[option].label}</span>
              <span className="block text-[8px] leading-snug opacity-75">{KIND_INFO[option].hint}</span>
            </button>
          ))}
        </div>

        {steps.length > 0 && (
          <label className="mt-1.5 flex items-center gap-2 rounded-md bg-white px-2 py-1.5">
            <span className="flex-shrink-0 text-[9px] text-[var(--color-text-tertiary)]">针对步骤</span>
            <select
              value={targetStepId}
              onChange={(event) => setTargetStepId(event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-[10px] font-medium text-[var(--color-text-secondary)] outline-none"
              aria-label="起步动作针对的流程步骤"
            >
              <option value="">整个任务包</option>
              {steps.map((step, index) => (
                <option key={step.id} value={step.id}>
                  {index + 1}. {step.title}{step.done ? "（已完成）" : ""}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="mt-1.5 flex items-center gap-1.5">
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === "Enter") save();
              if (event.key === "Escape") setEditing(false);
            }}
            autoFocus
            placeholder={kind === "next" ? "现在真正要做的第一下" : "小到几乎不会拒绝的启动动作"}
            className="min-w-0 flex-1 rounded-md border border-[var(--color-border)] bg-white px-2 py-1.5 text-[11px] outline-none focus:border-[#6366F1]"
          />
          <button
            type="button"
            onClick={save}
            disabled={!title.trim()}
            className="rounded-md bg-[#4F46E5] px-2.5 py-1.5 text-[10px] font-semibold text-white disabled:opacity-40"
          >
            保存
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-tertiary)]"
            aria-label="取消编辑起步动作"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        {!executable && (
          <p className="mt-1 text-[8px] leading-snug text-[var(--color-text-tertiary)]">
            起步动作不单独评分；影响力和能做到仍然评价完整行为或任务包。
          </p>
        )}
      </div>
    );
  }

  return (
    <div
      className={[
        "mt-0.5 flex items-start gap-2 rounded-lg border px-2 py-1.5",
        value?.done || targetAlreadyDone
          ? "border-[#BBF7D0] bg-[#F0FDF4]"
          : targetWaiting
            ? "border-[var(--color-border)] bg-[var(--color-bg-gray-lighter)]"
          : value?.kind === "minimum"
            ? "border-[#DDD6FE] bg-[#FAF5FF]"
            : "border-[#BFDBFE] bg-[#F8FAFF]",
      ].join(" ")}
    >
      <span
        className={[
          "mt-[1px] flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full",
          value?.done || targetAlreadyDone ? "bg-[#16A34A] text-white" : "bg-[#E0E7FF] text-[#4F46E5]",
        ].join(" ")}
      >
        {value?.done || targetAlreadyDone ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : <Play className="h-2.5 w-2.5" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span className="text-[9px] font-semibold text-[#4F46E5]">{KIND_INFO[value!.kind].label}</span>
          {targetStep && (
            <span className="truncate text-[8px] text-[var(--color-text-tertiary)]">
              针对「{targetStep.title}」
            </span>
          )}
          {targetWaiting && (
            <span className="text-[8px] text-[var(--color-text-tertiary)]">到这一步时出现</span>
          )}
        </div>
        <p className={[
          "text-[11px] leading-snug text-[var(--color-text-primary)]",
          value?.done || targetAlreadyDone ? "line-through opacity-60" : "",
        ].join(" ")}>
          {value!.title}
        </p>
      </div>
      {executable && !value?.done && !targetAlreadyDone && !targetWaiting && (
        <button
          type="button"
          onClick={() => onChange({ ...value!, done: true })}
          className="flex-shrink-0 rounded-md bg-[#4F46E5] px-2 py-1 text-[9px] font-semibold text-white"
        >
          做完这一下
        </button>
      )}
      {executable && value?.done && (
        <button
          type="button"
          onClick={() => onChange({ ...value, done: false })}
          className="flex-shrink-0 px-1 py-1 text-[9px] text-[var(--color-text-tertiary)]"
        >
          撤回
        </button>
      )}
      <button
        type="button"
        onClick={beginEdit}
        className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-[var(--color-text-tertiary)]"
        aria-label="修改起步动作"
      >
        <Pencil className="h-3 w-3" />
      </button>
      <button
        type="button"
        onClick={() => onChange(undefined)}
        className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)]"
        aria-label="删除起步动作"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}
