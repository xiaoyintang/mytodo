"use client";

import { useEffect, useRef, useState } from "react";
import type {
  Aspiration,
  TimeEntry,
  AspirationKind,
  BehaviorCard,
  BehaviorType,
  GoalResult,
  Habit,
  ISODate,
  Task,
} from "@/components/todo/types";
import { guessMeasure, pendingJudgement } from "@/components/todo/behavior";
import { callBehaviorAPI } from "@/components/todo/behaviorApi";
import { goalColor } from "@/components/todo/goal";
import { formatMinutes } from "@/components/todo/time";
import FocusMapView from "@/components/FocusMapView";
import GoalResultsPanel, { UNASSIGNED_RESULT_ID } from "@/components/GoalResultsPanel";
import ConfirmDialog from "@/components/ConfirmDialog";
import { ArrowLeft, ChevronRight, Plus, Search, Trash2, Undo2, X } from "lucide-react";

type Judgement = {
  id: string;
  type: BehaviorType;
  reason?: string;
  blocker?: "timing" | "decision" | "endpoint";
};

type Props = {
  initialOpenId?: string | null;
  aspirations: Aspiration[];
  goalResults: GoalResult[];
  behaviors: BehaviorCard[];
  tasks: Task[];
  habits: Habit[];
  entries: TimeEntry[];
  weekDates: ISODate[];
  onBack: () => void;
  onCreateAspiration: (title: string, kind: AspirationKind) => void;
  onDeleteAspiration: (id: string) => void;
  onCreateGoalResult: (aspirationId: string, title: string, evidence?: string) => string;
  onUpdateGoalResult: (id: string, patch: { title?: string; evidence?: string }) => void;
  onDeleteGoalResult: (id: string) => void;
  onAssignBehaviorResult: (behaviorId: string, resultId?: string) => void;
  onApplyGoalResultStructure: (
    aspirationId: string,
    groups: Array<{ title: string; evidence?: string; behaviorIds: string[] }>,
  ) => string[];
  onAddBehaviors: (
    aspirationId: string,
    items: Array<{ text: string; type?: BehaviorType }>,
    resultId?: string,
  ) => void;
  onApplyJudgements: (results: Judgement[]) => void;
  onSetBehaviorType: (id: string, type: BehaviorType) => void;
  onShrinkBehavior: (id: string, text: string) => void;
  onEditBehaviorText: (id: string, text: string) => void;
  onScheduleBehavior: (cardId: string, title: string, date: ISODate) => void;
  onUnscheduleBehavior: (cardId: string) => void;
  onSetBehaviorAxis: (id: string, patch: { impact?: number; feasibility?: number }) => void;
  onResetBehaviorAxes: (behaviorIds: string[]) => void;
  onSetWeeklyLimit: (aspirationId: string, limit: number | null) => void;
  onDeleteBehavior: (id: string) => void;
  onAddHabit: (input: Omit<Habit, "id" | "createdAt">) => void;
  onRemoveHabitByBehavior: (behaviorId: string) => void;
  onUndo: () => void;
  canUndo: boolean;
};

const KIND_LABEL: Record<AspirationKind, string> = { aspiration: "愿望", outcome: "结果" };

