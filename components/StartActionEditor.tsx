"use client";

import { useEffect, useState } from "react";
import type { StartAction } from "@/components/todo/types";
import { Check, Pencil, Play, Sparkles, Trash2, X } from "lucide-react";

type StepOption = {
  id: string;
  title: string;
  done?: boolean;
};

type Props = {
  value?: StartAction;
  /** 最小启动只依附于某个真实步骤；没有步骤时依附父任务本身。 */
  targetStep?: StepOption;
  onChange: (value?: StartAction) => void;
  /** 任务执行现场可以记录“已经启动”；焦点地图只保存启动提示。 */
  executable?: boolean;
  /** 从某一步上的入口打开时，直接进入输入态，避免再点第二次。 */
  autoEdit?: boolean;
};

export default function StartActionEditor({
  value,
  targetStep,
  onChange,
  executable = false,
  autoEdit = false,
}: Props) {
  const [editing, setEditing] = useState(autoEdit);
  const [title, setTitle] = useState(value?.title ?? "");

  useEffect(() => {
    if (editing) return;
    setTitle(value?.title ?? "");
  }, [editing, value?.title]);

  function beginEdit() {
    setTitle(value?.title ?? "");
    setEditing(true);
  }

  function save() {
    const nextTitle = title.trim();
    if (!nextTitle) return;
    onChange({
      kind: "minimum",
      title: nextTitle,
      targetStepId: targetStep?.id,
      done: executable ? value?.done : undefined,
    });
    setEditing(false);
  }

  if (!value && !editing) {
    return (
      <button
        type="button"
        onClick={beginEdit}
        className="mt-2 flex min-h-11 items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-primary-light)] px-3 py-2 text-[13px] font-medium text-[var(--color-primary)] transition-colors hover:border-[var(--color-primary)] focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]"
      >
        <Sparkles className="h-4 w-4 shrink-0" />
        {targetStep ? "给这一步设最小启动" : "设置最小启动"}
      </button>
    );
  }

  if (editing) {
    return (
      <div className="mt-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-primary-light)] p-3">
        <div className="mb-1.5 flex items-start gap-1.5">
          <Sparkles className="mt-[1px] h-4 w-4 flex-shrink-0 text-[var(--color-primary)]" />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-[var(--color-primary)]">最小启动</p>
            <p className="mt-1 text-[12px] leading-relaxed text-[var(--color-text-secondary)]">
              {targetStep
                ? `只负责让「${targetStep.title}」开始，不替代这一步`
                : "只负责让大脑愿意开始，不改变任务的完成标准"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.nativeEvent.isComposing || event.keyCode === 229) return;
              if (event.key === "Enter") { event.preventDefault(); save(); }
              if (event.key === "Escape") { event.preventDefault(); setEditing(false); }
            }}
            autoFocus
            aria-label="最小启动内容"
            placeholder="例如：打开文档，只写下标题"
            className="min-h-11 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-white)] px-3 py-2 text-[14px] outline-none focus:border-[var(--color-primary)]"
          />
          <button
            type="button"
            onClick={save}
            disabled={!title.trim()}
            className="min-h-10 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
          >
            保存
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-[var(--color-text-secondary)]"
            aria-label="取消编辑最小启动"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  const started = Boolean(value?.done || targetStep?.done);

  return (
    <div
      className={[
        "mt-2 flex flex-wrap items-center gap-2 rounded-lg border p-3",
        started ? "border-[var(--color-border)] bg-[var(--color-success-light)]" : "border-[var(--color-border)] bg-[var(--color-primary-light)]",
      ].join(" ")}
    >
      <span
        className={[
          "mt-[1px] flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full",
          started ? "bg-[var(--color-success)] text-white" : "bg-[var(--color-primary-light)] text-[var(--color-primary)]",
        ].join(" ")}
      >
        {started ? (
          <Check className="h-2.5 w-2.5" strokeWidth={3} />
        ) : (
          <Play className="h-2.5 w-2.5" />
        )}
      </span>
      <div className="min-w-0 flex-1 basis-[55%]">
        <span className="text-[12px] font-semibold text-[var(--color-primary)]">
          {started ? "已经启动" : "先只做"}
        </span>
        <p
          className={[
            "break-words text-[13px] leading-relaxed text-[var(--color-text-primary)]",
            started ? "opacity-60" : "",
          ].join(" ")}
        >
          {value!.title}
        </p>
      </div>
      {executable && !started && (
        <button
          type="button"
          onClick={() => onChange({ ...value!, kind: "minimum", done: true })}
          className="min-h-10 flex-shrink-0 rounded-lg bg-[var(--color-primary)] px-3 py-2 text-[12px] font-semibold text-white"
        >
          我开始了
        </button>
      )}
      {executable && value?.done && (
        <button
          type="button"
          onClick={() => onChange({ ...value, kind: "minimum", done: false })}
          className="min-h-10 flex-shrink-0 px-2 py-2 text-[12px] text-[var(--color-text-secondary)]"
        >
          重置
        </button>
      )}
      <button
        type="button"
        onClick={beginEdit}
        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-[var(--color-text-secondary)]"
        aria-label="修改最小启动"
      >
        <Pencil className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => onChange(undefined)}
        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-danger)]"
        aria-label="删除最小启动"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
