"use client";

import { useEffect, useRef, useState } from "react";
import type {
  Aspiration,
  TimeEntry,
  AspirationKind,
  BehaviorCard,
  BehaviorType,
  Habit,
  ISODate,
  Task,
} from "@/components/todo/types";
import { guessMeasure, isActionable, isGolden, pendingJudgement } from "@/components/todo/behavior";
import { callBehaviorAPI } from "@/components/todo/behaviorApi";
import { goalColor } from "@/components/todo/goal";
import { formatMinutes } from "@/components/todo/time";
import FocusMapView from "@/components/FocusMapView";
import ConfirmDialog from "@/components/ConfirmDialog";
import { ArrowLeft, ChevronRight, Plus, RefreshCw, Trash2, Undo2, X } from "lucide-react";

type Judgement = { id: string; type: BehaviorType; reason?: string; hasDecision?: boolean };

type Props = {
  aspirations: Aspiration[];
  behaviors: BehaviorCard[];
  tasks: Task[];
  habits: Habit[];
  entries: TimeEntry[];
  weekDates: ISODate[];
  onBack: () => void;
  onCreateAspiration: (title: string, kind: AspirationKind) => void;
  onDeleteAspiration: (id: string) => void;
  onAddBehaviors: (aspirationId: string, items: Array<{ text: string; type?: BehaviorType }>) => void;
  onApplyJudgements: (results: Judgement[]) => void;
  onSetBehaviorType: (id: string, type: BehaviorType) => void;
  onShrinkBehavior: (id: string, text: string) => void;
  onEditBehaviorText: (id: string, text: string) => void;
  onScheduleBehavior: (cardId: string, title: string, date: ISODate) => void;
  onUnscheduleBehavior: (cardId: string) => void;
  onSetBehaviorAxis: (id: string, patch: { impact?: number; feasibility?: number }) => void;
  onResetBehaviorAxes: (aspirationId: string) => void;
  onSetWeeklyLimit: (aspirationId: string, limit: number | null) => void;
  onDeleteBehavior: (id: string) => void;
  onAddHabit: (input: Omit<Habit, "id" | "createdAt">) => void;
  onRemoveHabitByBehavior: (behaviorId: string) => void;
  onUndo: () => void;
  canUndo: boolean;
};

const KIND_LABEL: Record<AspirationKind, string> = { aspiration: "愿望", outcome: "结果" };

