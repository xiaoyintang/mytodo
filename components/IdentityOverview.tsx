"use client";

import { useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Archive, ChevronDown, ChevronRight, GripVertical, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import ConfirmDialog from "@/components/ConfirmDialog";
import type { BehaviorCard, BehaviorType, GoalResult, Habit } from "@/components/todo/types";
import { TYPE_LABEL } from "@/components/todo/behavior";
import { goalItems, goalProgress, isGoalItemBehavior } from "@/components/todo/goalProgress";
import type { Task } from "@/components/todo/types";

type Kind = "goal" | "state";

/** 身份页里一条待整理的东西：习惯必须在状态下，一次性的事必须在目标下。 */
export type Misplaced =
  | { type: "habit"; habitId: string; cardId?: string; title: string }
  | { type: "candidate" | "item"; cardId: string; title: string };

type Props = {
  goals: GoalResult[];
  states: GoalResult[];
  cards: BehaviorCard[];
  habits: Habit[];
  tasks: Task[];
  color: string;
  /** 还没判定 / 还是愿望的条目数量（不能直接归位，要去焦点地图整理）。 */
  unsortedCount: number;
  misplaced: Misplaced[];
  renderChecklist: (goal: GoalResult) => ReactNode;
  /** 当前打开焦点地图的那个状态（或 "unsorted"），由外层渲染地图。 */
  mapFor: string | null;
  /** 从任务标签跳进来时，直接展开那个目标/状态。 */
  initialOpenId?: string | null;
  onOpenMap: (target: string | null) => void;
  onCreate: (title: string, evidence: string | undefined, kind: Kind) => string;
  onUpdate: (id: string, patch: { title?: string; evidence?: string; kind?: Kind }) => void;
  onReorder: (orderedIds: string[]) => void;
  onArchive: (id: string) => void;
  onPlace: (thing: Misplaced, resultId: string) => void;
  onDeleteMisplaced: (thing: Misplaced) => void;
  onSetBehaviorType: (id: string, type: BehaviorType) => void;
  /** 已归档的目标 / 状态，各自收在自己列表的底部。 */
  archivedGoals: GoalResult[];
  archivedStates: GoalResult[];
  onRestore: (id: string) => void;
  /** 永久删除：下面的推进项不删，回到待整理。 */
  onDelete: (id: string) => void;
};

function Editor({ kind, initial, onSave, onCancel }: {
  kind: Kind;
  initial?: GoalResult;
  onSave: (title: string, evidence: string, kind: Kind) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [evidence, setEvidence] = useState(initial?.evidence ?? "");
  const [editKind, setEditKind] = useState<Kind>(kind);
  const save = () => title.trim() && onSave(title.trim(), evidence.trim(), editKind);
  const keys = (event: React.KeyboardEvent) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === "Enter") save();
    if (event.key === "Escape") onCancel();
  };
  return (
    <div className="flex flex-col gap-2 rounded-[10px] border border-[var(--color-primary)] bg-white p-2.5">
      {initial && (
        <div className="flex gap-1.5" role="radiogroup" aria-label="这是目标还是状态">
          {([["goal", "目标 · 要达成"], ["state", "状态 · 要保持"]] as const).map(([value, label]) => (
            <button key={value} type="button" role="radio" aria-checked={editKind === value} onClick={() => setEditKind(value)}
              className={`min-h-8 flex-1 rounded-lg border px-2 text-[11px] font-medium ${editKind === value ? "border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]" : "border-[var(--color-border)] text-[var(--color-text-secondary)]"}`}>
              {label}
            </button>
          ))}
        </div>
      )}
      <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={keys}
        placeholder={editKind === "goal" ? "想完成的一件事，例如：准备面试" : "要保持的状态，例如：早睡早起"}
        className="min-h-10 rounded-lg border border-[var(--color-border)] px-2.5 text-[13px] outline-none focus:border-[var(--color-primary)]" />
      <input value={evidence} onChange={(event) => setEvidence(event.target.value)} onKeyDown={keys}
        placeholder={editKind === "goal" ? "完成标准（可选）：做到什么样算完成？" : "怎样算保持住（可选）：例如每周 5 天 12 点前睡"}
        className="min-h-9 rounded-lg border border-[var(--color-border)] px-2.5 text-[12px] outline-none focus:border-[var(--color-primary)]" />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="min-h-8 px-3 text-[12px] text-[var(--color-text-secondary)]">取消</button>
        <button type="button" onClick={save} disabled={!title.trim()}
          className="min-h-8 rounded-lg bg-[var(--color-primary)] px-3 text-[12px] font-semibold text-white disabled:opacity-40">
          {initial ? "保存" : "添加"}
        </button>
      </div>
    </div>
  );
}

