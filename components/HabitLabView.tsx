"use client";

import { useState } from "react";
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
import {
  JUDGED_TYPES,
  TYPE_HINT,
  TYPE_LABEL,
  TYPE_ORDER,
  TYPE_STYLE,
  guessMeasure,
  isActionable,
  isGolden,
  isRepeatable,
  looksLikeAspiration,
  needsBreakdown,
  pendingJudgement,
} from "@/components/todo/behavior";
import FocusMapView from "@/components/FocusMapView";
import HabitTracker from "@/components/HabitTracker";
import { AlertTriangle, ArrowLeft, ChevronRight, Plus, Target, Trash2, Undo2, Wand2, X, Zap } from "lucide-react";
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

// 魔法棒吐出来的候选，先勾选再入库
type PendingItem = { text: string; type: BehaviorType; checked: boolean };
type Pending = { note: string; items: PendingItem[] };

async function callBehaviorAPI(
  body: Record<string, unknown>,
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; noKey: boolean }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000); // 批量判定慢，给足时间
    const res = await fetch("/api/behavior", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.status === 501) return { ok: false, noKey: true };
    if (!res.ok) return { ok: false, noKey: false };
    return { ok: true, data: await res.json() };
  } catch {
    return { ok: false, noKey: false };
  }
}

function toPendingItems(raw: unknown): PendingItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((b) => {
    const o = b as { text?: string; type?: BehaviorType };
    return { text: String(o.text ?? ""), type: (o.type ?? "habit") as BehaviorType, checked: true };
  });
}

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
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<"sort" | "wand" | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  // 魔法棒是从哪条卡片点的（null = 从顶上的总魔法棒点的）。
  // 结果和报错都渲染在触发它的地方，否则在长页面里点了像没反应。
  const [wandSeed, setWandSeed] = useState<string | null>(null);
  const [editingType, setEditingType] = useState<string | null>(null); // 正在改判的条目 id
  const [editingText, setEditingText] = useState<string | null>(null); // 正在改文字的条目 id
  const [draft, setDraft] = useState("");

  const [deleteAspId, setDeleteAspId] = useState<string | null>(null);

  const [mapOpen, setMapOpen] = useState(false); // 三级页：焦点地图
  const [sub, setSub] = useState<"today" | "goals">("today");
  const [quickHabit, setQuickHabit] = useState(""); // 「我的习惯」里直接加，不走目标那条长路 // 首页分两栏，习惯多了不用一路下拉
  const habitBehaviorIds = new Set(habits.filter((h) => !h.archived && h.behaviorId).map((h) => h.behaviorId!));

  const open = openId ? aspirations.find((a) => a.id === openId) ?? null : null;
  const openCards = open ? behaviors.filter((b) => b.aspirationId === open.id) : [];
  const unsorted = openCards.filter((b) => b.type === "unsorted");
  const judged = openCards.filter((b) => b.type !== "unsorted");
  // 可重复行为 + 一次性任务都上焦点地图（一次性任务也要筛：又难又没用的就别做了）
  const actionable = openCards.filter((b) => isActionable(b.type));
  const repeatable = openCards.filter((b) => isRepeatable(b.type));
  const liveHabits = habits.filter((h) => !h.archived);
  const goldenCount = actionable.filter(isGolden).length;

  function resetTransient() {
    setPending(null);
    setNote(null);
    setBusy(null);
    setWandSeed(null);
    setEditingType(null);
    setEditingText(null);
  }

  function startEditText(b: BehaviorCard) {
    setEditingText(b.id);
    setDraft(b.text);
    setEditingType(null);
  }

  function saveEditText(id: string) {
    const t = draft.trim();
    if (t) onUpdateBehaviorText(id, t);
    setEditingText(null);
  }

  // 点文字就地改；回车保存、Esc 取消
  function renderTextEditor(id: string) {
    return (
      <div className="w-full flex items-center gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Enter") saveEditText(id);
            else if (e.key === "Escape") setEditingText(null);
          }}
          onBlur={() => saveEditText(id)}
          autoFocus
          className="flex-1 px-2 py-1.5 rounded-md border border-[var(--color-primary)] text-[13px] bg-white focus:outline-none"
        />
        <span className="text-[10px] text-[var(--color-text-tertiary)] flex-shrink-0">回车保存</span>
      </div>
    );
  }

  // 临时想到一个习惯：直接加，不归属任何目标（进「没有归属的目标」那组）
  function handleQuickAddHabit() {
    const t = quickHabit.trim();
    if (!t) return;
    onAddHabit({ title: t, measure: guessMeasure(t) });
    setQuickHabit("");
  }

  function handleCreateAspiration() {
    const t = newTitle.trim();
    if (!t) return;
    onCreateAspiration(t, newKind);
    setNewTitle("");
    setNewKind("aspiration");
    setAdding(false);
  }

  // 收集口：回车即存，不判定、不等 AI
  function handleCollect() {
    const text = input.trim();
    if (!text || !open) return;
    onAddBehaviors(open.id, [{ text }]);
    setInput("");
    setNote(null);
    setWandSeed(null);
  }

  // 批量判定当前愿望下所有未判定条目
  async function handleSort() {
    if (!open || busy) return;
    const todo = pendingJudgement(openCards);
    if (todo.length === 0) return;
    setBusy("sort");
    setNote(null);
    setWandSeed(null); // 判定的提示归顶上，别串到某张卡片里

    const res = await callBehaviorAPI({
      mode: "sort",
      goal: open.title,
      items: todo.map((b) => ({ id: b.id, text: b.text })),
    });
    setBusy(null);

    if (!res.ok) {
      setNote(res.noKey ? "没配 AI，判定用不了——可以点条目上的标签自己归类" : "AI 没连上，稍后再点一次");
      return;
    }
    const results = Array.isArray(res.data.results) ? (res.data.results as Judgement[]) : [];
    if (results.length === 0) {
      setNote("AI 这次没给出结果，再点一次试试");
      return;
    }
    onApplyJudgements(results);
    const missed = todo.length - results.length;
    setNote(missed > 0 ? `判定了 ${results.length} 条，还剩 ${missed} 条没判到，再点一次` : null);
  }

  // 魔法棒：从愿望本身、或从某条"愿望/成果"条目发散
  async function handleWand(seed?: BehaviorCard) {
    if (!open || busy) return;
    setBusy("wand");
    setNote(null);
    setPending(null);
    setWandSeed(seed?.id ?? null);

    const res = await callBehaviorAPI({
      mode: "wand",
      aspiration: seed ? seed.text : open.title,
      context: open.title,
      existing: openCards.map((b) => b.text),
    });
    setBusy(null);

    if (!res.ok) {
      setNote(res.noKey ? "没配 AI，魔法棒用不了——直接往收集口里写吧" : "AI 没连上，稍后再试");
      return;
    }
    const items = toPendingItems(res.data.behaviors);
    if (items.length === 0) {
      setNote("AI 这次没发散出东西，再点一次试试");
      return;
    }
    setPending({
      note: seed
        ? `把「${seed.text}」拆成能做的行为。勾掉你不要的：`
        : "假设毫不费力，这些是能实现它的行为。勾掉你不要的：",
      items,
    });
  }

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

  function confirmPending() {
    if (!pending || !open) return;
    const picked = pending.items.filter((i) => i.checked).map(({ text, type }) => ({ text, type }));
    if (picked.length > 0) onAddBehaviors(open.id, picked);
    resetTransient();
  }

  function togglePending(index: number) {
    setPending((p) =>
      p ? { ...p, items: p.items.map((it, i) => (i === index ? { ...it, checked: !it.checked } : it)) } : p,
    );
  }

  function handleDeleteAspiration() {
    if (!deleteAspId) return;
    onDeleteAspiration(deleteAspId);
    if (openId === deleteAspId) {
      setOpenId(null);
      setMapOpen(false);
    }
    setDeleteAspId(null);
  }

  // 魔法棒候选预览（顶上的总魔法棒 / 某条卡片的「拆成行为」共用，渲染在触发处）
  function renderPendingBlock() {
    if (!pending) return null;
    return (
      <div className="w-full flex flex-col gap-2 p-3 rounded-[10px] bg-[var(--color-bg-gray-lighter)] border border-[var(--color-primary)]">
        <p className="text-[12px] font-medium text-[var(--color-text-secondary)] leading-relaxed">
          {pending.note}
        </p>
        {pending.items.map((it, i) => {
          const st = TYPE_STYLE[it.type];
          return (
            <button
              key={i}
              type="button"
              onClick={() => togglePending(i)}
              className={[
                "w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-colors",
                it.checked
                  ? "bg-white border-[var(--color-primary)]"
                  : "bg-transparent border-[var(--color-border)] opacity-50",
              ].join(" ")}
            >
              <span
                className={[
                  "w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border",
                  it.checked
                    ? "bg-[var(--color-primary)] border-[var(--color-primary)]"
                    : "border-[var(--color-border)]",
                ].join(" ")}
              >
                {it.checked && <span className="text-white text-[10px] leading-none">✓</span>}
              </span>
              <span className="flex-1 text-[13px] text-[var(--color-text-primary)]">{it.text}</span>
              <span
                className="px-1.5 py-[1px] rounded border text-[10px] font-medium flex-shrink-0"
                style={{ backgroundColor: st.bg, borderColor: st.border, color: st.text }}
              >
                {TYPE_LABEL[it.type]}
              </span>
            </button>
          );
        })}
        <div className="flex justify-end gap-2 mt-1">
          <button
            type="button"
            onClick={resetTransient}
            className="px-3 py-1.5 text-[12px] text-[var(--color-text-secondary)] hover:bg-white rounded transition-colors"
          >
            取消
          </button>
          <button
            type="button"
            onClick={confirmPending}
            className="px-4 py-1.5 text-[12px] bg-[var(--color-primary)] text-white rounded hover:bg-[#1d4ed8] transition-colors font-medium"
          >
            收进集群（{pending.items.filter((i) => i.checked).length}）
          </button>
        </div>
      </div>
    );
  }

  // 一条已判定条目：文字 + 可点的类型标签 + 改判面板
  function renderCard(b: BehaviorCard) {
    const st = TYPE_STYLE[b.type];
    const isEditing = editingType === b.id;
    return (
      <div
        key={b.id}
        className="w-full flex flex-col gap-1.5 px-3 py-2.5 rounded-[10px] bg-white border border-[var(--color-border)]"
      >
        {editingText === b.id ? (
          renderTextEditor(b.id)
        ) : (
        <div className="w-full flex items-start gap-2">
          <button
            type="button"
            onClick={() => startEditText(b)}
            className="flex-1 text-[13px] text-[var(--color-text-primary)] leading-snug text-left"
            title="点一下改文字"
          >
            {b.text}
          </button>
          <button
            type="button"
            onClick={() => setEditingType(isEditing ? null : b.id)}
            className="px-1.5 py-[1px] rounded border text-[10px] font-medium flex-shrink-0 leading-[16px]"
            style={{ backgroundColor: st.bg, borderColor: st.border, color: st.text }}
            title="判错了？点一下改"
          >
            {TYPE_LABEL[b.type]}
            {b.typeSource === "user" ? " ✓" : ""}
          </button>
          <button
            type="button"
            onClick={() => onDeleteBehavior(b.id)}
            className="w-[18px] h-[18px] flex items-center justify-center flex-shrink-0"
            aria-label="删除"
          >
            <X className="w-[15px] h-[15px] text-[#A1A1AA]" />
          </button>
        </div>
        )}

        {b.reason && !isEditing && (
          <span className="text-[11px] text-[var(--color-text-tertiary)] leading-snug">{b.reason}</span>
        )}

        {b.hasDecision && !isEditing && (
          <span className="flex items-start gap-1 text-[11px] text-[#B45309] leading-snug">
            <AlertTriangle className="w-3 h-3 mt-[2px] flex-shrink-0" />
            这条里藏着"要当场判断"的成分，建议改写成不用动脑的版本
          </span>
        )}

        {needsBreakdown(b.type) && !isEditing && (
          <button
            type="button"
            onClick={() => handleWand(b)}
            disabled={busy !== null}
            className="self-start flex items-center gap-1 px-2 py-1 rounded-md border border-[var(--color-primary)] text-[11px] font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary-light)] transition-colors disabled:opacity-50"
          >
            <Wand2 className="w-3 h-3" />
            {busy === "wand" && wandSeed === b.id ? "拆解中，10 秒左右..." : "拆成行为"}
          </button>
        )}

        {/* 拆解结果 / 报错就地显示，别跑到页面顶上去 */}
        {wandSeed === b.id && note && (
          <p className="text-[11px] text-[var(--color-text-secondary)] leading-snug">{note}</p>
        )}
        {wandSeed === b.id && pending && renderPendingBlock()}

        {isEditing && (
          <div className="w-full flex flex-col gap-1.5 pt-1">
            <span className="text-[11px] text-[var(--color-text-tertiary)]">归为</span>
            <div className="flex flex-wrap gap-1.5">
              {JUDGED_TYPES.map((t) => {
                const ts = TYPE_STYLE[t];
                const active = b.type === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      onSetBehaviorType(b.id, t);
                      setEditingType(null);
                    }}
                    className="px-2 py-1 rounded-md border text-[11px] font-medium transition-colors"
                    style={{
                      backgroundColor: active ? ts.text : ts.bg,
                      borderColor: active ? ts.text : ts.border,
                      color: active ? "#fff" : ts.text,
                    }}
                    title={TYPE_HINT[t]}
                  >
                    {TYPE_LABEL[t]}
                  </button>
                );
              })}
            </div>
            <span className="text-[10px] text-[var(--color-text-tertiary)]">{TYPE_HINT[b.type]}</span>
          </div>
        )}
      </div>
    );
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
                "flex-1 flex items-center justify-center rounded-lg px-2 py-[10px]",
                viewMode === mode ? "bg-[var(--color-bg-white)] shadow-[0_1px_2px_rgba(0,0,0,0.05)]" : "",
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
                  "pb-2 -mb-[1px] border-b-2 transition-colors",
                  sub === key
                    ? "border-[var(--color-primary)]"
                    : "border-transparent",
                ].join(" ")}
              >
                <span
                  className={[
                    "text-[14px]",
                    sub === key
                      ? "text-[var(--color-primary)] font-semibold"
                      : "text-[var(--color-text-secondary)] font-medium",
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
                  1. 先写下一个愿望或结果——它们都<strong>不是行为</strong>，你没法"执行"一个愿望
                  <br />
                  2. 想到什么就往收集口里倒，回车即存，<strong>先不判断好坏</strong>
                  <br />
                  3. 攒够了点「一次判定」，AI 一次性分拣成 愿望/成果/一次性任务/可重复行为
                  <br />
                  4. 可重复行为下一步进焦点地图，筛出真正该做的那几个
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
                          setMapOpen(
                            behaviors.some((b) => b.aspirationId === a.id && isActionable(b.type)),
                          );
                          resetTransient();
                          setInput("");
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
                  setMapOpen(false);
                  resetTransient();
                  setInput("");
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

            {/* 行为集群 / 焦点地图：平级两栏，不是下钻 */}
            <div className="w-full flex gap-1 bg-[var(--color-bg-gray-light)] rounded-[10px] p-1">
              {([[false, "行为集群"], [true, "焦点地图"]] as Array<[boolean, string]>).map(([isMap, label]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setMapOpen(isMap)}
                  className={[
                    "flex-1 flex items-center justify-center gap-1 rounded-lg px-2 py-2",
                    mapOpen === isMap ? "bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]" : "",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "text-[13px]",
                      mapOpen === isMap
                        ? "text-[var(--color-text-primary)] font-semibold"
                        : "text-[var(--color-text-secondary)] font-medium",
                    ].join(" ")}
                  >
                    {label}
                  </span>
                  {!isMap && unsorted.length > 0 && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#EA580C]" title="有未判定的条目" />
                  )}
                  {isMap && goldenCount > 0 && (
                    <span className="text-[11px] font-semibold text-[var(--color-primary)]">
                      {goldenCount}★
                    </span>
                  )}
                </button>
              ))}
            </div>

            {mapOpen ? (
              actionable.length > 0 ? (
                <FocusMapView
                  aspiration={open}
                  cards={actionable}
                  tasks={tasks}
                  onSetAxis={onSetBehaviorAxis}
                  onResetAxes={() => onResetBehaviorAxes(open.id)}
                  onDelete={onDeleteBehavior}
                  onReplaceText={onShrinkBehavior}
                  onAddExtra={(items) => onAddBehaviors(open.id, items)}
                  onSchedule={onScheduleBehavior}
                  onUnschedule={onUnscheduleBehavior}
                  onAddHabit={handleAddHabit}
                  habitBehaviorIds={habitBehaviorIds}
                />
              ) : (
                <p className="text-[12px] leading-relaxed text-[var(--color-text-secondary)]">
                  还没有能排的行为。先去「行为集群」把想到的倒进来、点一次判定——
                  判成<strong>可重复行为 / 要戒掉 / 一次性任务</strong>的才会出现在这儿
                  （愿望和成果执行不了，得先拆成行为）。
                </p>
              )
            ) : (
            <>

            {/* 收集口：回车即存，AI 不参与 */}
            <div className="w-full flex flex-col gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    handleCollect();
                  }
                }}
                placeholder="想到什么就倒进来，回车存下，接着写下一条"
                enterKeyHint="send"
                rows={2}
                className="w-full px-3 py-2.5 rounded-[10px] border border-[var(--color-border)] text-[14px] leading-relaxed placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] resize-none"
              />
              <div className="w-full flex items-center gap-2">
                <span className="text-[11px] text-[var(--color-text-tertiary)]">
                  回车即存 · 先别筛 · 可语音
                </span>
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={() => handleWand()}
                  disabled={busy !== null}
                  className={[
                    "flex items-center gap-1 px-2.5 py-1.5 rounded-md border text-[12px] font-medium transition-colors",
                    busy === null
                      ? "border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-[var(--color-primary-light)]"
                      : "border-[var(--color-border)] text-[var(--color-text-tertiary)] cursor-not-allowed",
                  ].join(" ")}
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  {busy === "wand" ? "发散中..." : "魔法棒"}
                </button>
              </div>
              {!wandSeed && note && <p className="text-[12px] text-[var(--color-text-secondary)]">{note}</p>}
            </div>

            {/* 魔法棒候选：从顶上的总魔法棒点的才显示在这儿；从卡片点的显示在那张卡下面 */}
            {!wandSeed && pending && renderPendingBlock()}

            {/* 未判定 */}
            {unsorted.length > 0 && (
              <div className="w-full flex flex-col gap-2">
                <div className="w-full flex items-center justify-between">
                  <span className="text-[var(--color-text-primary)] text-[15px] font-semibold">
                    未判定 <span className="text-[var(--color-text-tertiary)]">{unsorted.length}</span>
                  </span>
                  <button
                    type="button"
                    onClick={handleSort}
                    disabled={busy !== null}
                    className={[
                      "flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors",
                      busy === null
                        ? "bg-[var(--color-primary)] text-white hover:bg-[#1d4ed8]"
                        : "bg-[var(--color-bg-gray-light)] text-[var(--color-text-tertiary)] cursor-not-allowed",
                    ].join(" ")}
                  >
                    <Zap className="w-3.5 h-3.5" />
                    {busy === "sort" ? "判定中..." : `一次判定这 ${unsorted.length} 条`}
                  </button>
                </div>
                {unsorted.map((b) => (
                  <div
                    key={b.id}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-[10px] bg-[var(--color-bg-gray-lighter)] border border-[var(--color-border)]"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-[#A1A1AA] flex-shrink-0" />
                    {editingText === b.id ? (
                      renderTextEditor(b.id)
                    ) : (
                      <button
                        type="button"
                        onClick={() => startEditText(b)}
                        className="flex-1 text-[13px] text-[var(--color-text-primary)] leading-snug text-left"
                        title="点一下改文字"
                      >
                        {b.text}
                      </button>
                    )}
                    {editingText !== b.id && looksLikeAspiration(b.text) && (
                      <span className="text-[10px] text-[var(--color-text-tertiary)] flex-shrink-0">
                        像愿望
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => onDeleteBehavior(b.id)}
                      className="w-[18px] h-[18px] flex items-center justify-center flex-shrink-0"
                      aria-label="删除"
                    >
                      <X className="w-[15px] h-[15px] text-[#A1A1AA]" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* 已判定，按类型分组 */}
            {judged.length > 0 &&
              TYPE_ORDER.map((type) => {
                const list = judged.filter((b) => b.type === type);
                if (list.length === 0) return null;
                const st = TYPE_STYLE[type];
                return (
                  <div key={type} className="w-full flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="px-1.5 py-[1px] rounded border text-[10px] font-medium"
                        style={{ backgroundColor: st.bg, borderColor: st.border, color: st.text }}
                      >
                        {TYPE_LABEL[type]} · {list.length}
                      </span>
                      <span className="text-[10px] text-[var(--color-text-tertiary)]">
                        {TYPE_HINT[type]}
                      </span>
                    </div>
                    {list.map(renderCard)}
                  </div>
                );
              })}

            {openCards.length === 0 && (
              <p className="text-[12px] leading-relaxed text-[var(--color-text-tertiary)]">
                先攒着，别筛。福格的建议是一口气想 10-20 个，好不好、做不做得到都
                <strong>先别 judge</strong>——那是焦点地图的事。想不出来就点魔法棒。
              </p>
            )}
            </>
            )}
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
