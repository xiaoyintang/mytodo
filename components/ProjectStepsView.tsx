"use client";

import { useEffect, useRef, useState } from "react";
import type { Aspiration, ISODate, ProjectStep, Task } from "@/components/todo/types";
import { callBehaviorAPI } from "@/components/todo/behaviorApi";
import { toISODate } from "@/components/todo/date";
import { AlertTriangle, CalendarPlus, Check, Loader2, Plus, Trash2, Undo2 } from "lucide-react";

type StepCheck = { id: string; blocker?: "decision" | "endpoint"; reason?: string };

type Props = {
  aspiration: Aspiration;
  steps: ProjectStep[];
  tasks: Task[];
  onAdd: (texts: string[]) => void;
  onApplyChecks: (results: StepCheck[]) => void;
  onEditText: (id: string, text: string) => void;
  onDelete: (id: string) => void;
  onSchedule: (stepId: string, title: string, date: ISODate) => void;
  onUnschedule: (stepId: string) => void;
};

const BLOCKER_LABEL: Record<"decision" | "endpoint", { moment: string; label: string; hint: string }> =
  {
    decision: {
      moment: "② 过程",
      label: "要当场判断",
      hint: "做到一半得停下来想，改写成不用动脑的版本",
    },
    endpoint: {
      moment: "③ 终点",
      label: "缺终点",
      hint: "做完了不知道算不算做完",
    },
  };

/**
 * 项目型目标的步骤清单。**和焦点地图是两条管道**，区别只有三点：
 *   1. 不做减法——步骤之间是 AND，没有打分、排序、筛选，加进来的全留着
 *   2. 不判类型——它天生就是任务，没有"这是不是行为"的问题
 *   3. 只报 ②过程 ③终点——时机靠排日期给，费不费力没有滑块可看
 * 只做一层平的清单，不做 WBS 树：只需要想出"下一步"，一次拆完本身就会把人劝退。
 */
