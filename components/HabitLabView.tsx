"use client";

import { useEffect, useRef, useState } from "react";
import type {
  Aspiration,
  AspirationKind,
  BehaviorCard,
  BehaviorType,
  Habit,
  HabitLog,
  ISODate,
  Task,
  TimeEntry,
  ViewMode,
} from "@/components/todo/types";
import { guessMeasure, isActionable, isGolden, pendingJudgement } from "@/components/todo/behavior";
import { callBehaviorAPI } from "@/components/todo/behaviorApi";
import FocusMapView from "@/components/FocusMapView";
import HabitTracker from "@/components/HabitTracker";
import { ArrowLeft, ChevronRight, Plus, Target, Trash2, Undo2 } from "lucide-react";
import ConfirmDialog from "@/components/ConfirmDialog";

type Judgement = { id: string; type: BehaviorType; reason?: string; hasDecision?: boolean };

type Props = {
  viewMode: ViewMode;
  onChangeViewMode: (mode: ViewMode) => void;
  aspirations: Aspiration[];
  behaviors: BehaviorCard[];
  onCreateAspiration: (title: string, kind: AspirationKind) => void;
  onDeleteAspiration: (id: string) => void;
  onAddBehaviors: (aspirationId: string, items: Array<{ text: string; type?: BehaviorType }>) => void;
  onApplyJudgements: (results: Judgement[]) => void;
  onUpdateBehaviorText: (id: string, text: string) => void;
  onSetBehaviorType: (id: string, type: BehaviorType) => void;
  onShrinkBehavior: (id: string, text: string) => void;
  onEditBehaviorText: (id: string, text: string) => void;
  onScheduleBehavior: (cardId: string, title: string, date: ISODate) => void;
  onUnscheduleBehavior: (cardId: string) => void;
  tasks: Task[];
  onSetBehaviorAxis: (id: string, patch: { impact?: number; feasibility?: number }) => void;
  onResetBehaviorAxes: (aspirationId: string) => void;
  onUndo: () => void;
  canUndo: boolean;
  entries: TimeEntry[];
  today: ISODate;
  habits: Habit[];
  habitLogs: HabitLog[];
  onAddHabit: (input: Omit<Habit, "id" | "createdAt">) => void;
  onRemoveHabitByBehavior: (behaviorId: string) => void;
  habitHasLogs: (habitId: string) => boolean;
  onLogHabit: (habitId: string) => void;
  onUndoHabitLog: (habitId: string) => void;
  onSetHabitAnchor: (habitId: string, anchor: string) => void;
  onToggleHabitMeasure: (habitId: string) => void;
  onDeleteHabit: (habitId: string) => void;
  onDeleteBehavior: (id: string) => void;
};

const TABS: Array<[ViewMode, string]> = [
  ["day", "日视图"],
  ["week", "周视图"],
  ["log", "记录"],
  ["habit", "习惯"],
];

const KIND_LABEL: Record<AspirationKind, string> = { aspiration: "愿望", outcome: "结果" };


