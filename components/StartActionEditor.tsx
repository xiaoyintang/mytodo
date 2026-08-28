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
        className="mt-0.5 flex items-center gap-1 rounded-md px-1.5 py-1 text-[9px] font-medium text-[var(--color-text-tertiary)] transition-colors hover:bg-[#FAF5FF] hover:text-[#6D28D9]"
      >
        <Sparkles className="h-3 w-3" />
        {targetStep ? "这一步难开始？再缩小" : "难开始？设一个最小启动"}
      </button>
    );
  }

  if (editing) {
    return (
      <div className="mt-1 rounded-lg border border-[#DDD6FE] bg-[#FAF5FF] p-2">
        <div className="mb-1.5 flex items-start gap-1.5">
          <Sparkles className="mt-[1px] h-3 w-3 flex-shrink-0 text-[#7C3AED]" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold text-[#6D28D9]">最小启动</p>
            <p className="text-[8px] leading-snug text-[var(--color-text-tertiary)]">
              {targetStep
                ? `只负责让「${targetStep.title}」开始，不替代这一步`
                : "只负责让大脑愿意开始，不改变任务的完成标准"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
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
            placeholder="例如：打开文档，只写下标题"
            className="min-w-0 flex-1 rounded-md border border-[#DDD6FE] bg-white px-2 py-1.5 text-[11px] outline-none focus:border-[#8B5CF6]"
          />
          <button
            type="button"
            onClick={save}
            disabled={!title.trim()}
            className="rounded-md bg-[#7C3AED] px-2.5 py-1.5 text-[10px] font-semibold text-white disabled:opacity-40"
          >
            保存
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-tertiary)]"
            aria-label="取消编辑最小启动"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  const started = Boolean(value?.done || targetStep?.done);

  return (
    <div
      className={[
        "mt-1 flex items-start gap-2 rounded-lg border px-2 py-1.5",
        started ? "border-[#BBF7D0] bg-[#F0FDF4]" : "border-[#DDD6FE] bg-[#FAF5FF]",
      ].join(" ")}
    >
      <span
        className={[
          "mt-[1px] flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full",
          started ? "bg-[#16A34A] text-white" : "bg-[#EDE9FE] text-[#7C3AED]",
        ].join(" ")}
      >
        {started ? (
          <Check className="h-2.5 w-2.5" strokeWidth={3} />
        ) : (
          <Play className="h-2.5 w-2.5" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <span className="text-[9px] font-semibold text-[#6D28D9]">
          {started ? "已经启动" : "先只做"}
        </span>
        <p
          className={[
            "text-[11px] leading-snug text-[var(--color-text-primary)]",
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
          className="flex-shrink-0 rounded-md bg-[#7C3AED] px-2 py-1 text-[9px] font-semibold text-white"
        >
          我开始了
        </button>
      )}
      {executable && value?.done && (
        <button
          type="button"
          onClick={() => onChange({ ...value, kind: "minimum", done: false })}
          className="flex-shrink-0 px-1 py-1 text-[9px] text-[var(--color-text-tertiary)]"
        >
          重置
        </button>
      )}
      <button
        type="button"
        onClick={beginEdit}
        className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-[var(--color-text-tertiary)]"
        aria-label="修改最小启动"
      >
        <Pencil className="h-3 w-3" />
      </button>
      <button
        type="button"
        onClick={() => onChange(undefined)}
        className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)]"
        aria-label="删除最小启动"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}
