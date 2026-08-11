"use client";

import { useState } from "react";
import type {
  Aspiration,
  BehaviorCard,
  BehaviorType,
  GoalResult,
  ISODate,
  Task,
} from "@/components/todo/types";
import { callBehaviorAPI, toPendingItems, type PendingItem } from "@/components/todo/behaviorApi";
import { TYPE_LABEL, TYPE_STYLE, goldenScore, isGolden, isRepeatable, needsBreakdown } from "@/components/todo/behavior";
import {
  buildAIHandoffPrompt,
  IMPORT_TYPE_OPTIONS,
  matchGoalResult,
  normalizeBehaviorText,
  parseAIBehaviorImport,
  type AIImportDraft,
} from "@/components/todo/aiBridge";
import { CN_WEEKDAY, addDays, toISODate } from "@/components/todo/date";
import { BLOCKER_INFO, blockerOf } from "@/components/todo/blocker";
import {
  AlertTriangle,
  ArrowUpDown,
  CalendarPlus,
  Check,
  ClipboardPaste,
  Copy,
  MessagesSquare,
  RefreshCw,
  RotateCcw,
  Scissors,
  Star,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import ConfirmDialog from "@/components/ConfirmDialog";

type AxisPatch = { impact?: number; feasibility?: number };
type SortMode = "default" | "impact" | "score";
type BehaviorReview = {
  forId: string;
  sourceText: string;
  kind: "ready" | "expand" | "rewrite" | "error";
  issue?: string;
  suggestion?: string;
  message?: string;
};
type ImportCandidate = AIImportDraft & {
  id: string;
  checked: boolean;
  duplicate: boolean;
  resultId?: string;
  unmatchedResult?: string;
};

type Props = {
  aspiration: Aspiration;
  /** 有关键结果时，用它作为当前焦点地图和 AI 的直接目标。 */
  focusTitle?: string;
  defaultResultId?: string;
  resultOptions?: GoalResult[];
  /** 外部 AI 交接需要看到整个目标的行为；cards 仍只负责当前焦点地图。 */
  allCards?: BehaviorCard[];
  /** 可重复行为 + 一次性任务，都上图 */
  cards: BehaviorCard[];
  tasks: Task[];
  onSetAxis: (id: string, patch: AxisPatch) => void;
  onResetAxes: () => void;
  onDelete: (id: string) => void;
  onReplaceText: (id: string, text: string) => void;
  onAddExtra: (items: Array<{ text: string; type: BehaviorType; resultId?: string }>) => void;
  onAddHabit: (card: BehaviorCard) => void;
  onRemoveHabit: (behaviorId: string) => void;
  onSchedule: (cardId: string, title: string, date: ISODate) => void;
  onUnschedule: (cardId: string) => void;
  /** 就地增删改，省得为了加一条/改个错字还要切回行为集群 */
  onAdd: (text: string) => void;
  onEditText: (id: string, text: string) => void;
  onSetType: (id: string, type: BehaviorType) => void;
  onAssignResult?: (behaviorId: string, resultId?: string) => void;
  /** 魔法棒发散出来的候选，勾选后收进集群 */
  onCollect: (items: Array<{ text: string; type?: BehaviorType }>) => void;
  habitBehaviorIds: Set<string>;
  /** 正在被 AI 判定的条目——只有这些才显示"判定中"，判失败的不装 */
  judgingIds: Set<string>;
  /** 判定标准改进后老条目不会自己更新，给个全部重判的口子 */
  onRejudgeAll: () => void;
  rejudging: boolean;
  rejudgeProgress: number;
  rejudgeTotal: number;
};

const SORTS: Array<[SortMode, string]> = [
  // 默认 = 没排的浮到最上面，其余保持收集顺序。全部排完之后它就等于收集顺序，
  // 所以不需要再单独给一个"还没排的"
  ["default", "默认"],
  ["impact", "影响力高→低"],
  ["score", "最该先做"], // = 影响力 60% + 可行性 40%，影响力略占主导
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
  focusTitle,
  defaultResultId,
  resultOptions = [],
  allCards,
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
  onAssignResult,
  onCollect,
  habitBehaviorIds,
  judgingIds,
  onRejudgeAll,
  rejudging,
  rejudgeProgress,
  rejudgeTotal,
}: Props) {
  const goalContext = focusTitle?.trim() || aspiration.title;
  const [confirmReset, setConfirmReset] = useState(false);
  const [sort, setSort] = useState<SortMode>("default");
  // 排序是一个动作不是实时绑定——否则拖滑块时行会在手底下乱跳。
  // 默认顺序也是进来时定一次：没排的浮上来，之后你怎么拖它都待在原地
  const [order, setOrder] = useState<string[]>(() => unratedFirst(cards));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scheduling, setScheduling] = useState(false);
  const [singleSchedulingId, setSingleSchedulingId] = useState<string | null>(null);
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

  // 两种改写共用一套 UI：改小（做不到 → 变小）/ 改具体（会卡住 → 给终点或产出物）
  const [shrinkingId, setShrinkingId] = useState<string | null>(null);
  const [shrink, setShrink] = useState<{
    forId: string;
    mode: "shrink" | "concrete";
    items: PendingItem[];
  } | null>(null);
  const [shrinkNote, setShrinkNote] = useState<string | null>(null);
  // 已通过基础分类/边界检查的行为，可选做一次更严格的表达检查。
  // 它不碰影响力和可行性——那两根滑块只能由用户自己拖。
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [behaviorReview, setBehaviorReview] = useState<BehaviorReview | null>(null);
  // 魔法棒：从愿望本身发散，或对某条"愿望/成果"拆解
  const [wandBusy, setWandBusy] = useState<string | "root" | null>(null);
  const [wand, setWand] = useState<{ forId: string | null; note: string; items: PendingItem[] } | null>(null);
  const [wandNote, setWandNote] = useState<string | null>(null);
  // 外部 AI 交接：聊天负责发散，焦点地图继续负责收集、归类和比较。
  const [bridgeOpen, setBridgeOpen] = useState(false);
  const [bridgeCopied, setBridgeCopied] = useState(false);
  const [bridgeNotice, setBridgeNotice] = useState<string | null>(null);
  const [importText, setImportText] = useState("");
  const [importItems, setImportItems] = useState<ImportCandidate[]>([]);
  const [importError, setImportError] = useState<string | null>(null);

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

  async function copyAIHandoff() {
    const prompt = buildAIHandoffPrompt({
      aspiration,
      focusTitle: goalContext,
      results: resultOptions,
      cards: allCards ?? cards,
    });
    try {
      let copied = false;
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(prompt);
          copied = true;
        } catch {
          // 某些移动浏览器暴露了 Clipboard API，却会拒绝写入；继续走兼容方案。
        }
      }
      if (!copied) {
        const fallback = document.createElement("textarea");
        fallback.value = prompt;
        fallback.setAttribute("readonly", "");
        fallback.style.position = "fixed";
        fallback.style.opacity = "0";
        document.body.appendChild(fallback);
        fallback.select();
        copied = document.execCommand("copy");
        fallback.remove();
        if (!copied) throw new Error("copy failed");
      }
      setBridgeCopied(true);
      setBridgeNotice("已复制完整上下文，可以去任意聊天 AI 里继续讨论");
      window.setTimeout(() => setBridgeCopied(false), 1800);
    } catch {
      setBridgeNotice("浏览器没有允许复制，请稍后重试");
    }
  }

  function identifyImport() {
    const drafts = parseAIBehaviorImport(importText);
    if (drafts.length === 0) {
      setImportItems([]);
      setImportError("还没识别出行为。最好粘贴 AI 最后的「可导入行为」清单，或使用一行一条的列表。");
      return;
    }

    const existing = new Set((allCards ?? cards).map((card) => normalizeBehaviorText(card.text)));
    const now = Date.now();
    setImportItems(
      drafts.map((draft, index) => {
        const matchedResult = matchGoalResult(draft.resultTitle, resultOptions);
        const duplicate = existing.has(normalizeBehaviorText(draft.text));
        return {
          ...draft,
          id: `import-${now}-${index}`,
          checked: !duplicate,
          duplicate,
          resultId: matchedResult?.id ?? defaultResultId,
          unmatchedResult: draft.resultTitle && !matchedResult ? draft.resultTitle : undefined,
        };
      }),
    );
    setImportError(null);
    setBridgeNotice(null);
  }

  function updateImportItem(id: string, patch: Partial<ImportCandidate>) {
    setImportItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function confirmImport() {
    const chosen = importItems.filter((item) => item.checked && item.text.trim());
    if (chosen.length === 0) return;
    onAddExtra(
      chosen.map((item) => ({
        text: item.text.trim(),
        type: item.type,
        resultId: item.resultId,
      })),
    );
    setBridgeOpen(false);
    setImportText("");
    setImportItems([]);
    setImportError(null);
    setBridgeNotice(`已带回 ${chosen.length} 条行为；评分仍留给你自己判断`);
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
    if (behaviorReview?.forId === id) setBehaviorReview(null);
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

  function scheduleOne(card: BehaviorCard, date: ISODate) {
    onSchedule(card.id, card.text, date);
    setSingleSchedulingId(null);
  }

  // seed 为空 = 从愿望本身发散；有 seed = 拆这一条愿望/成果
  async function handleWand(seed?: BehaviorCard) {
    if (wandBusy) return;
    setWandBusy(seed ? seed.id : "root");
    setWand(null);
    setWandNote(null);
    const res = await callBehaviorAPI({
      mode: "wand",
      aspiration: seed ? seed.text : goalContext,
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

  async function handleShrink(card: BehaviorCard, mode: "shrink" | "concrete" = "shrink") {
    if (shrinkingId) return;
    setShrinkingId(card.id);
    setShrink(null);
    setShrinkNote(null);
    const res = await callBehaviorAPI({ mode, text: card.text, goal: goalContext });
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
    setShrink({ forId: card.id, mode, items: items.map((it, i) => ({ ...it, checked: i === 0 })) });
  }

  async function handleBehaviorReview(card: BehaviorCard) {
    if (reviewingId) return;
    setReviewingId(card.id);
    setBehaviorReview(null);
    const res = await callBehaviorAPI({
      mode: "clarify-behavior",
      text: card.text,
      goal: goalContext,
      behaviorType: card.type,
    });
    setReviewingId(null);

    if (!res.ok) {
      setBehaviorReview({
        forId: card.id,
        sourceText: card.text,
        kind: "error",
        message: res.noKey ? "还没有配置 AI，原行为不会受影响" : "AI 暂时没响应，稍后再试",
      });
      return;
    }

    const kind = String(res.data.kind ?? "");
    if (kind === "ready") {
      setBehaviorReview({ forId: card.id, sourceText: card.text, kind: "ready" });
      return;
    }

    const issue = String(res.data.issue ?? "").trim();
    if (kind === "expand" && issue) {
      setBehaviorReview({ forId: card.id, sourceText: card.text, kind: "expand", issue });
      return;
    }

    const suggestion = String(res.data.suggestion ?? "").trim();
    if (kind === "rewrite" && issue && suggestion) {
      setBehaviorReview({
        forId: card.id,
        sourceText: card.text,
        kind: "rewrite",
        issue,
        suggestion,
      });
      return;
    }

    setBehaviorReview({
      forId: card.id,
      sourceText: card.text,
      kind: "error",
      message: "AI 这次没说清楚，稍后再试",
    });
  }

  function renderBehaviorReview(card: BehaviorCard) {
    const review = behaviorReview?.forId === card.id && behaviorReview.sourceText === card.text
      ? behaviorReview
      : null;

    if (!review) {
      return (
        <div className="w-full flex justify-end">
          <button
            type="button"
            onClick={() => handleBehaviorReview(card)}
            disabled={reviewingId !== null}
            className="flex items-center gap-1 text-[10px] font-medium text-[var(--color-primary)] hover:text-[#1D4ED8] disabled:opacity-50 transition-colors"
            title="只检查行为有没有说清楚，不替你判断影响力和可行性"
          >
            <Wand2 className="w-3 h-3" />
            {reviewingId === card.id ? "正在看…" : "帮我说清楚"}
          </button>
        </div>
      );
    }

    return (
      <div className="w-full flex flex-col gap-1.5 px-2.5 py-2 rounded-lg border border-[#BFDBFE] bg-[#F8FBFF]">
        {review.kind === "ready" && (
          <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-[var(--color-text-secondary)]">
            <Check className="w-3.5 h-3.5 mt-[1px] text-[var(--color-success)] flex-shrink-0" strokeWidth={3} />
            表达已经清楚。影响力和你能不能做到，继续由你自己判断。
          </p>
        )}

        {review.kind === "error" && (
          <p className="text-[11px] text-[var(--color-text-tertiary)]">{review.message}</p>
        )}

        {review.kind === "rewrite" && review.suggestion && (
          <>
            <p className="text-[11px] leading-relaxed text-[var(--color-text-secondary)]">
              还差一点：{review.issue}
            </p>
            <p className="text-[12px] font-medium leading-relaxed text-[var(--color-text-primary)]">
              {review.suggestion}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  onReplaceText(card.id, review.suggestion!);
                  setBehaviorReview(null);
                }}
                className="px-2.5 py-1 rounded-md bg-[var(--color-primary)] text-white text-[10px] font-medium hover:bg-[#1D4ED8] transition-colors"
              >
                采用建议
              </button>
              <button
                type="button"
                onClick={() => setBehaviorReview(null)}
                className="px-2 py-1 text-[10px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
              >
                保留原文
              </button>
            </div>
          </>
        )}

        {review.kind === "expand" && (
          <>
            <p className="text-[11px] leading-relaxed text-[var(--color-text-secondary)]">
              这更像愿望或成果：{review.issue}
            </p>
            <button
              type="button"
              onClick={() => handleWand(card)}
              disabled={wandBusy !== null}
              className="self-start flex items-center gap-1 px-2.5 py-1 rounded-md border border-[var(--color-primary)] text-[10px] font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary-light)] disabled:opacity-50"
            >
              <Wand2 className="w-3 h-3" />
              {wandBusy === card.id ? "发散中…" : "发散成多个行为"}
            </button>
            {wand?.forId === card.id && renderWandBox()}
          </>
        )}

        {(review.kind === "ready" || review.kind === "error") && (
          <button
            type="button"
            onClick={() => setBehaviorReview(null)}
            className="self-end text-[10px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
          >
            收起
          </button>
        )}
      </div>
    );
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

  /** 改写候选框：改小 / 改具体共用 */
  function renderShrinkBox() {
    if (!shrink) return null;
    return (
        <div className="w-full flex flex-col gap-2 p-3 rounded-[10px] bg-white border border-[#B45309]">
          <p className="text-[11px] leading-relaxed text-[var(--color-text-secondary)]">
            {shrink.mode === "concrete" ? (
              <>
                选一个替换它。标准：<strong>做完了自己一眼就知道</strong>——有终点，或者有产出物
              </>
            ) : (
              <>
                选一个替换它。福格的标准只有一条：<strong>小到不需要意志力</strong>
              </>
            )}
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
    );
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
          onClick={onRejudgeAll}
          disabled={rejudging}
          className="flex items-center gap-1 text-[12px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] disabled:opacity-50 flex-shrink-0"
          title="全部重判一遍，开思考模式判得更准（慢一些）。你手动改判过的不动"
        >
          <RefreshCw className={["w-3 h-3", rejudging ? "animate-spin" : ""].join(" ")} />
          {rejudging ? `重判中 ${rejudgeProgress}/${rejudgeTotal}` : "重判"}
        </button>
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

      {/* 不把焦点地图硬做成聊天框：把完整上下文交给任意 AI，聊完再收回结构化行为。 */}
      <div className="flex w-full flex-col gap-2 rounded-[11px] border border-[#D9E5FF] bg-[#F8FAFF] p-2.5">
        <div className="flex w-full flex-wrap items-center gap-2">
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary-light)] text-[var(--color-primary)]">
            <MessagesSquare className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-[150px] flex-1">
            <p className="text-[11px] font-semibold text-[var(--color-text-primary)]">需要聊一聊，才想得出行为？</p>
            <p className="mt-0.5 text-[9px] leading-3.5 text-[var(--color-text-tertiary)]">
              把目标、关键结果和已有行为带去任意聊天 AI，聊完再粘贴回来。
            </p>
          </div>
          <button
            type="button"
            onClick={copyAIHandoff}
            className="flex h-7 items-center gap-1 rounded-lg border border-[var(--color-primary)] bg-white px-2 text-[10px] font-semibold text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary-light)]"
          >
            {bridgeCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {bridgeCopied ? "已复制" : "带去聊"}
          </button>
          <button
            type="button"
            onClick={() => {
              setBridgeOpen((open) => !open);
              setImportError(null);
            }}
            className="flex h-7 items-center gap-1 rounded-lg bg-[var(--color-primary)] px-2 text-[10px] font-semibold text-white transition-colors hover:bg-[#1D4ED8]"
            aria-expanded={bridgeOpen}
          >
            <ClipboardPaste className="h-3 w-3" />
            带回来
          </button>
        </div>

        {bridgeNotice && (
          <p className="rounded-md bg-white px-2 py-1.5 text-[10px] font-medium text-[var(--color-primary)]" role="status">
            {bridgeNotice}
          </p>
        )}

        {bridgeOpen && (
          <div className="flex w-full flex-col gap-2 border-t border-[#D9E5FF] pt-2">
            <textarea
              value={importText}
              onChange={(event) => {
                setImportText(event.target.value);
                setImportItems([]);
                setImportError(null);
              }}
              rows={4}
              placeholder="把 AI 最后的「可导入行为」清单粘贴到这里……"
              className="w-full resize-y rounded-lg border border-[var(--color-border)] bg-white px-2.5 py-2 text-[11px] leading-relaxed text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-primary)]"
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[9px] leading-3.5 text-[var(--color-text-tertiary)]">
                只读取列表，不会把整段聊天直接写进焦点地图。
              </span>
              <button
                type="button"
                onClick={identifyImport}
                disabled={!importText.trim()}
                className="flex-shrink-0 rounded-lg bg-white px-2.5 py-1.5 text-[10px] font-semibold text-[var(--color-primary)] ring-1 ring-inset ring-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary-light)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                识别行为
              </button>
            </div>

            {importError && (
              <p className="rounded-lg bg-[#FFF7ED] px-2.5 py-2 text-[10px] leading-relaxed text-[#C2410C]">
                {importError}
              </p>
            )}

            {importItems.length > 0 && (
              <div className="flex w-full flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-[var(--color-text-secondary)]">
                    识别出 {importItems.length} 条，确认后才导入
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setImportItems((prev) => prev.map((item) => ({ ...item, checked: !item.duplicate })))
                    }
                    className="text-[9px] font-medium text-[var(--color-primary)]"
                  >
                    恢复推荐选择
                  </button>
                </div>

                {importItems.map((item) => (
                  <div
                    key={item.id}
                    className={[
                      "flex w-full items-start gap-2 rounded-lg border bg-white p-2",
                      item.checked ? "border-[#BFDBFE]" : "border-[var(--color-border)] opacity-65",
                    ].join(" ")}
                  >
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={(event) => updateImportItem(item.id, { checked: event.target.checked })}
                      className="mt-1 h-3.5 w-3.5 flex-shrink-0 accent-[var(--color-primary)]"
                      aria-label={`选择导入「${item.text}」`}
                    />
                    <div className="min-w-0 flex-1">
                      <input
                        value={item.text}
                        onChange={(event) => updateImportItem(item.id, { text: event.target.value })}
                        className="w-full bg-transparent text-[11px] font-medium text-[var(--color-text-primary)] outline-none"
                        aria-label="导入的行为文字"
                      />
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <select
                          value={item.type}
                          onChange={(event) =>
                            updateImportItem(item.id, { type: event.target.value as BehaviorType })
                          }
                          className="rounded-md bg-[var(--color-bg-gray-lighter)] px-1.5 py-1 text-[9px] font-medium text-[var(--color-text-secondary)] outline-none"
                          aria-label={`「${item.text}」的类型`}
                        >
                          {IMPORT_TYPE_OPTIONS.map((type) => (
                            <option key={type} value={type}>{TYPE_LABEL[type]}</option>
                          ))}
                        </select>
                        {resultOptions.length > 0 && (
                          <select
                            value={item.resultId ?? ""}
                            onChange={(event) =>
                              updateImportItem(item.id, {
                                resultId: event.target.value || undefined,
                                unmatchedResult: undefined,
                              })
                            }
                            className="min-w-0 max-w-[220px] rounded-md bg-[var(--color-bg-gray-lighter)] px-1.5 py-1 text-[9px] text-[var(--color-text-secondary)] outline-none"
                            aria-label={`「${item.text}」归属的关键结果`}
                          >
                            <option value="">未归属关键结果</option>
                            {resultOptions.map((result) => (
                              <option key={result.id} value={result.id}>{result.title}</option>
                            ))}
                          </select>
                        )}
                        {item.duplicate && (
                          <span className="rounded bg-[#FFF7ED] px-1.5 py-0.5 text-[8px] font-medium text-[#C2410C]">
                            已有相同行为，默认不选
                          </span>
                        )}
                        {item.unmatchedResult && (
                          <span className="text-[8px] text-[#C27720]">
                            AI 写的是「{item.unmatchedResult}」，请确认归属
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                <div className="flex items-center justify-end gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setBridgeOpen(false);
                      setImportItems([]);
                      setImportError(null);
                    }}
                    className="px-2.5 py-1.5 text-[10px] font-medium text-[var(--color-text-secondary)]"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={confirmImport}
                    disabled={!importItems.some((item) => item.checked && item.text.trim())}
                    className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-[10px] font-semibold text-white transition-colors hover:bg-[#1D4ED8] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    导入 {importItems.filter((item) => item.checked && item.text.trim()).length} 条
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

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
              : "影响力占 60%，能做到占 40%；两边都重要，影响力略高的优先"}
        </span>
        <span className="w-full text-[10px] font-medium leading-relaxed text-[var(--color-text-secondary)]">
          左边方框只用于多选；单条行为直接用卡片里的按钮。
        </span>
      </div>

      {/* 这条**不是 AI 判的**，是你自己拖的两根滑块算出来的，所以不会误报，留着。
          但不再替你开药方——怎么变简单（改小 / 拆开做）你自己定 */}
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
            {stuck.length} 条<strong>影响力高但你做不到</strong> —— 别删，想想怎么变简单
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
          const issueKind = blockerOf(b);
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
                  aria-label={`批量选择「${b.text}」`}
                  title="加入批量选择"
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
                  onClick={() => {
                    if (behaviorReview?.forId === b.id) setBehaviorReview(null);
                    onDelete(b.id);
                  }}
                  className="w-[16px] h-[16px] flex items-center justify-center flex-shrink-0"
                  aria-label="删掉这条"
                >
                  <Trash2 className="w-[13px] h-[13px] text-[#A1A1AA]" />
                </button>
              </div>

              {typingId === b.id && (
                <div className="w-full flex flex-col gap-1 py-1">
                  <div className="w-full flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] text-[var(--color-text-tertiary)] flex-shrink-0">归为</span>
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
                        className="px-2 py-[3px] rounded-md border text-[10px] font-medium flex-shrink-0 whitespace-nowrap"
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
                  </div>
                  <span className="text-[9px] text-[var(--color-text-tertiary)] leading-snug">
                    判成愿望/成果的，用那行的「拆成行为」
                  </span>
                </div>
              )}

              {b.type === "unsorted" && b.impact == null && b.feasibility == null ? (
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

              {resultOptions.length > 0 && onAssignResult && (
                <label className="mt-0.5 flex w-full items-center gap-2 rounded-md bg-[var(--color-bg-gray-lighter)] px-2 py-1.5">
                  <span className="flex-shrink-0 text-[10px] text-[var(--color-text-tertiary)]">
                    归属结果
                  </span>
                  <select
                    value={b.resultId ?? ""}
                    onChange={(event) => onAssignResult(b.id, event.target.value || undefined)}
                    className="min-w-0 flex-1 bg-transparent text-[10px] font-medium text-[var(--color-text-secondary)] outline-none"
                    aria-label={`${b.text} 归属的关键结果`}
                  >
                    <option value="">未归属</option>
                    {resultOptions.map((result) => (
                      <option key={result.id} value={result.id}>
                        {result.title}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {/* 单条行为有自己的快路径；左上方框只负责多选和批量操作。 */}
              {((isRepeatable(b.type) && !inHabits) || (b.type === "onetime" && !task)) && (
                <div className="mt-0.5 flex w-full items-center gap-1.5">
                  {isRepeatable(b.type) && !inHabits && (
                    <button
                      type="button"
                      onClick={() => onAddHabit(b)}
                      className="flex items-center gap-1 rounded-md border border-[var(--color-primary)] bg-white px-2 py-1 text-[10px] font-semibold text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary-light)]"
                    >
                      <Star className="h-3 w-3" />
                      加入习惯
                    </button>
                  )}
                  {b.type === "onetime" && !task && (
                    <button
                      type="button"
                      onClick={() =>
                        setSingleSchedulingId((current) => (current === b.id ? null : b.id))
                      }
                      className="flex items-center gap-1 rounded-md border border-[#C7D2FE] bg-[#EEF2FF] px-2 py-1 text-[10px] font-semibold text-[#4F46E5] transition-colors hover:bg-[#E0E7FF]"
                      aria-expanded={singleSchedulingId === b.id}
                    >
                      <CalendarPlus className="h-3 w-3" />
                      排日程
                    </button>
                  )}
                </div>
              )}

              {singleSchedulingId === b.id && b.type === "onetime" && !task && (
                <div className="mt-0.5 grid w-full grid-cols-4 gap-1.5 rounded-lg bg-[var(--color-bg-gray-lighter)] p-2">
                  {Array.from({ length: 7 }).map((_, i) => {
                    const date = addDays(new Date(), i);
                    const iso = toISODate(date) as ISODate;
                    const label = i === 0 ? "今天" : i === 1 ? "明天" : CN_WEEKDAY[date.getDay()];
                    return (
                      <button
                        key={iso}
                        type="button"
                        onClick={() => scheduleOne(b, iso)}
                        className="flex flex-col items-center rounded-md border border-[#C7D2FE] bg-white py-1 text-[#4F46E5] transition-colors hover:bg-[#EEF2FF]"
                      >
                        <span className="text-[10px] font-semibold leading-tight">{label}</span>
                        <span className="text-[9px] leading-tight opacity-70">
                          {date.getMonth() + 1}/{date.getDate()}
                        </span>
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setSingleSchedulingId(null)}
                    className="rounded-md py-1 text-[10px] text-[var(--color-text-tertiary)]"
                  >
                    取消
                  </button>
                </div>
              )}

              {/* 已经通过自动分类和边界检查的，才提供可选的二次表达检查。
                  有明显问题的条目继续走下方现有修复，不重复摆两个 AI 入口。 */}
              {b.type !== "unsorted" && issueKind === null && renderBehaviorReview(b)}

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
                  已安排为一次性任务 · {cnDate(task.date)}
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

              {/* 一行只报一个问题，而且只剩两种：还不是行为 / 没有边界。
                  砍掉缺时机、要判断、太费力的理由见 blocker.ts —— 一句话：误报太多，
                  而且那三种在这一屏上你什么也修不了 */}
              {(() => {
                const kind = issueKind;
                if (!kind) return null;
                const info = BLOCKER_INFO[kind];
                const busy = shrinkingId === b.id || wandBusy === b.id;
                return (
                  <div className="w-full flex flex-col gap-1 py-0.5">
                    <div className="w-full flex items-start gap-1 text-[10px] text-[#B45309] leading-snug">
                      <AlertTriangle className="w-3 h-3 mt-[1px] flex-shrink-0" />
                      <span className="flex-1">
                        <strong>{info.label}</strong>
                        {b.reason ? `（${b.reason}）` : ""} —— {info.hint}
                      </span>
                    </div>

                    {info.action === "breakdown" && (
                      <button
                        type="button"
                        onClick={() => handleWand(b)}
                        disabled={wandBusy !== null}
                        className="self-start flex items-center gap-1 px-2 py-1 rounded-md border border-[#B45309] text-[11px] font-medium text-[#B45309] hover:bg-[#FEF3C7] transition-colors disabled:opacity-50"
                      >
                        <Wand2 className="w-3 h-3" />
                        {busy ? "拆解中，10 秒左右..." : "拆成行为"}
                      </button>
                    )}
                    {info.action === "concrete" && (
                      <button
                        type="button"
                        onClick={() => handleShrink(b, "concrete")}
                        disabled={shrinkingId !== null}
                        className="self-start flex items-center gap-1 px-2 py-1 rounded-md border border-[#B45309] text-[11px] font-medium text-[#B45309] hover:bg-[#FEF3C7] transition-colors disabled:opacity-50"
                      >
                        <Wand2 className="w-3 h-3" />
                        {busy ? "改写中，10 秒左右..." : "给它一个边界"}
                      </button>
                    )}
                    {shrinkNote && shrinkingId === null && !shrink && (
                      <p className="text-[11px] text-[var(--color-text-secondary)]">{shrinkNote}</p>
                    )}
                    {shrink?.forId === b.id && renderShrinkBox()}
                    {wand?.forId === b.id && renderWandBox()}
                  </div>
                );
              })()}

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
            /* 七天按钮，不用原生 date input——它在 iOS 上放固定定位条里选完常常不生效 */
            <div className="w-full flex flex-col gap-1.5">
              <span className="text-[11px] text-[var(--color-text-secondary)]">一次性行为安排到哪天？</span>
              <div className="w-full grid grid-cols-4 gap-1.5">
                {Array.from({ length: 7 }).map((_, i) => {
                  const d = addDays(new Date(), i);
                  const iso = toISODate(d) as ISODate;
                  const label = i === 0 ? "今天" : i === 1 ? "明天" : CN_WEEKDAY[d.getDay()];
                  return (
                    <button
                      key={iso}
                      type="button"
                      onClick={() => batchSchedule(iso)}
                      className="flex flex-col items-center py-1.5 rounded-lg bg-[#EEF2FF] border border-[#C7D2FE] text-[#4F46E5] hover:bg-[#E0E7FF] transition-colors"
                    >
                      <span className="text-[11px] font-semibold leading-tight">{label}</span>
                      <span className="text-[10px] opacity-70 leading-tight">
                        {d.getMonth() + 1}/{d.getDate()}
                      </span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setScheduling(false)}
                  className="flex items-center justify-center py-1.5 rounded-lg text-[11px] text-[var(--color-text-tertiary)]"
                >
                  取消
                </button>
              </div>
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
                  加入习惯（{chosenHabits.length}）
                </button>
              )}
              {chosenOnetime.length > 0 && (
                <button
                  type="button"
                  onClick={() => setScheduling(true)}
                  className="flex-1 py-2 rounded-lg bg-[#4F46E5] text-white text-[13px] font-semibold"
                >
                  安排一次性任务（{chosenOnetime.length}）
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