export default function HabitLabView({
  viewMode,
  onChangeViewMode,
  aspirations,
  behaviors,
  onCreateAspiration,
  onDeleteAspiration,
  onAddBehaviors,
  onApplyJudgements,
  onUpdateBehaviorText,
  onSetBehaviorType,
  onShrinkBehavior,
  onEditBehaviorText,
  onScheduleBehavior,
  onUnscheduleBehavior,
  tasks,
  onSetBehaviorAxis,
  onResetBehaviorAxes,
  onUndo,
  canUndo,
  entries,
  today,
  habits,
  habitLogs,
  onAddHabit,
  onRemoveHabitByBehavior,
  habitHasLogs,
  onLogHabit,
  onUndoHabitLog,
  onSetHabitAnchor,
  onToggleHabitMeasure,
  onDeleteHabit,
  onDeleteBehavior,
}: Props) {
  const [openId, setOpenId] = useState<string | null>(null);

  // 新建愿望
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newKind, setNewKind] = useState<AspirationKind>("aspiration");

  // 收集口 / 判定 / 魔法棒
  const [busy, setBusy] = useState<"sort" | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const [deleteAspId, setDeleteAspId] = useState<string | null>(null);

  const [mapOpen, setMapOpen] = useState(false); // 三级页：焦点地图
  const [sub, setSub] = useState<"today" | "goals">("today");
  const [quickHabit, setQuickHabit] = useState(""); // 「我的习惯」里直接加，不走目标那条长路 // 首页分两栏，习惯多了不用一路下拉
  const habitBehaviorIds = new Set(habits.filter((h) => !h.archived && h.behaviorId).map((h) => h.behaviorId!));

  const open = openId ? aspirations.find((a) => a.id === openId) ?? null : null;
  const openCards = open ? behaviors.filter((b) => b.aspirationId === open.id) : [];
  const unsorted = openCards.filter((b) => b.type === "unsorted");
  // 可重复行为 + 一次性任务都上焦点地图（一次性任务也要筛：又难又没用的就别做了）
  // 这个愿望下的全部条目都进地图：能打分的正常排；未判定的标"判定中"；
  // 判成愿望/成果的留在原地并说明它执行不了——**你刚打进去的东西不能凭空消失**
  const actionable = openCards;
  const liveHabits = habits.filter((h) => !h.archived);
  const goldenCount = actionable.filter(isGolden).length;

  function resetTransient() {
    setNote(null);
    setBusy(null);
  }

  function handleCreateAspiration() {
    const t = newTitle.trim();
    if (!t) return;
    onCreateAspiration(t, newKind);
    setNewTitle("");
    setNewKind("aspiration");
    setAdding(false);
  }

  // 临时想到一个习惯：直接加，不归属任何目标（进「没有归属的目标」那组）
  function handleQuickAddHabit() {
    const t = quickHabit.trim();
    if (!t) return;
    onAddHabit({ title: t, measure: guessMeasure(t) });
    setQuickHabit("");
  }

  // 新加进来的条目自己就会去判定，不用你点按钮。
  // 非阻塞：行立刻出现（标着"判定中"），2 秒左右类型自己填上，你可以接着往下打。
  // 连着加几条会攒成一次请求。
  const autoJudgedRef = useRef<Set<string>>(new Set());
  const [judging, setJudging] = useState<Set<string>>(new Set());
  const pendingIds = open ? pendingJudgement(openCards).map((b) => b.id) : [];
  const pendingKey = pendingIds.join("|");

  useEffect(() => {
    if (!open || busy) return;
    const todo = pendingJudgement(behaviors.filter((b) => b.aspirationId === open.id)).filter(
      (b) => !autoJudgedRef.current.has(b.id),
    );
    if (todo.length === 0) return;
    const timer = setTimeout(() => {
      todo.forEach((b) => autoJudgedRef.current.add(b.id));
      setJudging(new Set(todo.map((b) => b.id)));
      void (async () => {
        const res = await callBehaviorAPI({
          mode: "sort",
          goal: open.title,
          items: todo.map((b) => ({ id: b.id, text: b.text })),
        });
        setJudging(new Set());
        if (!res.ok) {
          // 判不了就留在"未判定"，行上会提示自己点标签定一个（不会一直假装在判）
          todo.forEach((b) => autoJudgedRef.current.delete(b.id));
          return;
        }
        const results = Array.isArray(res.data.results) ? (res.data.results as Judgement[]) : [];
        if (results.length > 0) onApplyJudgements(results);
      })();
    }, 700); // 攒一下，连着打字不会一条一个请求
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingKey, openId]);

  // 黄金行为 → 微习惯。时长型 vs 发生型由行为本身决定
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
    if (openId === deleteAspId) {
      setOpenId(null);
    }
    setDeleteAspId(null);
  }

  return (
    <div className="w-[420px] bg-[var(--color-bg-white)] flex flex-col rounded-[16px] overflow-hidden border border-[var(--color-border)]">
      {/* Header */}
      <div className="w-full flex flex-col gap-1 px-6 pt-6 pb-4">
        <h1 className="text-[var(--color-text-primary)] text-[28px] font-bold tracking-[-0.5px]">
          习惯实验室
        </h1>
        <p className="text-[var(--color-text-secondary)] text-[14px] font-medium">
          把愿望拆成现在马上就能做的行为
        </p>
      </div>

      {/* Tabs */}
      <div className="w-full px-6">
        <div className="w-full flex gap-1 bg-[var(--color-bg-gray-light)] rounded-[10px] p-1">
          {TABS.map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => onChangeViewMode(mode)}
              className={[
                "flex-1 flex items-center justify-center rounded-lg px-2 py-[10px] transition-colors",
                viewMode === mode ? "bg-[var(--color-bg-white)] shadow-[0_1px_2px_rgba(0,0,0,0.05)]" : "hover:bg-white/60",
              ].join(" ")}
            >
              <span
                className={[
                  "text-[14px]",
                  viewMode === mode
                    ? "text-[var(--color-text-primary)] font-semibold"
                    : "text-[var(--color-text-secondary)] font-medium",
                ].join(" ")}
              >
                {label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {canUndo && (
        <div className="w-full flex justify-end px-6 pt-2">
          <button
            type="button"
            onClick={onUndo}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[12px] font-semibold text-[var(--color-primary)] hover:bg-[var(--color-primary-light)] transition-colors"
            title="撤回上一步（删除 / 重排 / 改判 / 新增都能退回）"
          >
            <Undo2 className="w-3.5 h-3.5" />
            撤回
          </button>
        </div>
      )}

      {/* 子 tab：今天的习惯 / 目标和行为集群，两件事分开放 */}
      <div className="w-full px-6 pt-3">
        <div className="w-full flex gap-4 border-b border-[var(--color-border)]">
          {([["today", `我的习惯${liveHabits.length > 0 ? ` ${liveHabits.length}` : ""}`], ["goals", `我的目标${aspirations.length > 0 ? ` ${aspirations.length}` : ""}`]] as Array<["today" | "goals", string]>).map(
            ([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setSub(key)}
                className={[
                  "pb-2 -mb-[1px] border-b-2 transition-colors group",
                  sub === key
                    ? "border-[var(--color-primary)]"
                    : "border-transparent hover:border-[var(--color-border)]",
                ].join(" ")}
              >
                <span
                  className={[
                    "text-[14px]",
                    "transition-colors",
                    sub === key
                      ? "text-[var(--color-primary)] font-semibold"
                      : "text-[var(--color-text-secondary)] font-medium group-hover:text-[var(--color-text-primary)]",
                  ].join(" ")}
                >
                  {label}
                </span>
              </button>
            ),
          )}
        </div>
      </div>

      <div className="w-full flex flex-col gap-5 px-6 pt-5 pb-6">
        {sub === "today" ? (
          <>
            {/* 最浅的入口：临时想到就直接加，不用先建目标 */}
            <div className="w-full flex items-center gap-2">
              <input
                type="text"
                value={quickHabit}
                onChange={(e) => setQuickHabit(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) handleQuickAddHabit();
                }}
                placeholder="临时想到一个习惯？直接写，回车加进来"
                enterKeyHint="done"
                className="flex-1 min-w-0 px-3 py-2 rounded-[10px] border border-[var(--color-border)] text-[13px] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:border-[var(--color-primary)]"
              />
              <button
                type="button"
                onClick={handleQuickAddHabit}
                disabled={!quickHabit.trim()}
                className={[
                  "px-3 py-2 rounded-[10px] text-[13px] font-medium transition-colors flex-shrink-0",
                  quickHabit.trim()
                    ? "bg-[var(--color-primary)] text-white hover:bg-[#1d4ed8]"
                    : "bg-[var(--color-bg-gray-light)] text-[var(--color-text-tertiary)] cursor-not-allowed",
                ].join(" ")}
              >
                加
              </button>
            </div>

            {liveHabits.length > 0 ? (
            <HabitTracker
              aspirations={aspirations}
              habits={habits}
              logs={habitLogs}
              entries={entries}
              today={today}
              onLog={onLogHabit}
              onUndoLog={onUndoHabitLog}
              onSetAnchor={onSetHabitAnchor}
              onToggleMeasure={onToggleHabitMeasure}
              onDeleteHabit={onDeleteHabit}
              hasLogs={habitHasLogs}
            />
          ) : (
            <div className="w-full flex flex-col gap-3 p-4 rounded-[10px] bg-[var(--color-bg-gray-lighter)] border border-[var(--color-border)]">
              <span className="text-[13px] font-semibold text-[var(--color-text-primary)]">
                还没有要养的习惯
              </span>
              <p className="text-[12px] leading-relaxed text-[var(--color-text-secondary)]">
                习惯不是想出来的，是<strong>筛出来的</strong>。去「目标」那边写下一个愿望，
                把想到的行为都倒进去，排一遍焦点地图——落在右上角的黄金行为才配占你一个格子。
              </p>
              <button
                type="button"
                onClick={() => setSub("goals")}
                className="self-start px-3 py-1.5 rounded-lg bg-[var(--color-primary)] text-white text-[13px] font-medium hover:bg-[#1d4ed8] transition-colors"
              >
                去「我的目标」 →
              </button>
            </div>
            )}
          </>
        ) : !open ? (
          /* ===== 一级页：我的愿望 ===== */
          <>
            <div className="w-full flex items-center justify-between">
              <span className="text-[var(--color-text-primary)] text-[16px] font-semibold">我的愿望</span>
              <button
                type="button"
                onClick={() => setAdding((v) => !v)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--color-primary)] text-white text-[13px] font-medium hover:bg-[#1d4ed8] transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                新愿望
              </button>
            </div>

            {adding && (
              <div className="w-full flex flex-col gap-2.5 p-3.5 rounded-[10px] bg-[var(--color-bg-gray-lighter)] border-[1.5px] border-[var(--color-primary)]">
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) handleCreateAspiration();
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
                    onClick={handleCreateAspiration}
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
                  <strong>1. 先写下一个愿望</strong>
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
                  这事对愿望有多大用 / 你有多容易做到。
                  <br />
                  <br />
                  <strong>4. 落在右上角的就是黄金行为</strong>
                  <br />
                  又有用、又做得到的那几条。加进习惯表，每天做——就这几条，不用多。
                </p>
              </div>
            ) : (
              <div className="w-full flex flex-col gap-2">
                {aspirations.map((a) => {
                  const cards = behaviors.filter((b) => b.aspirationId === a.id);
                  const un = cards.filter((c) => c.type === "unsorted").length;
                  const rep = cards.filter((c) => c.type === "habit" || c.type === "stop").length;
                  const once = cards.filter((c) => c.type === "onetime").length;
                  const parts = [
                    un > 0 ? `${un} 未判定` : "",
                    rep > 0 ? `${rep} 可重复` : "",
                    once > 0 ? `${once} 一次性` : "",
                  ].filter(Boolean);
                  return (
                    <div
                      key={a.id}
                      className="w-full flex items-center gap-2 px-3.5 py-3 rounded-[10px] bg-white border border-[var(--color-border)]"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setOpenId(a.id);
                          // 默认落在焦点地图——那才是"我到底该做什么"。
                          // 但这个愿望还没有可排的行为时，落在焦点地图只会看到空页
                          resetTransient();
                        }}
                        className="flex-1 flex items-center gap-2.5 min-w-0 text-left"
                      >
                        <Target className="w-4 h-4 text-[var(--color-primary)] flex-shrink-0" />
                        <div className="flex-1 flex flex-col gap-0.5 min-w-0">
                          <span className="text-[14px] font-medium text-[var(--color-text-primary)] truncate">
                            {a.title}
                          </span>
                          <span className="text-[11px] text-[var(--color-text-tertiary)]">
                            {KIND_LABEL[a.kind]}
                            {parts.length > 0 ? ` · ${parts.join(" · ")}` : " · 还是空的"}
                          </span>
                        </div>
                        <ChevronRight className="w-4 h-4 text-[var(--color-text-tertiary)] flex-shrink-0" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteAspId(a.id)}
                        className="w-[18px] h-[18px] flex items-center justify-center flex-shrink-0"
                        aria-label="删除愿望"
                      >
                        <Trash2 className="w-[16px] h-[16px] text-[#A1A1AA]" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          /* ===== 二级页：某个愿望的行为集群 ===== */
          <>
            <div className="w-full flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setOpenId(null);
                  resetTransient();
                }}
                className="w-8 h-8 rounded-lg border-[1.5px] border-[var(--color-border)] flex items-center justify-center bg-white hover:bg-[var(--color-bg-gray-light)] transition-colors flex-shrink-0"
                aria-label="返回"
              >
                <ArrowLeft className="w-4 h-4 text-[var(--color-text-secondary)]" />
              </button>
              <span className="text-[17px] font-semibold text-[var(--color-text-primary)] truncate">
                {open.title}
              </span>
              <span className="px-1.5 py-[1px] rounded border border-[var(--color-border)] text-[10px] text-[var(--color-text-secondary)] flex-shrink-0">
                {KIND_LABEL[open.kind]}
              </span>
            </div>

            <FocusMapView
              aspiration={open}
              cards={actionable}
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
        )}
      </div>

      <ConfirmDialog
        isOpen={deleteAspId !== null}
        title="删除这个愿望？"
        description={(() => {
          const target = deleteAspId ? aspirations.find((a) => a.id === deleteAspId) : undefined;
          const n = deleteAspId ? behaviors.filter((b) => b.aspirationId === deleteAspId).length : 0;
          return target ? `「${target.title}」和它下面的 ${n} 个条目都会删掉，且不可恢复` : undefined;
        })()}
        onConfirm={handleDeleteAspiration}
        onCancel={() => setDeleteAspId(null)}
      />
    </div>
  );
}