export default function ProjectStepsView({
  aspiration,
  steps,
  tasks,
  onAdd,
  onApplyChecks,
  onEditText,
  onDelete,
  onSchedule,
  onUnschedule,
}: Props) {
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [checking, setChecking] = useState<Set<string>>(new Set());
  const [pickDateFor, setPickDateFor] = useState<string | null>(null);
  const [fixing, setFixing] = useState<string | null>(null);
  const [fixOptions, setFixOptions] = useState<{ forId: string; texts: string[] } | null>(null);

  const mine = steps.filter((s) => s.aspirationId === aspiration.id);
  const done = mine.filter((s) => {
    const t = s.taskId ? tasks.find((x) => x.id === s.taskId) : undefined;
    return t?.status === "done";
  }).length;

  // 新步骤自己去体检，不用点按钮。700ms 内连着加的攒成一次请求。
  // 去重 key 必须是 id + 文字：改完文字要退回重检，只按 id 记会被当成"问过了"永远跳过。
  const checkedRef = useRef<Set<string>>(new Set());
  const key = (s: ProjectStep) => `${s.id}::${s.text}`;
  const pending = mine.filter((s) => !s.checkSource && !checkedRef.current.has(key(s)));
  const pendingKey = pending.map(key).join("|");

  useEffect(() => {
    if (pending.length === 0) return;
    const todo = pending.slice(0, 12);
    const timer = setTimeout(() => {
      todo.forEach((s) => checkedRef.current.add(key(s)));
      setChecking(new Set(todo.map((s) => s.id)));
      void (async () => {
        const res = await callBehaviorAPI({
          mode: "steps",
          goal: aspiration.title,
          items: todo.map((s) => ({ id: s.id, text: s.text })),
        });
        setChecking(new Set());
        if (!res.ok) {
          todo.forEach((s) => checkedRef.current.delete(key(s)));
          return;
        }
        const results = Array.isArray(res.data.results) ? (res.data.results as StepCheck[]) : [];
        if (results.length > 0) onApplyChecks(results);
      })();
    }, 700);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingKey, aspiration.id]);

  function submitDraft() {
    const t = draft.trim();
    if (!t) return;
    onAdd([t]);
    setDraft("");
  }

  async function handleFix(step: ProjectStep) {
    if (fixing) return;
    setFixing(step.id);
    setFixOptions(null);
    const res = await callBehaviorAPI({
      mode: "concrete",
      text: step.text,
      goal: aspiration.title,
    });
    setFixing(null);
    if (!res.ok) return;
    const raw = Array.isArray(res.data.behaviors) ? res.data.behaviors : [];
    const texts = raw
      .map((b) => String((b as { text?: string })?.text ?? "").trim())
      .filter(Boolean)
      .slice(0, 3);
    if (texts.length > 0) setFixOptions({ forId: step.id, texts });
  }

  const next7: ISODate[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return toISODate(d);
  });

  return (
    <div className="w-full flex flex-col gap-3">
      <div className="w-full flex items-baseline gap-2">
        <span className="text-[15px] font-semibold text-[var(--color-text-primary)]">步骤</span>
        <span className="text-[11px] text-[var(--color-text-tertiary)]">
          {mine.length > 0 ? `${done}/${mine.length} 已完成 · 全留着，不筛不排` : "缺一步就完不成，所以这里不做减法"}
        </span>
      </div>

      {/* 收集口：只问下一步，不要求一次拆完 */}
      <div className="w-full flex items-center gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) submitDraft();
          }}
          enterKeyHint="done"
          placeholder="下一个动作是什么？回车加一条"
          className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-[var(--color-border)] text-[13px] bg-white focus:outline-none focus:border-[var(--color-primary)]"
        />
        <button
          type="button"
          onClick={submitDraft}
          disabled={!draft.trim()}
          className={[
            "flex items-center gap-1 px-3 py-2 rounded-lg text-[12px] font-medium transition-colors flex-shrink-0",
            draft.trim()
              ? "bg-[var(--color-primary)] text-white hover:bg-[#1d4ed8]"
              : "bg-[var(--color-bg-gray-light)] text-[var(--color-text-tertiary)] cursor-not-allowed",
          ].join(" ")}
        >
          <Plus className="w-3.5 h-3.5" />加
        </button>
      </div>

      {mine.length === 0 && (
        <p className="text-[12px] leading-relaxed text-[var(--color-text-secondary)] px-3 py-2.5 rounded-[10px] bg-[var(--color-bg-gray-lighter)] border border-[var(--color-border)]">
          不用一次想全。GTD 那条省力点就在这：<strong>只想下一步就够了</strong>——
          一次把项目拆完本身就是巨大的负担，会直接把人劝退。
          <br />
          写完一条会自动体检一次：中途要不要停下来动脑、做完了知不知道算完。
        </p>
      )}

      <div className="w-full flex flex-col gap-1.5">
        {mine.map((s) => {
          const task = s.taskId ? tasks.find((t) => t.id === s.taskId) : undefined;
          const isDone = task?.status === "done";
          const info = s.blocker ? BLOCKER_LABEL[s.blocker] : null;
          return (
            <div
              key={s.id}
              className="w-full flex flex-col gap-1.5 px-3 py-2.5 rounded-[10px] bg-white border border-[var(--color-border)]"
            >
              <div className="w-full flex items-start gap-2">
                {isDone ? (
                  <Check className="w-4 h-4 text-[#16A34A] flex-shrink-0 mt-0.5" />
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-text-tertiary)] flex-shrink-0 mt-[7px]" />
                )}
                {editingId === s.id ? (
                  <input
                    type="text"
                    value={editText}
                    autoFocus
                    onChange={(e) => setEditText(e.target.value)}
                    onBlur={() => {
                      const t = editText.trim();
                      if (t && t !== s.text) onEditText(s.id, t);
                      setEditingId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.nativeEvent.isComposing) e.currentTarget.blur();
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="flex-1 min-w-0 px-1.5 py-0.5 rounded border border-[var(--color-primary)] text-[13px] focus:outline-none"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(s.id);
                      setEditText(s.text);
                    }}
                    className={[
                      "flex-1 min-w-0 text-left text-[13px] leading-snug break-words",
                      isDone
                        ? "text-[var(--color-text-tertiary)] line-through"
                        : "text-[var(--color-text-primary)]",
                    ].join(" ")}
                  >
                    {s.text}
                  </button>
                )}
                {checking.has(s.id) && (
                  <Loader2 className="w-3.5 h-3.5 text-[var(--color-text-tertiary)] animate-spin flex-shrink-0 mt-0.5" />
                )}
                <button
                  type="button"
                  onClick={() => onDelete(s.id)}
                  className="w-[18px] h-[18px] flex items-center justify-center flex-shrink-0 mt-0.5"
                  aria-label="删除步骤"
                >
                  <Trash2 className="w-[15px] h-[15px] text-[#A1A1AA]" />
                </button>
              </div>

              {/* 一行只报一个问题，和焦点地图同一套三个时刻 */}
              {info && (
                <div className="w-full flex flex-col gap-1 pl-3.5">
                  <div className="flex items-start gap-1.5 text-[11px] leading-snug text-[#B45309]">
                    <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-[2px]" />
                    <span className="flex-1">
                      <strong>
                        {info.moment} · {info.label}
                      </strong>
                      {s.reason ? `（${s.reason}）` : ""} —— {info.hint}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleFix(s)}
                    disabled={fixing === s.id}
                    className="self-start px-2.5 py-1 rounded-md bg-[#FEF3C7] text-[#92400E] text-[11px] font-medium hover:bg-[#FDE68A] transition-colors disabled:opacity-60"
                  >
                    {fixing === s.id ? "改写中…" : "改成能无脑做的说法"}
                  </button>
                </div>
              )}

              {fixOptions?.forId === s.id && (
                <div className="w-full flex flex-col gap-1 pl-3.5">
                  <span className="text-[10px] text-[var(--color-text-tertiary)]">
                    挑一个替换（动作没变，只加了边界）
                  </span>
                  {fixOptions.texts.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        onEditText(s.id, t);
                        setFixOptions(null);
                      }}
                      className="w-full text-left px-2.5 py-1.5 rounded-md bg-[var(--color-bg-gray-lighter)] border border-[var(--color-border)] text-[12px] text-[var(--color-text-primary)] hover:border-[var(--color-primary)] transition-colors"
                    >
                      {t}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setFixOptions(null)}
                    className="self-start px-2 py-0.5 text-[11px] text-[var(--color-text-tertiary)]"
                  >
                    都不要
                  </button>
                </div>
              )}

              {/* 出口：排到某天。别让任何一条变成死路 */}
              <div className="w-full flex items-center gap-2 pl-3.5">
                {task ? (
                  <>
                    <span className="text-[11px] text-[var(--color-text-secondary)]">
                      已排到 {task.date.slice(5).replace("-", "月")}日
                    </span>
                    <button
                      type="button"
                      onClick={() => onUnschedule(s.id)}
                      className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-gray-light)] transition-colors"
                    >
                      <Undo2 className="w-3 h-3" />
                      撤回排期
                    </button>
                  </>
                ) : pickDateFor === s.id ? (
                  <div className="flex items-center gap-1 flex-wrap">
                    {next7.map((d, i) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => {
                          onSchedule(s.id, s.text, d);
                          setPickDateFor(null);
                        }}
                        className="px-2 py-1 rounded-md border border-[var(--color-border)] bg-white text-[11px] text-[var(--color-text-secondary)] hover:border-[var(--color-primary)] transition-colors"
                      >
                        {i === 0 ? "今天" : i === 1 ? "明天" : d.slice(5).replace("-", "/")}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setPickDateFor(null)}
                      className="px-2 py-1 text-[11px] text-[var(--color-text-tertiary)]"
                    >
                      取消
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPickDateFor(s.id)}
                    className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-[var(--color-primary)] hover:bg-[var(--color-primary-light)] transition-colors"
                  >
                    <CalendarPlus className="w-3 h-3" />
                    排到某天
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