/**
 * 身份页主体：只有两个列表——目标（要达成，点开是清单）和状态（要保持，点开是它的习惯）。
 * 焦点地图不常驻，只在「挑新习惯」时打开；KR 导航、全局、AI 整理都收进「整理」。
 * 规则写死：目标里只有任务，习惯只在状态下。放错地方的集中在「待整理」，由用户自己选归哪里，不替他猜。
 */
export default function IdentityOverview({
  goals, states, cards, habits, tasks, color, unsortedCount, misplaced, renderChecklist, mapFor, initialOpenId,
  onOpenMap, onCreate, onUpdate, onReorder, onArchive, onPlace, onDeleteMisplaced, onSetBehaviorType, archivedGoals, archivedStates, onRestore, onDelete,
}: Props) {
  const [showArchived, setShowArchived] = useState<Kind | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleteItem, setDeleteItem] = useState<Misplaced | null>(null);
  const [openId, setOpenId] = useState<string | null>(initialOpenId ?? null);
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState<Kind | null>(null);
  const [drag, setDrag] = useState<{ id: string; kind: Kind; target?: string; edge?: "before" | "after" } | null>(null);
  const [naming, setNaming] = useState<{ index: number; kind: Kind; title: string } | null>(null);
  const [typeEditingId, setTypeEditingId] = useState<string | null>(null);

  function moveDrag(event: ReactPointerEvent) {
    if (!drag) return;
    const row = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-identity-row]");
    const id = row?.dataset.identityRow;
    if (!row || !id || id === drag.id || row.dataset.kind !== drag.kind) return;
    const rect = row.getBoundingClientRect();
    setDrag({ ...drag, target: id, edge: event.clientY < rect.top + rect.height / 2 ? "before" : "after" });
  }

  function endDrag() {
    if (drag?.target && drag.edge) {
      const list = (drag.kind === "goal" ? goals : states).map((result) => result.id).filter((id) => id !== drag.id);
      list.splice(list.indexOf(drag.target) + (drag.edge === "after" ? 1 : 0), 0, drag.id);
      onReorder(drag.kind === "goal" ? [...list, ...states.map((s) => s.id)] : [...goals.map((g) => g.id), ...list]);
    }
    setDrag(null);
  }

  function row(result: GoalResult, kind: Kind) {
    const open = openId === result.id;
    const isGoal = kind === "goal";
    const progress = isGoal ? goalProgress(goalItems(result, cards, tasks)) : undefined;
    const stateCards = cards.filter((card) => card.resultId === result.id && !card.archived && !isGoalItemBehavior(card));
    const stateHabits = habits.filter((habit) => (habit.resultId ?? cards.find((card) => card.id === habit.behaviorId)?.resultId) === result.id);
    const candidates = stateCards.filter((card) => !habits.some((habit) => habit.behaviorId === card.id)).length;
    const accent = isGoal ? color : "#059669";
    if (editing === result.id) {
      return <li key={result.id}><Editor kind={kind} initial={result}
        onSave={(title, evidence, nextKind) => { onUpdate(result.id, { title, evidence, kind: nextKind }); setEditing(null); }}
        onCancel={() => setEditing(null)} /></li>;
    }
    return (
      <li key={result.id} data-identity-row={result.id} data-kind={kind}
        className={[
          "rounded-[10px] border bg-white",
          open ? "border-[var(--color-primary)]" : "border-[var(--color-border)]",
          drag?.target === result.id && drag.edge === "before" ? "shadow-[0_-2px_0_var(--color-primary)]" : "",
          drag?.target === result.id && drag.edge === "after" ? "shadow-[0_2px_0_var(--color-primary)]" : "",
          drag?.id === result.id ? "opacity-50" : "",
        ].join(" ")}>
        <div className="flex min-h-12 items-center gap-1 pl-1 pr-1.5">
          <button type="button" aria-label={`拖动调整顺序：${result.title}`} data-no-tab-swipe
            onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); setDrag({ id: result.id, kind }); }}
            className="flex h-9 w-6 flex-shrink-0 touch-none cursor-grab items-center justify-center text-[var(--color-text-tertiary)]">
            <GripVertical className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={() => setOpenId(open ? null : result.id)} aria-expanded={open}
            className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left">
            <ChevronRight className={`h-3.5 w-3.5 flex-shrink-0 text-[var(--color-text-tertiary)] transition-transform ${open ? "rotate-90" : ""}`} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-[var(--color-text-primary)]" data-full-text={result.title}>{result.title}</span>
              {result.evidence && <span className="block truncate text-[10px] text-[var(--color-text-tertiary)]" data-full-text={result.evidence}>{result.evidence}</span>}
            </span>
            {isGoal && progress ? (
              <span className="flex flex-shrink-0 items-center gap-1.5">
                <span className="block h-1 w-12 overflow-hidden rounded-full bg-[var(--color-bg-gray-light)]">
                  <span className="block h-full rounded-full" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`, backgroundColor: accent }} />
                </span>
                <span className="w-9 text-right text-[11px] font-semibold tabular-nums text-[var(--color-text-secondary)]">
                  {result.status === "done" ? "已结项" : `${progress.done}/${progress.total}`}
                </span>
              </span>
            ) : (
              <span className="flex-shrink-0 text-[11px] text-[var(--color-text-secondary)]">
                习惯 {stateHabits.length}{candidates > 0 ? ` · 候选 ${candidates}` : ""}
              </span>
            )}
          </button>
          <button type="button" onClick={() => setEditing(result.id)} aria-label={`编辑${result.title}`}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-gray-light)]">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={() => onArchive(result.id)} aria-label={`归档${result.title}`}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-gray-light)]">
            <Archive className="h-3.5 w-3.5" />
          </button>
        </div>
        {open && isGoal && <div className="border-t border-[var(--color-border)] p-2">{renderChecklist(result)}</div>}
        {open && !isGoal && (
          <div className="flex flex-col gap-2 border-t border-[var(--color-border)] p-2.5">
            {stateHabits.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {stateHabits.map((habit) => (
                  <span key={habit.id} className="rounded-md bg-[#ECFDF5] px-2 py-1 text-[12px] text-[#065F46]">{habit.title}</span>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-[var(--color-text-tertiary)]">还没有习惯。挑几条小到不费力的，靠它们维持这个状态。</p>
            )}
            <button type="button" onClick={() => onOpenMap(mapFor === result.id ? null : result.id)} aria-expanded={mapFor === result.id}
              className="flex min-h-9 items-center justify-center gap-1 self-start rounded-lg border border-[#A7F3D0] bg-white px-3 text-[12px] font-medium text-[#047857]">
              <Sparkles className="h-3.5 w-3.5" />{mapFor === result.id ? "收起焦点地图" : "挑新习惯（焦点地图）"}
            </button>
          </div>
        )}
      </li>
    );
  }

  function section(kind: Kind, list: GoalResult[]) {
    const isGoal = kind === "goal";
    const archived = isGoal ? archivedGoals : archivedStates;
    return (
      <section aria-label={isGoal ? "目标" : "状态"} className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2 px-0.5">
          <h2 className={`text-[13px] font-semibold ${isGoal ? "text-[var(--color-text-primary)]" : "text-[#047857]"}`}>
            {isGoal ? "目标 · 要达成" : "状态 · 要保持"}
          </h2>
          <span className="text-[10px] text-[var(--color-text-tertiary)]">{isGoal ? "有终点，点开是清单" : "没有终点，点开是它的习惯"}</span>
          <div className="flex-1" />
          <button type="button" onClick={() => setCreating(kind)} aria-label={isGoal ? "添加目标" : "添加状态"}
            className={`flex h-8 w-8 items-center justify-center rounded-lg ${isGoal ? "text-[var(--color-primary)] hover:bg-[var(--color-primary-light)]" : "text-[#047857] hover:bg-[#ECFDF5]"}`}>
            <Plus className="h-4 w-4" />
          </button>
        </div>
        {creating === kind && (
          <Editor kind={kind} onCancel={() => setCreating(null)}
            onSave={(title, evidence) => { const id = onCreate(title, evidence || undefined, kind); setCreating(null); setOpenId(id); }} />
        )}
        {list.length > 0 ? (
          <ul className="flex flex-col gap-1.5" onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={() => setDrag(null)}>
            {list.map((result) => row(result, kind))}
          </ul>
        ) : creating !== kind && (
          <p className="rounded-[10px] border border-dashed border-[var(--color-border)] px-3 py-2.5 text-[11px] text-[var(--color-text-tertiary)]">
            {isGoal ? "想推进一件有终点的事（比如准备面试），点右边 ＋ 加一个目标。" : "想长期保持的状态（比如早睡早起），点右边 ＋ 加一个，再给它挑习惯。"}
          </p>
        )}
        {archived.length > 0 && (
          <div className="flex flex-col gap-1 px-0.5">
            <button type="button" onClick={() => setShowArchived(showArchived === kind ? null : kind)} aria-expanded={showArchived === kind}
              className="flex min-h-8 items-center gap-1 self-start text-[11px] text-[var(--color-text-tertiary)]">
              <Archive className="h-3 w-3" />已归档 {archived.length}
              <ChevronRight className={`h-3 w-3 transition-transform ${showArchived === kind ? "rotate-90" : ""}`} />
            </button>
            {showArchived === kind && archived.map((result) => (
              <div key={result.id} className="flex min-h-10 items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-gray-lighter)] px-2.5">
                <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--color-text-secondary)]" data-full-text={result.title}>{result.title}</span>
                {confirmDelete === result.id ? (
                  <>
                    <span className="text-[11px] text-[var(--color-danger)]">永久删除？下面的事会回到待整理</span>
                    <button type="button" onClick={() => { onDelete(result.id); setConfirmDelete(null); }}
                      className="min-h-8 rounded-md bg-[var(--color-danger)] px-2 text-[11px] font-semibold text-white">删除</button>
                    <button type="button" onClick={() => setConfirmDelete(null)} className="min-h-8 px-1.5 text-[11px] text-[var(--color-text-secondary)]">取消</button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={() => onRestore(result.id)}
                      className="min-h-8 rounded-md border border-[var(--color-border)] bg-white px-2 text-[11px] text-[var(--color-primary)]">恢复</button>
                    <button type="button" onClick={() => setConfirmDelete(result.id)}
                      className="min-h-8 px-1.5 text-[11px] text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)]">删除</button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    );
  }

  return (
    <div className="flex w-full flex-col gap-4">
      {section("goal", goals)}
      {section("state", states)}

      {(misplaced.length > 0 || unsortedCount > 0) && (
        <section aria-label="待整理" className="flex flex-col rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 sm:px-4">
          <div className="flex items-center gap-2 py-1">
            <h2 className="text-[13px] font-semibold text-[var(--color-text-secondary)]">待整理</h2>
            <span className="rounded-md bg-[var(--color-bg-gray-light)] px-1.5 text-[11px] tabular-nums text-[var(--color-text-secondary)]">{misplaced.length + unsortedCount}</span>
            <span className="ml-auto text-[11px] text-[var(--color-text-secondary)]">改类型 · 选归属 · 删除</span>
          </div>
          <ul className="flex flex-col">
            {misplaced.map((thing, index) => {
              const toState = thing.type !== "item";
              const options = toState ? states : goals;
              const card = thing.type !== "habit" ? cards.find(card => card.id === thing.cardId) : undefined;
              return (
                <li key={`${thing.type}-${"habitId" in thing ? thing.habitId : thing.cardId}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-[var(--color-border)] py-2 last:border-b-0">
                  <span className="w-full min-w-0 truncate text-[13px] text-[var(--color-text-primary)] sm:w-auto sm:flex-1" data-full-text={thing.title}>{thing.title}</span>
                  {card ? (
                    <button type="button" aria-label={`修改「${thing.title}」的行为类型`} aria-expanded={typeEditingId === card.id}
                      onClick={() => { setTypeEditingId(typeEditingId === card.id ? null : card.id); setNaming(null); }}
                      className="flex min-h-10 shrink-0 items-center gap-1 rounded-lg px-2 text-[11px] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-gray-light)] hover:text-[var(--color-primary)] focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]">
                      {TYPE_LABEL[card.type]}<ChevronDown className="h-3 w-3" />
                    </button>
                  ) : <span className="shrink-0 px-2 text-[11px] text-[var(--color-text-secondary)]">习惯</span>}
                  {naming?.index === index ? (
                    <input autoFocus value={naming.title} onChange={(event) => setNaming({ ...naming, title: event.target.value })}
                      onKeyDown={(event) => {
                        if (event.nativeEvent.isComposing || event.keyCode === 229) return;
                        if (event.key === "Escape") setNaming(null);
                        if (event.key === "Enter" && naming.title.trim()) {
                          onPlace(thing, onCreate(naming.title.trim(), undefined, naming.kind));
                          setNaming(null);
                        }
                      }}
                      placeholder={toState ? "新状态名，回车" : "新目标名，回车"} aria-label={toState ? "新建状态" : "新建目标"}
                      className="min-h-10 w-40 rounded-lg border border-[var(--color-border)] bg-white px-2 text-[12px] outline-none focus:border-[var(--color-primary)]" />
                  ) : (
                    <select value="" aria-label={`把「${thing.title}」放到…`}
                      onChange={(event) => {
                        const value = event.target.value;
                        if (value === "__new__") setNaming({ index, kind: toState ? "state" : "goal", title: "" });
                        else if (value) onPlace(thing, value);
                      }}
                      className="min-h-10 min-w-0 max-w-40 rounded-lg border border-[var(--color-border)] bg-white px-2 text-[12px] text-[var(--color-text-secondary)] focus:border-[var(--color-primary)]">
                      <option value="">{toState ? "选择状态" : "选择目标"}</option>
                      {options.map((result) => <option key={result.id} value={result.id}>{result.title}</option>)}
                      <option value="__new__">＋ 新建{toState ? "状态" : "目标"}…</option>
                    </select>
                  )}
                  <button type="button" aria-label={`删除待整理「${thing.title}」`} onClick={() => setDeleteItem(thing)}
                    className="ml-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-danger-light)] hover:text-[var(--color-danger)] focus-visible:outline-2 focus-visible:outline-[var(--color-primary)] sm:ml-0">
                    <Trash2 className="h-4 w-4" />
                  </button>
                  {card && typeEditingId === card.id && (
                    <div className="flex w-full flex-wrap items-center gap-1.5 pb-1" role="group" aria-label={`为「${thing.title}」选择类型`}>
                      {(["habit", "onetime", "stop"] as const).map(type => (
                        <button key={type} type="button" aria-pressed={card.type === type}
                          onClick={() => { onSetBehaviorType(card.id, type); setTypeEditingId(null); setNaming(null); }}
                          className={`min-h-10 rounded-lg border px-3 text-[12px] ${card.type === type ? "border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]" : "border-[var(--color-border)] bg-white text-[var(--color-text-secondary)]"}`}>
                          {TYPE_LABEL[type]}
                        </button>
                      ))}
                      <button type="button" onClick={() => setTypeEditingId(null)} className="min-h-10 px-2 text-[12px] text-[var(--color-text-secondary)]">取消</button>
                      <span className="w-full text-[10px] text-[var(--color-text-secondary)]">手动修改后，AI 不再覆盖；文字、步骤和原归属保留。</span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {unsortedCount > 0 && (
            <button type="button" onClick={() => onOpenMap(mapFor === "unsorted" ? null : "unsorted")}
              className="min-h-10 self-start text-[11px] font-medium text-[var(--color-primary)]">
              还有 {unsortedCount} 条没判定过的想法 · {mapFor === "unsorted" ? "收起" : "去焦点地图整理"}
            </button>
          )}
        </section>
      )}
      <ConfirmDialog isOpen={deleteItem !== null} title="删除这条待整理项？"
        description={`「${deleteItem?.title ?? ""}」将从候选中删除；如已加入习惯，习惯会归档。已有日程和记录保留，可通过行为操作的撤回恢复。`}
        onCancel={() => setDeleteItem(null)}
        onConfirm={() => { if (deleteItem) onDeleteMisplaced(deleteItem); setDeleteItem(null); setNaming(null); setTypeEditingId(null); }} />
    </div>
  );
}
