"use client";

import { useState } from "react";
import type { Aspiration, BehaviorCard, BehaviorType, ISODate, Task } from "@/components/todo/types";
import { callBehaviorAPI, toPendingItems, type PendingItem } from "@/components/todo/behaviorApi";
import { TYPE_LABEL, TYPE_STYLE, goldenScore, isGolden, isRepeatable, needsBreakdown } from "@/components/todo/behavior";
import { addDays, toISODate } from "@/components/todo/date";
import { ArrowUpDown, Check, RotateCcw, Scissors, Star, Trash2, Wand2, X } from "lucide-react";
import ConfirmDialog from "@/components/ConfirmDialog";

type AxisPatch = { impact?: number; feasibility?: number };
type SortMode = "default" | "impact" | "score";

type Props = {
  aspiration: Aspiration;
  /** 可重复行为 + 一次性任务，都上图 */
  cards: BehaviorCard[];
  tasks: Task[];
  onSetAxis: (id: string, patch: AxisPatch) => void;
  onResetAxes: () => void;
  onDelete: (id: string) => void;
  onReplaceText: (id: string, text: string) => void;
  onAddExtra: (items: Array<{ text: string; type: BehaviorType }>) => void;
  onAddHabit: (card: BehaviorCard) => void;
  onRemoveHabit: (behaviorId: string) => void;
  onSchedule: (cardId: string, title: string, date: ISODate) => void;
  onUnschedule: (cardId: string) => void;
  /** 就地增删改，省得为了加一条/改个错字还要切回行为集群 */
  onAdd: (text: string) => void;
  onEditText: (id: string, text: string) => void;
  onSetType: (id: string, type: BehaviorType) => void;
  /** 魔法棒发散出来的候选，勾选后收进集群 */
  onCollect: (items: Array<{ text: string; type?: BehaviorType }>) => void;
  habitBehaviorIds: Set<string>;
  /** 正在被 AI 判定的条目——只有这些才显示"判定中"，判失败的不装 */
  judgingIds: Set<string>;
};

const SORTS: Array<[SortMode, string]> = [
  // 默认 = 没排的浮到最上面，其余保持收集顺序。全部排完之后它就等于收集顺序，
  // 所以不需要再单独给一个"还没排的"
  ["default", "默认"],
  ["impact", "影响力高→低"],
  ["score", "最该先做"], // = 影响力 × 可行性，两边都强的排前面
];

/** 没排完的排前面（两轴都没排 > 排了一半 > 排完），同档保持收集顺序 */
function unratedFirst(cards: BehaviorCard[]): string[] {
  const rank = (c: BehaviorCard) => (c.impact == null ? 2 : 0) + (c.feasibility == null ? 1 : 0);
  return [...cards].sort((a, b) => rank(b) - rank(a)).map((c) => c.id);
}

// 散点图尺寸
const W = 336;
const H = 168;
const PAD = 12;

function cnDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(m)}月${Number(d)}日`;
}

export default function FocusMapView({
  aspiration,
  cards,
  tasks,
  onSetAxis,
  onResetAxes,
  onDelete,
  onReplaceText,
  onAddExtra,
  onAddHabit,
  onRemoveHabit,
  onSchedule,
  onUnschedule,
  onAdd,
  onEditText,
  onSetType,
  onCollect,
  habitBehaviorIds,
  judgingIds,
}: Props) {
  const [confirmReset, setConfirmReset] = useState(false);
  const [sort, setSort] = useState<SortMode>("default");
  // 排序是一个动作不是实时绑定——否则拖滑块时行会在手底下乱跳。
  // 默认顺序也是进来时定一次：没排的浮上来，之后你怎么拖它都待在原地
  const [order, setOrder] = useState<string[]>(() => unratedFirst(cards));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scheduling, setScheduling] = useState(false);
  const [onlyStuck, setOnlyStuck] = useState(false);
  // 点上去看是哪条：hover 是鼠标预览，pinned 是点/触摸钉住（手机没有 hover）
  const [draft, setDraft] = useState("");           // 顶上直接加一条
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [typingId, setTypingId] = useState<string | null>(null); // 正在改类型的那条
  // 改过文字的：不自动重置类型和分数（小改占多数，重置等于把对的信息毁掉），
  // 只在那一行提醒一句，要不要重判/重打分你自己看
  const [edited, setEdited] = useState<Set<string>>(new Set());
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [pinnedId, setPinnedId] = useState<string | null>(null);

  const [shrinkingId, setShrinkingId] = useState<string | null>(null);
  const [shrink, setShrink] = useState<{ forId: string; items: PendingItem[] } | null>(null);
  const [shrinkNote, setShrinkNote] = useState<string | null>(null);
  // 魔法棒：从愿望本身发散，或对某条"愿望/成果"拆解
  const [wandBusy, setWandBusy] = useState<string | "root" | null>(null);
  const [wand, setWand] = useState<{ forId: string | null; note: string; items: PendingItem[] } | null>(null);
  const [wandNote, setWandNote] = useState<string | null>(null);

  const golden = cards
    .filter(isGolden)
    .slice()
    .sort((a, b) => goldenScore(b) - goldenScore(a));
  const goldenRank = new Map(golden.map((g, i) => [g.id, i + 1]));
  const plotted = cards.filter((c) => c.impact != null && c.feasibility != null);
  const rated = cards.filter((c) => c.impact != null || c.feasibility != null).length;
  const rateable = cards.filter((c) => c.type !== "unsorted" && !needsBreakdown(c.type)).length;

  // 影响力够高但做不到的——福格的解法是改小。单独拎出来，否则藏在几十行里根本找不着
  const stuck = cards.filter((c) => (c.impact ?? 0) >= 50 && c.feasibility != null && c.feasibility < 50);

  // 新加的卡不在快照里（indexOf = -1），自然排到最前面——它本来就是没排的
  const ordered = [...cards].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  const list = onlyStuck ? ordered.filter((c) => stuck.includes(c)) : ordered;

  function applySort(mode: SortMode) {
    setSort(mode);
    if (mode === "default") {
      setOrder(unratedFirst(cards));
      return;
    }
    const key: (c: BehaviorCard) => number =
      mode === "impact" ? (c) => c.impact ?? -1 : goldenScore;
    setOrder([...cards].sort((a, b) => key(b) - key(a)).map((c) => c.id));
  }

  function submitAdd() {
    const t = draft.trim();
    if (!t) return;
    onAdd(t);
    setDraft("");
  }

  function saveEdit(id: string) {
    const t = editText.trim();
    const card = cards.find((c) => c.id === id);
    if (t && card && t !== card.text) {
      onEditText(id, t);
      // 改动大不大只有你知道，所以不替你决定，只把提醒摆在眼前
      if (card.impact != null || card.feasibility != null) {
        setEdited((prev) => new Set(prev).add(id));
      }
    }
    setEditingId(null);
  }

  function dismissEdited(id: string) {
    setEdited((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function toggleSelect(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const activeId = hoverId ?? pinnedId;
  const active = activeId ? cards.find((c) => c.id === activeId) ?? null : null;

  const chosen = cards.filter((c) => selected.has(c.id));
  const chosenHabits = chosen.filter((c) => isRepeatable(c.type) && !habitBehaviorIds.has(c.id));
  const chosenOnetime = chosen.filter((c) => c.type === "onetime" && !c.taskId);

  function batchAddHabits() {
    chosenHabits.forEach(onAddHabit);
    setSelected(new Set());
  }

  function batchSchedule(date: ISODate) {
    chosenOnetime.forEach((c) => onSchedule(c.id, c.text, date));
    setSelected(new Set());
    setScheduling(false);
  }

  // seed 为空 = 从愿望本身发散；有 seed = 拆这一条愿望/成果
  async function handleWand(seed?: BehaviorCard) {
    if (wandBusy) return;
    setWandBusy(seed ? seed.id : "root");
    setWand(null);
    setWandNote(null);
    const res = await callBehaviorAPI({
      mode: "wand",
      aspiration: seed ? seed.text : aspiration.title,
      context: aspiration.title,
      existing: cards.map((c) => c.text),
    });
    setWandBusy(null);
    if (!res.ok) {
      setWandNote(res.noKey ? "没配 AI，魔法棒用不了——直接往上面输入框里写" : "AI 没连上，稍后再试");
      return;
    }
    const items = toPendingItems(res.data.behaviors);
    if (items.length === 0) {
      setWandNote("AI 这次没发散出东西，再点一次试试");
      return;
    }
    setWand({
      forId: seed?.id ?? null,
      note: seed
        ? `把「${seed.text}」拆成能做的行为。勾掉你不要的：`
        : "假设毫不费力，这些是能实现它的行为。勾掉你不要的：",
      items,
    });
  }

  function confirmWand() {
    if (!wand) return;
    const picked = wand.items.filter((i) => i.checked).map(({ text, type }) => ({ text, type }));
    if (picked.length > 0) onCollect(picked);
    setWand(null);
  }

  function renderWandBox() {
    if (!wand) return null;
    return (
      <div className="w-full flex flex-col gap-2 p-3 rounded-[10px] bg-[var(--color-bg-gray-lighter)] border border-[var(--color-primary)]">
        <p className="text-[12px] font-medium text-[var(--color-text-secondary)] leading-relaxed">
          {wand.note}
        </p>
        {wand.items.map((it, i) => {
          const ts = TYPE_STYLE[it.type];
          return (
            <button
              key={i}
              type="button"
              onClick={() =>
                setWand((p) =>
                  p ? { ...p, items: p.items.map((x, j) => (j === i ? { ...x, checked: !x.checked } : x)) } : p,
                )
              }
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
                style={{ backgroundColor: ts.bg, borderColor: ts.border, color: ts.text }}
              >
                {TYPE_LABEL[it.type]}
              </span>
            </button>
          );
        })}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setWand(null)}
            className="px-3 py-1.5 text-[12px] text-[var(--color-text-secondary)] rounded"
          >
            取消
          </button>
          <button
            type="button"
            onClick={confirmWand}
            className="px-4 py-1.5 text-[12px] bg-[var(--color-primary)] text-white rounded font-medium"
          >
            收进来（{wand.items.filter((i) => i.checked).length}）
          </button>
        </div>
      </div>
    );
  }

  async function handleShrink(card: BehaviorCard) {
    if (shrinkingId) return;
    setShrinkingId(card.id);
    setShrink(null);
    setShrinkNote(null);
    const res = await callBehaviorAPI({ mode: "shrink", text: card.text, goal: aspiration.title });
    setShrinkingId(null);
    if (!res.ok) {
      setShrinkNote(res.noKey ? "没配 AI，改小得回集群页点文字自己改" : "AI 没连上，稍后再试");
      return;
    }
    const items = toPendingItems(res.data.behaviors);
    if (items.length === 0) {
      setShrinkNote("AI 没给出更小的版本，自己动手改改看");
      return;
    }
    setShrink({ forId: card.id, items: items.map((it, i) => ({ ...it, checked: i === 0 })) });
  }

  function applyShrink() {
    if (!shrink) return;
    const picked = shrink.items.filter((i) => i.checked);
    if (picked.length > 0) {
      onReplaceText(shrink.forId, picked[0].text);
      if (picked.length > 1) onAddExtra(picked.slice(1).map(({ text, type }) => ({ text, type })));
    }
    setShrink(null);
    setShrinkNote(null);
  }

  function renderSlider(b: BehaviorCard, axis: "impact" | "feasibility") {
    const value = axis === "impact" ? b.impact : b.feasibility;
    const placed = value != null;
    return (
      <div className="w-full flex items-center gap-2">
        <span className="text-[10px] text-[var(--color-text-tertiary)] w-[26px] flex-shrink-0">
          {axis === "impact" ? "影响" : "能做"}
        </span>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={value ?? 50}
          onChange={(e) => onSetAxis(b.id, { [axis]: Number(e.target.value) } as AxisPatch)}
          className={["flex-1 h-[20px] cursor-pointer accent-[var(--color-primary)]", placed ? "" : "opacity-40"].join(" ")}
          aria-label={`${b.text} 的${axis === "impact" ? "影响力" : "可行性"}`}
        />
        <span
          className={[
            "text-[11px] tabular-nums w-[24px] text-right flex-shrink-0",
            placed ? "font-semibold text-[var(--color-primary)]" : "text-[var(--color-text-tertiary)]",
          ].join(" ")}
        >
          {placed ? value : "—"}
        </span>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-3">
      <div className="w-full flex items-center gap-2">
        <span className="flex-1 text-[12px] text-[var(--color-text-secondary)]">
          两根滑块都拖一下，右上角那几条就是黄金行为
        </span>
        <button
          type="button"
          onClick={() => setConfirmReset(true)}
          className="flex items-center gap-1 text-[12px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] flex-shrink-0"
        >
          <RotateCcw className="w-3 h-3" />
          重排
        </button>
      </div>

      {/* 散点图：拖一下就动，不是最后才"变"出来 */}
      <div className="w-full flex flex-col items-center gap-1">
        <svg width={W} height={H} className="overflow-visible">
          <rect x={0} y={0} width={W} height={H} rx={10} fill="var(--color-bg-gray-lighter)" />
          <rect x={W / 2} y={0} width={W / 2} height={H / 2} fill="var(--color-primary-light)" />
          <line x1={W / 2} y1={0} x2={W / 2} y2={H} stroke="var(--color-border)" strokeWidth={1} />
          <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke="var(--color-border)" strokeWidth={1} />
          <text x={W - 6} y={13} textAnchor="end" fontSize={10} fill="var(--color-primary)">
            黄金行为
          </text>
          {plotted.map((b) => {
            const cx = PAD + ((b.feasibility ?? 0) / 100) * (W - PAD * 2);
            const cy = H - PAD - ((b.impact ?? 0) / 100) * (H - PAD * 2);
            const rank = goldenRank.get(b.id);
            const isActive = activeId === b.id;
            const dim =
              (selected.size > 0 && !selected.has(b.id)) || (activeId !== null && !isActive);
            return (
              <g
                key={b.id}
                opacity={dim ? 0.22 : 1}
                className="cursor-pointer"
                onMouseEnter={() => setHoverId(b.id)}
                onMouseLeave={() => setHoverId(null)}
                onPointerDown={(e) => {
                  if (e.pointerType === "mouse") return; // 鼠标走 hover，别在这儿抢
                  setPinnedId((p) => (p === b.id ? null : b.id));
                }}
                onClick={(e) => {
                  if (e.detail === 0) return;
                  setPinnedId((p) => (p === b.id ? null : b.id));
                }}
              >
                {/* 透明的大热区，手指点得中 */}
                <circle cx={cx} cy={cy} r={15} fill="transparent" />
                <circle
                  cx={cx}
                  cy={cy}
                  r={isActive ? (rank ? 11 : 8) : rank ? 9 : 5}
                  fill={rank ? "var(--color-primary)" : "#A1A1AA"}
                  opacity={rank ? 1 : 0.6}
                  stroke={isActive ? "var(--color-text-primary)" : "none"}
                  strokeWidth={isActive ? 2 : 0}
                />
                {rank && (
                  <text
                    x={cx}
                    y={cy + 3.5}
                    textAnchor="middle"
                    fontSize={10}
                    fontWeight={700}
                    fill="#fff"
                    pointerEvents="none"
                  >
                    {rank}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {active ? (
          <div className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg bg-[var(--color-text-primary)] text-white">
            {goldenRank.get(active.id) && (
              <span className="w-4 h-4 rounded-full bg-white text-[var(--color-text-primary)] text-[9px] font-bold flex items-center justify-center flex-shrink-0">
                {goldenRank.get(active.id)}
              </span>
            )}
            <span className="flex-1 text-[12px] leading-snug">{active.text}</span>
            <span className="text-[11px] tabular-nums opacity-70 flex-shrink-0">
              影响 {active.impact} · 能做 {active.feasibility}
            </span>
          </div>
        ) : (
          <div className="w-full flex items-center justify-between text-[11px] text-[var(--color-text-tertiary)] px-1">
            <span>← 做不到</span>
            <span className="text-[var(--color-primary)] font-medium">
              右上角 {golden.length} 条 · 已排 {rated}/{rateable}
            </span>
            <span>能做到 →</span>
          </div>
        )}
        <span className="text-[10px] text-[var(--color-text-tertiary)]">
          点圆点看是哪一条{active ? "（再点一下取消）" : ""}
        </span>
      </div>

      {/* 直接加一条，不用切回行为集群 */}
      <div className="w-full flex items-center gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) submitAdd();
          }}
          placeholder="想到一条就直接加，回车"
          enterKeyHint="done"
          className="flex-1 min-w-0 px-3 py-2 rounded-[10px] border border-[var(--color-border)] text-[13px] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:border-[var(--color-primary)]"
        />
        <button
          type="button"
          onClick={submitAdd}
          disabled={!draft.trim()}
          className={[
            "px-3 py-2 rounded-[10px] text-[13px] font-medium transition-colors flex-shrink-0",
            draft.trim()
              ? "bg-[var(--color-primary)] text-white hover:bg-[#1d4ed8]"
              : "bg-[var(--color-bg-gray-light)] text-[var(--color-text-tertiary)] cursor-not-allowed",
          ].join(" ")}
        >
          加
        </button>
        <button
          type="button"
          onClick={() => handleWand()}
          disabled={wandBusy !== null}
          className={[
            "flex items-center gap-1 px-2.5 py-2 rounded-[10px] border text-[12px] font-medium transition-colors flex-shrink-0",
            wandBusy === null
              ? "border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-[var(--color-primary-light)]"
              : "border-[var(--color-border)] text-[var(--color-text-tertiary)] cursor-not-allowed",
          ].join(" ")}
          title="想不出来？让 AI 从这个愿望发散一批"
        >
          <Wand2 className="w-3.5 h-3.5" />
          {wandBusy === "root" ? "发散中..." : "魔法棒"}
        </button>
      </div>
      {wandNote && <p className="text-[11px] text-[var(--color-text-secondary)]">{wandNote}</p>}
      {wand?.forId == null && renderWandBox()}

      {/* 排序：想比较第 9 和第 4？排一下它俩就挨着了 */}
      <div className="w-full flex items-center gap-1.5 flex-wrap">
        <span className="flex items-center gap-1 text-[11px] text-[var(--color-text-tertiary)] flex-shrink-0">
          <ArrowUpDown className="w-3 h-3" />
          排序
        </span>
        {SORTS.map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            onClick={() => applySort(mode)}
            className={[
              "px-2 py-1 rounded-md border text-[11px] font-medium transition-colors",
              sort === mode
                ? "bg-[var(--color-primary-light)] border-[var(--color-primary)] text-[var(--color-primary)]"
                : "bg-white border-[var(--color-border)] text-[var(--color-text-secondary)]",
            ].join(" ")}
          >
            {label}
          </button>
        ))}
        <span className="w-full text-[10px] text-[var(--color-text-tertiary)] leading-relaxed">
          {sort === "default"
            ? "还没排的（虚线那些）浮在最上面，排完的按收集顺序排在后面。顺序进来时定一次，拖的时候行不会动"
            : sort === "impact"
              ? "想比较两条谁更重要？这样排一下它俩就挨着了。拖完想重排，再点一次这个按钮"
              : "综合影响力和可行性（两边都强的靠前），最该先下手的在最上面"}
        </span>
      </div>

      {/* 影响力高但做不到 → 改小。不给入口的话，它藏在几十行里根本找不到 */}
      {stuck.length > 0 && (
        <button
          type="button"
          onClick={() => setOnlyStuck((v) => !v)}
          className={[
            "w-full flex items-center gap-1.5 px-3 py-2 rounded-[10px] border text-left transition-colors",
            onlyStuck
              ? "bg-[#B45309] border-[#B45309] text-white"
              : "bg-[#FFFBEB] border-[#FDE68A] text-[#B45309]",
          ].join(" ")}
        >
          <Scissors className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="flex-1 text-[12px] font-medium">
            {stuck.length} 条影响力高但做不到 —— 别删，<strong>改小它</strong>
          </span>
          <span className="text-[11px] flex-shrink-0">{onlyStuck ? "看全部" : "只看这几条"}</span>
        </button>
      )}

      {/* 一行两根滑块，不用记上一轮打了多少 */}
      <div className="w-full flex flex-col gap-2">
        {list.map((b) => {
          const rank = goldenRank.get(b.id);
          const st = TYPE_STYLE[b.type];
          const picked = selected.has(b.id);
          const task = b.taskId ? tasks.find((t) => t.id === b.taskId) : undefined;
          const inHabits = habitBehaviorIds.has(b.id);
          return (
            <div
              key={b.id}
              className={[
                "w-full flex flex-col gap-1 px-3 py-2.5 rounded-[10px] border transition-colors",
                activeId === b.id
                  ? "bg-white border-[var(--color-text-primary)] ring-1 ring-[var(--color-text-primary)]"
                  : picked
                    ? "bg-[var(--color-primary-light)] border-[var(--color-primary)]"
                    : rank
                      ? "bg-white border-[var(--color-primary)]"
                      : b.impact == null || b.feasibility == null
                        ? "bg-[var(--color-bg-gray-lighter)] border-dashed border-[#A1A1AA]"
                        : "bg-white border-[var(--color-border)]",
              ].join(" ")}
            >
              <div className="w-full flex items-start gap-2">
                <button
                  type="button"
                  onClick={() => toggleSelect(b.id)}
                  className={[
                    "w-[18px] h-[18px] mt-[1px] rounded flex items-center justify-center flex-shrink-0 border",
                    picked
                      ? "bg-[var(--color-primary)] border-[var(--color-primary)]"
                      : "bg-white border-[var(--color-border)]",
                  ].join(" ")}
                  aria-label="选中"
                >
                  {picked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                </button>
                {rank && (
                  <span className="w-[18px] h-[18px] mt-[1px] rounded-full bg-[var(--color-primary)] text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                    {rank}
                  </span>
                )}
                {editingId === b.id ? (
                  <input
                    type="text"
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.nativeEvent.isComposing) return;
                      if (e.key === "Enter") saveEdit(b.id);
                      else if (e.key === "Escape") setEditingId(null);
                    }}
                    onBlur={() => saveEdit(b.id)}
                    autoFocus
                    className="flex-1 min-w-0 px-2 py-1 rounded border border-[var(--color-primary)] text-[13px] bg-white focus:outline-none"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(b.id);
                      setEditText(b.text);
                      setTypingId(null);
                    }}
                    className="flex-1 text-[13px] text-[var(--color-text-primary)] leading-snug text-left"
                    title="点一下改文字"
                  >
                    {b.text}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setTypingId(typingId === b.id ? null : b.id)}
                  className="px-1.5 py-[1px] rounded border text-[9px] font-medium flex-shrink-0"
                  style={{ backgroundColor: st.bg, borderColor: st.border, color: st.text }}
                  title={b.type === "unsorted" ? "AI 正在判它是什么，也可以自己点一个" : "判错了？点一下改"}
                >
                  {b.type === "unsorted"
                    ? judgingIds.has(b.id)
                      ? "判定中…"
                      : "未判定"
                    : TYPE_LABEL[b.type]}
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(b.id)}
                  className="w-[16px] h-[16px] flex items-center justify-center flex-shrink-0"
                  aria-label="删掉这条"
                >
                  <Trash2 className="w-[13px] h-[13px] text-[#A1A1AA]" />
                </button>
              </div>

              {typingId === b.id && (
                <div className="w-full flex items-center gap-1.5 py-1">
                  <span className="text-[10px] text-[var(--color-text-tertiary)]">归为</span>
                  {(["habit", "stop", "onetime"] as BehaviorType[]).map((t) => {
                    const ts = TYPE_STYLE[t];
                    const on = b.type === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => {
                          onSetType(b.id, t);
                          setTypingId(null);
                        }}
                        className="px-2 py-[3px] rounded-md border text-[10px] font-medium"
                        style={{
                          backgroundColor: on ? ts.text : ts.bg,
                          borderColor: on ? ts.text : ts.border,
                          color: on ? "#fff" : ts.text,
                        }}
                      >
                        {TYPE_LABEL[t]}
                      </button>
                    );
                  })}
                  <span className="text-[9px] text-[var(--color-text-tertiary)]">
                    愿望/成果得回集群页拆
                  </span>
                </div>
              )}

              {b.type === "unsorted" ? (
                <span className="text-[10px] text-[var(--color-text-tertiary)] py-1">
                  {judgingIds.has(b.id)
                    ? "AI 正在判它是不是行为，判完就能打分（也可以直接点上面的标签自己定）"
                    : "AI 没判出来（可能没连上）——点上面的标签自己定一个，就能打分了"}
                </span>
              ) : (
                <>
                  {renderSlider(b, "impact")}
                  {renderSlider(b, "feasibility")}
                </>
              )}

              {edited.has(b.id) && (
                <div className="w-full flex items-center gap-1.5 text-[10px] text-[#B45309]">
                  <span className="flex-1 leading-snug">
                    文字改过了——如果改动大，上面两个分数和类型可能不作数了，顺手拖一下
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      onSetAxis(b.id, { impact: undefined, feasibility: undefined });
                      dismissEdited(b.id);
                    }}
                    className="px-1.5 py-[2px] rounded border border-[#B45309] flex-shrink-0"
                  >
                    清掉重打
                  </button>
                  <button
                    type="button"
                    onClick={() => dismissEdited(b.id)}
                    className="px-1 flex-shrink-0 text-[var(--color-text-tertiary)]"
                  >
                    知道了
                  </button>
                </div>
              )}

              {/* 已有去处的，就地显示 + 可撤回 */}
              {task && (
                <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-success)]">
                  <Check className="w-3 h-3" />
                  已排到 {cnDate(task.date)}
                  {task.status === "done" ? " · 已完成" : ""}
                  <button
                    type="button"
                    onClick={() => onUnschedule(b.id)}
                    className="ml-1 flex items-center gap-0.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)]"
                  >
                    <X className="w-3 h-3" />
                    撤回排期
                  </button>
                </div>
              )}
              {inHabits && (
                <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-success)]">
                  <Check className="w-3 h-3" />
                  已在习惯表里
                  <button
                    type="button"
                    onClick={() => onRemoveHabit(b.id)}
                    className="ml-1 flex items-center gap-0.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)]"
                  >
                    <X className="w-3 h-3" />
                    撤回
                  </button>
                </div>
              )}

              {needsBreakdown(b.type) && (
                <div className="w-full flex flex-col gap-1.5 py-1">
                  <div className="w-full flex items-center gap-1.5">
                    <span className="flex-1 text-[10px] text-[#B45309] leading-snug">
                      这条执行不了（{TYPE_LABEL[b.type]}），没法打分——拆成能做的行为
                    </span>
                    <button
                      type="button"
                      onClick={() => handleWand(b)}
                      disabled={wandBusy !== null}
                      className="flex items-center gap-1 px-2 py-1 rounded-md border border-[#B45309] text-[11px] font-medium text-[#B45309] hover:bg-[#FEF3C7] transition-colors disabled:opacity-50 flex-shrink-0"
                    >
                      <Wand2 className="w-3 h-3" />
                      {wandBusy === b.id ? "拆解中，10 秒左右..." : "拆成行为"}
                    </button>
                  </div>
                  {wand?.forId === b.id && renderWandBox()}
                </div>
              )}

              {/* 影响力高但做不到 → 改小（福格的解法，不是删） */}
              {(b.impact ?? 0) >= 50 && b.feasibility != null && b.feasibility < 50 && (
                <div className="w-full flex flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleShrink(b)}
                    disabled={shrinkingId !== null}
                    className="self-start flex items-center gap-1 px-2 py-1 rounded-md border border-[#B45309] text-[11px] font-medium text-[#B45309] hover:bg-[#FEF3C7] transition-colors disabled:opacity-50"
                  >
                    <Scissors className="w-3 h-3" />
                    {shrinkingId === b.id ? "改小中，10 秒左右..." : "影响力高但做不到 → 改小"}
                  </button>
                  {shrinkNote && shrinkingId === null && !shrink && (
                    <p className="text-[11px] text-[var(--color-text-secondary)]">{shrinkNote}</p>
                  )}
                  {shrink?.forId === b.id && (
                    <div className="w-full flex flex-col gap-2 p-3 rounded-[10px] bg-white border border-[#B45309]">
                      <p className="text-[11px] leading-relaxed text-[var(--color-text-secondary)]">
                        选一个替换它。福格的标准只有一条：<strong>小到不需要意志力</strong>
                      </p>
                      {shrink.items.map((it, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() =>
                            setShrink((p) =>
                              p
                                ? { ...p, items: p.items.map((x, j) => (j === i ? { ...x, checked: !x.checked } : x)) }
                                : p,
                            )
                          }
                          className={[
                            "w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-colors",
                            it.checked
                              ? "bg-[#FFFBEB] border-[#B45309]"
                              : "bg-white border-[var(--color-border)] opacity-60",
                          ].join(" ")}
                        >
                          <span
                            className={[
                              "w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border",
                              it.checked ? "bg-[#B45309] border-[#B45309]" : "border-[var(--color-border)]",
                            ].join(" ")}
                          >
                            {it.checked && <span className="text-white text-[10px] leading-none">✓</span>}
                          </span>
                          <span className="flex-1 text-[13px] text-[var(--color-text-primary)]">{it.text}</span>
                        </button>
                      ))}
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setShrink(null)}
                          className="px-3 py-1.5 text-[12px] text-[var(--color-text-secondary)] rounded"
                        >
                          取消
                        </button>
                        <button
                          type="button"
                          onClick={applyShrink}
                          className="px-4 py-1.5 text-[12px] bg-[#B45309] text-white rounded font-medium"
                        >
                          换成这个
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[11px] leading-relaxed text-[var(--color-text-tertiary)]">
        右上角那几条才配占你的格子。福格建议一次只养 1-3 个，
        <strong>清单变短才说明这一步做对了</strong>。
      </p>

      {/* 选中后的批量操作栏（固定在底部，滚到哪儿都够得着） */}
      {selected.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[380px] max-w-[92vw] flex flex-col gap-2 px-4 py-3 rounded-[14px] bg-white shadow-[0_4px_20px_rgba(0,0,0,0.15)] border border-[var(--color-border)]">
          <div className="w-full flex items-center gap-2">
            <span className="text-[12px] font-semibold text-[var(--color-text-primary)]">
              已选 {selected.size} 条
            </span>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => {
                setSelected(new Set());
                setScheduling(false);
              }}
              className="text-[12px] text-[var(--color-text-tertiary)]"
            >
              取消选择
            </button>
          </div>

          {scheduling ? (
            <div className="w-full flex items-center gap-2">
              <span className="text-[12px] text-[var(--color-text-secondary)]">排到</span>
              {(
                [
                  ["今天做", toISODate(new Date())],
                  ["明天做", toISODate(addDays(new Date(), 1))],
                ] as Array<[string, ISODate]>
              ).map(([label, date]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => batchSchedule(date)}
                  className="px-3 py-1.5 rounded-lg bg-[#4F46E5] text-white text-[12px] font-medium"
                >
                  {label}
                </button>
              ))}
              <input
                type="date"
                onChange={(e) => e.target.value && batchSchedule(e.target.value as ISODate)}
                className="flex-1 px-2 py-1.5 rounded-lg border border-[var(--color-border)] text-[12px] bg-white"
              />
            </div>
          ) : (
            <div className="w-full flex gap-2">
              {chosenHabits.length > 0 && (
                <button
                  type="button"
                  onClick={batchAddHabits}
                  className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg bg-[var(--color-primary)] text-white text-[13px] font-semibold"
                >
                  <Star className="w-3.5 h-3.5" fill="currentColor" strokeWidth={0} />
                  加入习惯表（{chosenHabits.length}）
                </button>
              )}
              {chosenOnetime.length > 0 && (
                <button
                  type="button"
                  onClick={() => setScheduling(true)}
                  className="flex-1 py-2 rounded-lg bg-[#4F46E5] text-white text-[13px] font-semibold"
                >
                  排到某天（{chosenOnetime.length}）
                </button>
              )}
              {chosenHabits.length === 0 && chosenOnetime.length === 0 && (
                <span className="flex-1 text-[12px] text-[var(--color-text-tertiary)] py-2 text-center">
                  选中的都已经有去处了
                </span>
              )}
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmReset}
        title="重排？"
        description={`会清空这 ${cards.length} 条的两轴位置，一根滑块都不留。清错了可以点上面的「撤回」找回`}
        confirmLabel="清空重排"
        onConfirm={() => {
          onResetAxes();
          setConfirmReset(false);
          setOrder(cards.map((c) => c.id));
          setSort("default");
        }}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  );
}