export default function GoalsView({
  aspirations,
  behaviors,
  tasks,
  habits,
  entries,
  weekDates,
  onBack,
  onCreateAspiration,
  onDeleteAspiration,
  onAddBehaviors,
  onApplyJudgements,
  onSetBehaviorType,
  onShrinkBehavior,
  onEditBehaviorText,
  onScheduleBehavior,
  onUnscheduleBehavior,
  onSetBehaviorAxis,
  onResetBehaviorAxes,
  onSetWeeklyLimit,
  onDeleteBehavior,
  onAddHabit,
  onRemoveHabitByBehavior,
  onUndo,
  canUndo,
}: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newKind, setNewKind] = useState<AspirationKind>("aspiration");
  const [deleteAspId, setDeleteAspId] = useState<string | null>(null);
  const [rejudging, setRejudging] = useState(false);

  const open = openId ? aspirations.find((a) => a.id === openId) ?? null : null;
  const openCards = open ? behaviors.filter((b) => b.aspirationId === open.id) : [];
  const habitBehaviorIds = new Set(
    habits.filter((h) => !h.archived && h.behaviorId).map((h) => h.behaviorId!),
  );

  // 新条目自己去判定，不用点按钮。非阻塞：行立刻出现（"判定中…"），
  // 700ms 内连着加的攒成一次请求。
  //
  // 去重的 key 必须是 **id + 文字**，不能只用 id：改完文字后条目会退回未判定等重判，
  // 但 id 没变，只按 id 记就会被当成"问过了"直接跳过——那就永远停在未判定。
  const autoJudgedRef = useRef<Set<string>>(new Set());
  const [judging, setJudging] = useState<Set<string>>(new Set());
  const judgeKey = (b: BehaviorCard) => `${b.id}::${b.text}`;
  const pendingKey = open ? pendingJudgement(openCards).map(judgeKey).join("|") : "";

  useEffect(() => {
    if (!open) return;
    const todo = pendingJudgement(behaviors.filter((b) => b.aspirationId === open.id)).filter(
      (b) => !autoJudgedRef.current.has(judgeKey(b)),
    );
    if (todo.length === 0) return;
    const timer = setTimeout(() => {
      todo.forEach((b) => autoJudgedRef.current.add(judgeKey(b)));
      setJudging(new Set(todo.map((b) => b.id)));
      void (async () => {
        const res = await callBehaviorAPI({
          mode: "sort",
          goal: open.title,
          items: todo.map((b) => ({ id: b.id, text: b.text })),
        });
        setJudging(new Set());
        if (!res.ok) {
          // 判不了就留在"未判定"，行上会提示自己点标签定一个
          todo.forEach((b) => autoJudgedRef.current.delete(judgeKey(b)));
          return;
        }
        const results = Array.isArray(res.data.results) ? (res.data.results as Judgement[]) : [];
        if (results.length > 0) onApplyJudgements(results);
      })();
    }, 700);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingKey, openId]);

  /**
   * 重新判定这个目标下的全部条目。判定标准（prompt）会随着使用不断改进，
   * 但 hasDecision / type 只在判定那一刻写一次，老条目不会自己更新——
   * 所以要给个手动重来的口子。**你手动改判过的不动**（applyJudgements 里挡着）。
   */
  async function handleRejudge() {
    if (!open || rejudging) return;
    const all = behaviors.filter((b) => b.aspirationId === open.id);
    if (all.length === 0) return;
    setRejudging(true);
    // 分批，一次最多 40 条（API 上限）
    for (let i = 0; i < all.length; i += 30) {
      const batch = all.slice(i, i + 30);
      const res = await callBehaviorAPI({
        mode: "sort",
        goal: open.title,
        items: batch.map((b) => ({ id: b.id, text: b.text })),
      });
      if (res.ok) {
        const results = Array.isArray(res.data.results) ? (res.data.results as Judgement[]) : [];
        if (results.length > 0) {
          onApplyJudgements(results);
          batch.forEach((b) => autoJudgedRef.current.add(judgeKey(b)));
        }
      }
    }
    setRejudging(false);
  }

  function handleCreate() {
    const t = newTitle.trim();
    if (!t) return;
    onCreateAspiration(t, newKind);
    setNewTitle("");
    setNewKind("aspiration");
    setAdding(false);
  }

  function handleAddHabit(card: BehaviorCard) {
    if (!open) return;
    onAddHabit({
      title: card.text,
      measure: guessMeasure(card.text),
      behaviorId: card.id,
      aspirationId: open.id,
    });
  }

  function handleDeleteAspiration() {
    if (!deleteAspId) return;
    onDeleteAspiration(deleteAspId);
    if (openId === deleteAspId) setOpenId(null);
    setDeleteAspId(null);
  }

  return (
    <div className="w-[420px] bg-[var(--color-bg-white)] flex flex-col rounded-[16px] overflow-hidden border border-[var(--color-border)]">
      <div className="w-full flex items-center gap-2 px-6 pt-6 pb-4">
        <button
          type="button"
          onClick={open ? () => setOpenId(null) : onBack}
          className="w-9 h-9 rounded-lg border-[1.5px] border-[var(--color-border)] flex items-center justify-center bg-white hover:bg-[var(--color-bg-gray-light)] transition-colors flex-shrink-0"
          aria-label="返回"
        >
          <ArrowLeft className="w-4 h-4 text-[var(--color-text-secondary)]" />
        </button>
        <div className="flex-1 flex flex-col gap-0.5 min-w-0">
          <h1 className="text-[var(--color-text-primary)] text-[22px] font-bold tracking-[-0.5px] truncate">
            {open ? open.title : "我的目标"}
          </h1>
          <p className="text-[var(--color-text-secondary)] text-[12px]">
            {open ? `${KIND_LABEL[open.kind]} · 把它拆成能做的行为` : "所有任务和习惯的来源"}
          </p>
        </div>
        {canUndo && (
          <button
            type="button"
            onClick={onUndo}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[12px] font-semibold text-[var(--color-primary)] hover:bg-[var(--color-primary-light)] transition-colors flex-shrink-0"
            title="撤回上一步"
          >
            <Undo2 className="w-3.5 h-3.5" />
            撤回
          </button>
        )}
        {!open && (
          <button
            type="button"
            onClick={onBack}
            className="w-8 h-8 flex items-center justify-center flex-shrink-0"
            aria-label="关闭"
          >
            <X className="w-4 h-4 text-[var(--color-text-tertiary)]" />
          </button>
        )}
      </div>

      <div className="w-full flex flex-col gap-4 px-6 pb-6">
        {open ? (
          <>
            {/* 每周投入上限：排主线时用它算额度，超了标黄不拦 */}
            <div className="w-full flex items-center gap-1.5 flex-wrap px-3 py-2 rounded-[10px] bg-[var(--color-bg-gray-lighter)] border border-[var(--color-border)]">
              <span className="text-[11px] text-[var(--color-text-secondary)] flex-shrink-0">
                每周最多排
              </span>
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => onSetWeeklyLimit(open.id, open.weeklyLimit === n ? null : n)}
                  className={[
                    "w-6 h-6 rounded-md border text-[11px] font-medium transition-colors",
                    open.weeklyLimit === n
                      ? "bg-[var(--color-primary)] border-[var(--color-primary)] text-white"
                      : "bg-white border-[var(--color-border)] text-[var(--color-text-secondary)]",
                  ].join(" ")}
                >
                  {n}
                </button>
              ))}
              <span className="text-[11px] text-[var(--color-text-tertiary)]">
                天{open.weeklyLimit == null ? "（现在不限）" : ""}
              </span>
              <div className="flex-1" />
              <button
                type="button"
                onClick={handleRejudge}
                disabled={rejudging}
                className="flex items-center gap-1 px-2 py-1 rounded-md border border-[var(--color-border)] bg-white text-[11px] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-gray-light)] transition-colors disabled:opacity-50 flex-shrink-0"
                title="判定标准改进过之后，老条目不会自己更新，点这里全部重判一遍（你手动改过的不动）"
              >
                <RefreshCw className={["w-3 h-3", rejudging ? "animate-spin" : ""].join(" ")} />
                {rejudging ? "重判中..." : "全部重判"}
              </button>
            </div>

            <FocusMapView
            aspiration={open}
            cards={openCards}
            tasks={tasks}
            onSetAxis={onSetBehaviorAxis}
            onResetAxes={() => onResetBehaviorAxes(open.id)}
            onDelete={onDeleteBehavior}
            onReplaceText={onShrinkBehavior}
            onAddExtra={(items) => onAddBehaviors(open.id, items)}
            onAdd={(text) => onAddBehaviors(open.id, [{ text }])}
            onEditText={onEditBehaviorText}
            onSetType={onSetBehaviorType}
            onCollect={(items) => onAddBehaviors(open.id, items)}
            onSchedule={onScheduleBehavior}
            onUnschedule={onUnscheduleBehavior}
            onAddHabit={handleAddHabit}
            onRemoveHabit={onRemoveHabitByBehavior}
            habitBehaviorIds={habitBehaviorIds}
              judgingIds={judging}
            />
          </>
        ) : (
          <>
            <div className="w-full flex items-center justify-between">
              <span className="text-[var(--color-text-primary)] text-[15px] font-semibold">
                目标 {aspirations.length > 0 ? aspirations.length : ""}
              </span>
              <button
                type="button"
                onClick={() => setAdding((v) => !v)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--color-primary)] text-white text-[13px] font-medium hover:bg-[#1d4ed8] transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                新目标
              </button>
            </div>

            {adding && (
              <div className="w-full flex flex-col gap-2.5 p-3.5 rounded-[10px] bg-[var(--color-bg-gray-lighter)] border-[1.5px] border-[var(--color-primary)]">
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) handleCreate();
                  }}
                  placeholder="想实现什么？如「早点睡」「一个月瘦5斤」"
                  autoFocus
                  className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] text-[14px] bg-white focus:outline-none focus:border-[var(--color-primary)]"
                />
                <div className="flex items-center gap-2">
                  {(["aspiration", "outcome"] as AspirationKind[]).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setNewKind(k)}
                      className={[
                        "px-3 py-1.5 rounded-md border text-[12px] font-medium transition-colors",
                        newKind === k
                          ? "bg-[var(--color-primary)] border-[var(--color-primary)] text-white"
                          : "bg-white border-[var(--color-border)] text-[var(--color-text-secondary)]",
                      ].join(" ")}
                    >
                      {KIND_LABEL[k]}
                    </button>
                  ))}
                  <span className="text-[11px] text-[var(--color-text-tertiary)]">
                    {newKind === "aspiration" ? "抽象的期望" : "可衡量的目标"}
                  </span>
                  <div className="flex-1" />
                  <button
                    type="button"
                    onClick={() => {
                      setAdding(false);
                      setNewTitle("");
                    }}
                    className="px-3 py-1.5 rounded text-[12px] text-[var(--color-text-secondary)] hover:bg-white transition-colors"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleCreate}
                    disabled={!newTitle.trim()}
                    className={[
                      "px-4 py-1.5 rounded text-[12px] font-medium transition-colors",
                      newTitle.trim()
                        ? "bg-[var(--color-primary)] text-white hover:bg-[#1d4ed8]"
                        : "bg-[var(--color-bg-gray-light)] text-[var(--color-text-tertiary)] cursor-not-allowed",
                    ].join(" ")}
                  >
                    添加
                  </button>
                </div>
              </div>
            )}

            {aspirations.length === 0 ? (
              <div className="w-full flex flex-col gap-2 p-4 rounded-[10px] bg-[var(--color-bg-gray-lighter)] border border-[var(--color-border)]">
                <span className="text-[13px] font-semibold text-[var(--color-text-primary)]">
                  怎么用（福格行为设计）
                </span>
                <p className="text-[12px] leading-relaxed text-[var(--color-text-secondary)]">
                  <strong>1. 先写下一个目标</strong>
                  <br />
                  就是那种你想要、但没法直接"去做"的事：<em>想早点睡</em>、<em>想瘦下来</em>、
                  <em>想把自媒体做起来</em>、<em>想考上研</em>。
                  <br />
                  这些都不是行为——你没法执行一句"想早点睡"，所以才需要往下拆。
                  <br />
                  <br />
                  <strong>2. 点进去，把能想到的做法都写进去</strong>
                  <br />
                  一条一句话，回车一条，别管好坏、别管做不做得到，先写出来再说。
                  想不出来就点「魔法棒」，AI 一次给你十条。
                  <br />
                  <br />
                  <strong>3. 每条拖两根滑块</strong>
                  <br />
                  这事对目标有多大用 / 你有多容易做到。
                  <br />
                  <br />
                  <strong>4. 落在右上角的就是黄金行为</strong>
                  <br />
                  又有用、又做得到的那几条。一次性的排到某天，可重复的加进习惯表。
                </p>
              </div>
            ) : (
              <div className="w-full flex flex-col gap-2">
                {aspirations.map((a, i) => {
                  const cards = behaviors.filter((b) => b.aspirationId === a.id);
                  const un = cards.filter((c) => c.type === "unsorted").length;
                  // 两条腿：任务腿=推进，习惯腿=维持。缺任何一条都走不动，
                  // 所以并排放着让空的那条无处遁形（0 标灰，不弹提示、不打分）
                  const taskLeg = tasks.filter(
                    (t) => t.aspirationId === a.id && t.status !== "done",
                  ).length;
                  const habitLeg = habits.filter((h) => h.aspirationId === a.id && !h.archived).length;
                  const invested = entries
                    .filter((e) => e.aspirationId === a.id && weekDates.includes(e.date))
                    .reduce((s, e) => s + e.minutes, 0);
                  return (
                    <div
                      key={a.id}
                      className="w-full flex items-center gap-2 px-3.5 py-3 rounded-[10px] bg-white border border-[var(--color-border)]"
                    >
                      <button
                        type="button"
                        onClick={() => setOpenId(a.id)}
                        className="flex-1 flex items-center gap-2.5 min-w-0 text-left"
                      >
                        <span
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: goalColor(a, i) }}
                        />
                        <div className="flex-1 flex flex-col gap-0.5 min-w-0">
                          <span className="text-[14px] font-medium text-[var(--color-text-primary)] truncate">
                            {a.title}
                          </span>
                          <span className="flex items-center gap-1.5 text-[11px]">
                            <span
                              className={
                                taskLeg === 0
                                  ? "text-[#D4A76A]"
                                  : "text-[var(--color-text-secondary)]"
                              }
                            >
                              任务 {taskLeg}
                            </span>
                            <span className="text-[var(--color-text-tertiary)]">·</span>
                            <span
                              className={
                                habitLeg === 0
                                  ? "text-[#D4A76A]"
                                  : "text-[var(--color-text-secondary)]"
                              }
                            >
                              习惯 {habitLeg}
                            </span>
                            <span className="text-[var(--color-text-tertiary)]">·</span>
                            <span className="text-[var(--color-text-tertiary)]">
                              本周 {invested > 0 ? formatMinutes(invested) : "0分钟"}
                            </span>
                            {un > 0 && (
                              <span className="text-[#EA580C]">· {un} 待判定</span>
                            )}
                          </span>
                        </div>
                        <ChevronRight className="w-4 h-4 text-[var(--color-text-tertiary)] flex-shrink-0" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteAspId(a.id)}
                        className="w-[18px] h-[18px] flex items-center justify-center flex-shrink-0"
                        aria-label="删除目标"
                      >
                        <Trash2 className="w-[16px] h-[16px] text-[#A1A1AA]" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        isOpen={deleteAspId !== null}
        title="删除这个目标？"
        description={(() => {
          const target = deleteAspId ? aspirations.find((a) => a.id === deleteAspId) : undefined;
          const n = deleteAspId ? behaviors.filter((b) => b.aspirationId === deleteAspId).length : 0;
          return target
            ? `「${target.title}」和它下面的 ${n} 个行为都会删掉，已排期但没做完的任务也会一起清掉。删错了可以点「撤回」`
            : undefined;
        })()}
        onConfirm={handleDeleteAspiration}
        onCancel={() => setDeleteAspId(null)}
      />
    </div>
  );
}