export default function GoalsView({
  initialOpenId = null,
  aspirations,
  goalResults,
  behaviors,
  tasks,
  habits,
  entries,
  weekDates,
  onBack,
  onCreateAspiration,
  onDeleteAspiration,
  onCreateGoalResult,
  onUpdateGoalResult,
  onDeleteGoalResult,
  onAssignBehaviorResult,
  onApplyGoalResultStructure,
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
  const [openId, setOpenId] = useState<string | null>(initialOpenId);
  const [activeResultId, setActiveResultId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newKind, setNewKind] = useState<AspirationKind>("aspiration");
  const [query, setQuery] = useState("");
  const [deleteAspId, setDeleteAspId] = useState<string | null>(null);
  const [rejudging, setRejudging] = useState(false);
  const [rejudgeDone, setRejudgeDone] = useState(0);

  const open = openId ? aspirations.find((a) => a.id === openId) ?? null : null;
  const openCards = open ? behaviors.filter((b) => b.aspirationId === open.id) : [];
  const openResults = open ? goalResults.filter((result) => result.aspirationId === open.id) : [];
  const resultIds = new Set(openResults.map((result) => result.id));
  const unassignedCards = openCards.filter(
    (card) => !card.resultId || !resultIds.has(card.resultId),
  );
  const resolvedResultId =
    activeResultId === UNASSIGNED_RESULT_ID && unassignedCards.length > 0
      ? UNASSIGNED_RESULT_ID
      : openResults.some((result) => result.id === activeResultId)
        ? activeResultId
        : openResults[0]?.id ?? null;
  const selectedResult = openResults.find((result) => result.id === resolvedResultId) ?? null;
  const focusCards =
    openResults.length === 0
      ? openCards
      : resolvedResultId === UNASSIGNED_RESULT_ID
        ? unassignedCards
        : openCards.filter((card) => card.resultId === resolvedResultId);
  const habitBehaviorIds = new Set(
    habits.filter((h) => !h.archived && h.behaviorId).map((h) => h.behaviorId!),
  );
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
  const visibleAspirations = normalizedQuery
    ? aspirations.filter((a) => a.title.toLocaleLowerCase("zh-CN").includes(normalizedQuery))
    : aspirations;

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
   * 但 blocker / type 只在判定那一刻写一次，老条目不会自己更新——
   * 所以要给个手动重来的口子。**你手动改判过的不动**（applyJudgements 里挡着）。
   */
  async function handleRejudge() {
    if (!open || rejudging) return;
    const all = focusCards;
    if (all.length === 0) return;
    setRejudging(true);
    setRejudgeDone(0);
    // 手动重判开思考——6/6 对 vs 关思考 5/6，代价是慢。
    // 但**思考时间随条目数涨得很快**：6 条一批要 23~45 秒（方差还大到能撞超时），
    // 3 条一批只要几秒。所以切小批 + 并发，9 条实测 8~20 秒跑完。
    // 并发上限 4，别把接口打出限流。自动判定那条路仍然关思考图快。
    const batches: BehaviorCard[][] = [];
    for (let i = 0; i < all.length; i += 3) batches.push(all.slice(i, i + 3));

    const runBatch = async (batch: BehaviorCard[]) => {
      const res = await callBehaviorAPI({
        mode: "sort",
        think: true,
        goal: selectedResult?.title ?? open.title,
        items: batch.map((b) => ({ id: b.id, text: b.text })),
      });
      if (res.ok) {
        const results = Array.isArray(res.data.results) ? (res.data.results as Judgement[]) : [];
        if (results.length > 0) {
          onApplyJudgements(results);
          batch.forEach((b) => autoJudgedRef.current.add(judgeKey(b)));
        }
      }
      setRejudgeDone((n) => n + batch.length);
    };

    for (let i = 0; i < batches.length; i += 4) {
      await Promise.all(batches.slice(i, i + 4).map(runBatch));
    }
    setRejudging(false);
    setRejudgeDone(0);
  }

  function handleCreate() {
    const t = newTitle.trim();
    if (!t) return;
    onCreateAspiration(t, newKind);
    setNewTitle("");
    setNewKind("aspiration");
    setQuery("");
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
    <div className="flex min-h-full w-full max-w-[460px] flex-col overflow-hidden bg-[var(--color-bg-white)] pb-14 sm:min-h-0 sm:rounded-[16px] sm:border sm:border-[var(--color-border)] sm:pb-0 md:min-h-[calc(100vh-48px)] md:max-w-[960px] lg:max-w-[1040px]">
      <div className="w-full flex items-center gap-2 px-6 pt-6 pb-4">
        <button
          type="button"
          onClick={
            open
              ? initialOpenId
                ? onBack
                : () => {
                    setOpenId(null);
                    setActiveResultId(null);
                  }
              : onBack
          }
          className="w-9 h-9 rounded-lg border-[1.5px] border-[var(--color-border)] flex items-center justify-center bg-white hover:bg-[var(--color-bg-gray-light)] transition-colors flex-shrink-0"
          aria-label="返回"
        >
          <ArrowLeft className="w-4 h-4 text-[var(--color-text-secondary)]" />
        </button>
        <div className="flex-1 flex flex-col gap-0.5 min-w-0">
          <h1
            className={`text-[22px] font-bold leading-tight tracking-[-0.5px] text-[var(--color-text-primary)] ${
              open ? "line-clamp-2" : "truncate"
            }`}
            title={open ? open.title : "我的目标"}
          >
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
            </div>

            <GoalResultsPanel
              key={open.id}
              aspiration={open}
              results={openResults}
              cards={openCards}
              activeResultId={resolvedResultId}
              onSelect={setActiveResultId}
              onCreate={(title, evidence) => onCreateGoalResult(open.id, title, evidence)}
              onUpdate={onUpdateGoalResult}
              onDelete={onDeleteGoalResult}
              onApplyStructure={(groups) => onApplyGoalResultStructure(open.id, groups)}
            />

            <div
              className={`rounded-[10px] border px-3 py-2 ${
                resolvedResultId === UNASSIGNED_RESULT_ID
                  ? "border-[#FDBA74] bg-[#FFF7ED]"
                  : "border-[#BFDBFE] bg-[#F8FAFF]"
              }`}
            >
              <p className="text-[11px] font-semibold text-[var(--color-text-primary)]">
                {openResults.length === 0
                  ? "直接行为模式 · 所有行为共用一张图"
                  : selectedResult
                    ? `正在比较：${selectedResult.title}`
                    : "未归属行为 · 先决定它们服务于哪个结果"}
              </p>
              <p className="mt-0.5 text-[10px] leading-relaxed text-[var(--color-text-tertiary)]">
                {selectedResult?.evidence ||
                  (openResults.length === 0
                    ? "目标变复杂时，再添加关键结果也来得及。"
                    : "这张焦点地图只比较同一条结果下的行为。")}
              </p>
            </div>

            <FocusMapView
              key={resolvedResultId ?? "direct"}
              aspiration={open}
              focusTitle={selectedResult?.title ?? open.title}
              resultOptions={openResults}
              cards={focusCards}
              tasks={tasks}
              onSetAxis={onSetBehaviorAxis}
              onResetAxes={() => onResetBehaviorAxes(focusCards.map((card) => card.id))}
              onDelete={onDeleteBehavior}
              onReplaceText={onShrinkBehavior}
              onAddExtra={(items) => onAddBehaviors(open.id, items, selectedResult?.id)}
              onAdd={(text) => onAddBehaviors(open.id, [{ text }], selectedResult?.id)}
              onEditText={onEditBehaviorText}
              onSetType={onSetBehaviorType}
              onCollect={(items) => onAddBehaviors(open.id, items, selectedResult?.id)}
              onAssignResult={onAssignBehaviorResult}
              onSchedule={onScheduleBehavior}
              onUnschedule={onUnscheduleBehavior}
              onAddHabit={handleAddHabit}
              onRemoveHabit={onRemoveHabitByBehavior}
              habitBehaviorIds={habitBehaviorIds}
              judgingIds={judging}
              onRejudgeAll={handleRejudge}
              rejudging={rejudging}
              rejudgeProgress={rejudgeDone}
              rejudgeTotal={focusCards.length}
            />
          </>
        ) : (
          <>
            <div className="w-full flex items-center justify-between">
              <div className="flex flex-col gap-0.5">
                <span className="text-[var(--color-text-primary)] text-[15px] font-semibold">
                  目标 {aspirations.length > 0 ? aspirations.length : ""}
                </span>
                {aspirations.length > 0 && (
                  <span className="text-[10px] text-[var(--color-text-tertiary)]">
                    每个目标都有自己的任务、习惯和投入
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setAdding((v) => !v)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--color-primary)] text-white text-[13px] font-medium hover:bg-[#1d4ed8] transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                新目标
              </button>
            </div>

            {aspirations.length >= 5 && (
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={`搜索 ${aspirations.length} 个目标`}
                  className="w-full rounded-[10px] border border-[var(--color-border)] bg-[var(--color-bg-gray-lighter)] py-2 pl-9 pr-14 text-[13px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-primary)] focus:bg-white focus:outline-none"
                />
                {query ? (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="absolute right-2.5 top-1/2 flex h-6 items-center gap-1 -translate-y-1/2 rounded-md px-1.5 text-[10px] text-[var(--color-text-tertiary)] hover:bg-white"
                    aria-label="清空搜索"
                  >
                    {visibleAspirations.length}/{aspirations.length}
                    <X className="h-3 w-3" />
                  </button>
                ) : null}
              </div>
            )}

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
                  这些都不是行为——你没法执行一句"想早点睡"，所以要先生成一些可能的行为方案。
                  <br />
                  <br />
                  <strong>2. 目标复杂时，先分关键结果</strong>
                  <br />
                  简单目标直接写行为；如果行为一多就混乱，先说明哪几种变化算推进，再分别找行为。
                  已经写了一堆行为，也可以让 AI 先提议分组，确认后才会修改。
                  <br />
                  <br />
                  <strong>3. 每条拖两根滑块</strong>
                  <br />
                  这事对目标有多大用 / 你有多容易做到。
                  <br />
                  <br />
                  <strong>4. 落在右上角的就是黄金行为</strong>
                  <br />
                  又有用、又做得到的那几条。一次性行为安排到某天成为任务，可重复行为加入习惯。
                </p>
              </div>
            ) : visibleAspirations.length === 0 ? (
              <div className="flex w-full flex-col items-center gap-2 rounded-[12px] border border-dashed border-[var(--color-border)] bg-[var(--color-bg-gray-lighter)] px-4 py-8 text-center">
                <Search className="h-5 w-5 text-[var(--color-text-tertiary)]" />
                <span className="text-[13px] font-medium text-[var(--color-text-secondary)]">
                  没找到“{query.trim()}”
                </span>
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="text-[12px] font-medium text-[var(--color-primary)]"
                >
                  看全部目标
                </button>
              </div>
            ) : (
              <div className="grid w-full grid-cols-1 gap-1.5 md:grid-cols-2 md:gap-3">
                {visibleAspirations.map((a) => {
                  const originalIndex = aspirations.findIndex((item) => item.id === a.id);
                  const color = goalColor(a, originalIndex);
                  const cards = behaviors.filter((b) => b.aspirationId === a.id);
                  const un = cards.filter((c) => c.type === "unsorted").length;
                  // 两条腿：任务腿=推进，习惯腿=维持。缺任何一条都走不动，
                  // 所以并排放着让空的那条无处遁形（0 标灰，不弹提示、不打分）
                  const taskLeg = tasks.filter(
                    (t) => t.aspirationId === a.id && t.status !== "done",
                  ).length;
                  const habitLeg = habits.filter((h) => h.aspirationId === a.id && !h.archived).length;
                  const resultCount = goalResults.filter((result) => result.aspirationId === a.id).length;
                  const invested = entries
                    .filter((e) => e.aspirationId === a.id && weekDates.includes(e.date))
                    .reduce((s, e) => s + e.minutes, 0);
                  return (
                    <div
                      key={a.id}
                      className="group relative w-full overflow-hidden rounded-[12px] border bg-white transition-[border-color,box-shadow,transform] hover:-translate-y-px hover:shadow-sm"
                      style={{ borderColor: `${color}35` }}
                    >
                      <span
                        className="absolute inset-y-0 left-0 w-1"
                        style={{ backgroundColor: color }}
                      />
                      <div
                        className="pointer-events-none absolute inset-0 opacity-60"
                        style={{ background: `linear-gradient(90deg, ${color}0D 0%, transparent 48%)` }}
                      />
                      <div className="relative flex min-h-[54px] w-full items-center gap-1 py-2 pl-3.5 pr-2">
                        <button
                          type="button"
                          onClick={() => {
                            setOpenId(a.id);
                            setActiveResultId(null);
                          }}
                          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                        >
                          <div className="flex min-w-0 flex-1 flex-col gap-1">
                            <span
                              className="truncate text-[14px] font-semibold leading-[18px] text-[var(--color-text-primary)]"
                              title={a.title}
                            >
                              {a.title}
                            </span>
                            <span className="flex min-w-0 items-center gap-1.5 whitespace-nowrap text-[10px] leading-[14px]">
                              {resultCount > 0 && (
                                <span className="text-[var(--color-primary)]">
                                  结果 {resultCount}
                                </span>
                              )}
                              <span
                                className={taskLeg === 0 ? "text-[#C27720]" : "text-[var(--color-text-secondary)]"}
                              >
                                任务 {taskLeg}
                              </span>
                              <span
                                className={habitLeg === 0 ? "text-[#C27720]" : "text-[var(--color-text-secondary)]"}
                              >
                                习惯 {habitLeg}
                              </span>
                              <span className="truncate text-[var(--color-text-tertiary)]">
                                本周 {invested > 0 ? formatMinutes(invested) : "0分钟"}
                              </span>
                              {un > 0 && (
                                <span className="flex-shrink-0 text-[#EA580C]">· {un} 待判定</span>
                              )}
                            </span>
                          </div>
                          <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-[var(--color-text-tertiary)]" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteAspId(a.id)}
                          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-[var(--color-bg-gray-lighter)]"
                          aria-label="删除目标"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-[#A1A1AA]" />
                        </button>
                      </div>
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
