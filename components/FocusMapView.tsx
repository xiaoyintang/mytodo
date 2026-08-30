"use client";

import { useRef, useState } from "react";
import type {
  Aspiration,
  BehaviorCard,
  BehaviorStep,
  BehaviorType,
  GoalResult,
  ISODate,
  StartAction,
  Task,
} from "@/components/todo/types";
import { callBehaviorAPI, toPendingItems, type PendingItem } from "@/components/todo/behaviorApi";
import { TYPE_LABEL, TYPE_STYLE, goldenScore, isActionable, isGolden, isRepeatable, needsBreakdown } from "@/components/todo/behavior";
import {
  buildAIHandoffPrompt,
  IMPORT_TYPE_OPTIONS,
  matchBehaviorCard,
  matchGoalResult,
  normalizeBehaviorText,
  parseAIGoalResultImport,
  parseAIBehaviorImport,
  type AIBehaviorImportApply,
  type AIImportDraft,
  type AIResultImportApply,
  type AIResultImportDraft,
} from "@/components/todo/aiBridge";
import { CN_WEEKDAY, addDays, toISODate } from "@/components/todo/date";
import { BLOCKER_INFO, blockerOf } from "@/components/todo/blocker";
import {
  AlertTriangle,
  ArrowUpDown,
  CalendarPlus,
  Check,
  ChevronDown,
  ClipboardPaste,
  Copy,
  MessagesSquare,
  Pencil,
  RefreshCw,
  RotateCcw,
  Star,
  Trash2,
  Undo2,
  Wand2,
  X,
} from "lucide-react";
import ConfirmDialog from "@/components/ConfirmDialog";
import BehaviorStepsEditor from "@/components/BehaviorStepsEditor";
import StartActionEditor from "@/components/StartActionEditor";

type AxisPatch = { impact?: number; feasibility?: number };
type SortMode = "score" | "impact";
type BehaviorReview = {
  forId: string;
  sourceText: string;
  kind: "ready" | "expand" | "task-package" | "rewrite" | "error";
  issue?: string;
  suggestion?: string;
  message?: string;
};
type ImportCandidate = AIImportDraft & {
  id: string;
  checked: boolean;
  duplicate: boolean;
  unchanged: boolean;
  replaceId?: string;
  resultId?: string;
  resultImportClientId?: string;
  unmatchedResult?: string;
  unmatchedReplacement?: string;
};
type ResultImportCandidate = AIResultImportDraft & {
  id: string;
  checked: boolean;
  duplicate: boolean;
  unchanged: boolean;
  replaceId?: string;
  unmatchedReplacement?: string;
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
  onSetSteps: (id: string, steps: BehaviorStep[]) => void;
  onSetStartAction: (id: string, startAction?: StartAction) => void;
  onConvertToTaskPackage: (id: string, steps: BehaviorStep[]) => void;
  onResetAxes: () => void;
  onDelete: (id: string) => void;
  onDeleteMany: (ids: string[]) => void;
  onReplaceText: (id: string, text: string) => void;
  onAddExtra: (items: Array<{ text: string; type: BehaviorType; resultId?: string }>) => void;
  onApplyImport: (
    results: AIResultImportApply[],
    behaviors: AIBehaviorImportApply[],
  ) => void;
  onAddHabit: (card: BehaviorCard) => void;
  onRemoveHabit: (behaviorId: string) => void;
  onSchedule: (cardId: string, title: string, date: ISODate) => void;
  onUnschedule: (cardId: string, date?: ISODate) => void;
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
  /** 焦点地图的改动大多发生在行为区；撤回需要跟着操作区，而不是留在页面顶部。 */
  onUndo: () => void;
  canUndo: boolean;
};

const SORTS: Array<[SortMode, string]> = [
  ["score", "综合分高→低"],
  ["impact", "影响力高→低"],
];

/** 默认先给结论：两轴都评完的按综合分降序；半成品和未评分统一沉底。 */
function scoreFirst(cards: BehaviorCard[]): string[] {
  const sourceIndex = new Map(cards.map((card, index) => [card.id, index]));
  const fullyRated = (card: BehaviorCard) =>
    isActionable(card.type) && card.impact != null && card.feasibility != null;

  return [...cards]
    .sort((a, b) => {
      const aRated = fullyRated(a);
      const bRated = fullyRated(b);
      if (aRated !== bRated) return bRated ? 1 : -1;
      if (aRated && bRated) {
        const scoreGap = goldenScore(b) - goldenScore(a);
        if (scoreGap !== 0) return scoreGap;
      }
      return (sourceIndex.get(a.id) ?? 0) - (sourceIndex.get(b.id) ?? 0);
    })
    .map((card) => card.id);
}

function impactFirst(cards: BehaviorCard[]): string[] {
  const sourceIndex = new Map(cards.map((card, index) => [card.id, index]));
  const hasImpact = (card: BehaviorCard) => isActionable(card.type) && card.impact != null;

  return [...cards]
    .sort((a, b) => {
      const aRated = hasImpact(a);
      const bRated = hasImpact(b);
      if (aRated !== bRated) return bRated ? 1 : -1;
      if (aRated && bRated) {
        const impactGap = (b.impact ?? 0) - (a.impact ?? 0);
        if (impactGap !== 0) return impactGap;
      }
      return (sourceIndex.get(a.id) ?? 0) - (sourceIndex.get(b.id) ?? 0);
    })
    .map((card) => card.id);
}

// 散点图尺寸
const W = 336;
const H = 168;
const PAD = 12;

function cnDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(m)}月${Number(d)}日`;
}

function sameProcedure(current: BehaviorStep[] | undefined, proposed: string[] | undefined) {
  const left = (current ?? []).map((step) => normalizeBehaviorText(step.title));
  const right = (proposed ?? []).map(normalizeBehaviorText);
  return left.length === right.length && left.every((step, index) => step === right[index]);
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
  onSetSteps,
  onSetStartAction,
  onConvertToTaskPackage,
  onResetAxes,
  onDelete,
  onDeleteMany,
  onReplaceText,
  onAddExtra,
  onApplyImport,
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
  onUndo,
  canUndo,
}: Props) {
  const goalContext = focusTitle?.trim() || aspiration.title;
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmBatchDelete, setConfirmBatchDelete] = useState(false);
  const [sort, setSort] = useState<SortMode>("score");
  const cardsRef = useRef(cards);
  cardsRef.current = cards;
  // 排序是一个动作不是实时绑定——否则拖滑块时行会在手底下乱跳。
  // 进入当前焦点地图时按综合分排一次，之后你怎么拖它都先待在原地。
  const [order, setOrder] = useState<string[]>(() => scoreFirst(cards));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scheduling, setScheduling] = useState(false);
  const [batchScheduleDates, setBatchScheduleDates] = useState<Set<ISODate>>(new Set());
  const [singleSchedulingId, setSingleSchedulingId] = useState<string | null>(null);
  const [singleScheduleDates, setSingleScheduleDates] = useState<Set<ISODate>>(new Set());
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
  // 焦点地图首先是一张比较清单：默认鸟瞰，真正要评分/编辑时一次只展开一条。
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
  const [importResults, setImportResults] = useState<ResultImportCandidate[]>([]);
  const [importItems, setImportItems] = useState<ImportCandidate[]>([]);
  const [importError, setImportError] = useState<string | null>(null);

  const actionableCards = cards.filter((card) => isActionable(card.type));
  const golden = actionableCards
    .filter(isGolden)
    .slice()
    .sort((a, b) => goldenScore(b) - goldenScore(a));
  const goldenRank = new Map(golden.map((g, i) => [g.id, i + 1]));
  const plotted = actionableCards.filter((c) => c.impact != null && c.feasibility != null);
  const rated = actionableCards.filter((c) => c.impact != null || c.feasibility != null).length;
  const rateable = actionableCards.length;

  // 新加的卡还没有评分，也不在排序快照里：统一沉到末尾，不挡住已排出的优先项。
  const ordered = [...cards].sort((a, b) => {
    const aIndex = order.indexOf(a.id);
    const bIndex = order.indexOf(b.id);
    return (aIndex < 0 ? Number.MAX_SAFE_INTEGER : aIndex) -
      (bIndex < 0 ? Number.MAX_SAFE_INTEGER : bIndex);
  });
  const list = ordered;

  function applySort(mode: SortMode) {
    setSort(mode);
    setOrder(mode === "score" ? scoreFirst(cards) : impactFirst(cards));
  }

  function refreshCurrentSort() {
    // 滑块拖动中不重排，避免卡片从手下跑掉；松手后再按最终分数落位。
    window.requestAnimationFrame(() => {
      const currentCards = cardsRef.current;
      setOrder(sort === "score" ? scoreFirst(currentCards) : impactFirst(currentCards));
    });
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

  function matchImportedResult(title: string | undefined, items: ResultImportCandidate[]) {
    if (!title) return undefined;
    const needle = normalizeBehaviorText(title);
    const exact = items.find((item) => normalizeBehaviorText(item.title) === needle);
    if (exact || needle.length < 4) return exact;
    return items.find((item) => {
      const candidate = normalizeBehaviorText(item.title);
      return candidate.includes(needle) || needle.includes(candidate);
    });
  }

  function resultImportStatus(
    operation: ResultImportCandidate["operation"],
    title: string,
    evidence?: string,
    replaceId?: string,
  ) {
    const normalized = normalizeBehaviorText(title);
    const target = replaceId ? resultOptions.find((result) => result.id === replaceId) : undefined;
    const sameTitleResult = resultOptions.find(
      (result) => normalizeBehaviorText(result.title) === normalized,
    );
    return {
      unchanged: Boolean(
        target &&
        normalizeBehaviorText(target.title) === normalized &&
        (target.evidence ?? "").trim() === (evidence ?? "").trim()
      ),
      duplicate:
        operation === "add"
          ? Boolean(sameTitleResult)
          : Boolean(sameTitleResult && sameTitleResult.id !== replaceId),
    };
  }

  function identifyImport() {
    const resultDrafts = parseAIGoalResultImport(importText);
    const behaviorDrafts = parseAIBehaviorImport(importText);
    if (resultDrafts.length === 0 && behaviorDrafts.length === 0) {
      setImportResults([]);
      setImportItems([]);
      setImportError("还没识别出变更。请粘贴 AI 最后的「可导入关键结果 / 可导入行为」区块。");
      return;
    }

    const sourceCards = allCards ?? cards;
    const existing = new Set(sourceCards.map((card) => normalizeBehaviorText(card.text)));
    const now = Date.now();
    const resultCandidates = resultDrafts.map((draft, index): ResultImportCandidate => {
      const matchedReplacement = draft.operation === "replace"
        ? matchGoalResult(draft.replacesTitle, resultOptions)
        : undefined;
      const status = resultImportStatus(
        draft.operation,
        draft.title,
        draft.evidence,
        matchedReplacement?.id,
      );
      const canApply = draft.operation === "add"
        ? !status.duplicate
        : Boolean(matchedReplacement) && !status.duplicate && !status.unchanged;
      return {
        ...draft,
        id: `import-result-${now}-${index}`,
        checked: canApply,
        ...status,
        replaceId: matchedReplacement?.id,
        unmatchedReplacement:
          draft.operation === "replace" && draft.replacesTitle && !matchedReplacement
            ? draft.replacesTitle
            : undefined,
      };
    });
    setImportResults(resultCandidates);

    setImportItems(
      behaviorDrafts.map((draft, index) => {
        const matchedReplacement = draft.operation === "replace"
          ? matchBehaviorCard(draft.replacesText, sourceCards)
          : undefined;
        // 行为清单按“应用变更后的最终标题”写归属，所以先匹配同批关键结果。
        const matchedImportedResult = matchImportedResult(draft.resultTitle, resultCandidates);
        const matchedResult = matchedImportedResult
          ? undefined
          : matchGoalResult(draft.resultTitle, resultOptions);
        const sameTextCard = sourceCards.find(
          (card) => normalizeBehaviorText(card.text) === normalizeBehaviorText(draft.text),
        );
        const resolvedType =
          draft.operation === "replace" && draft.type === "unsorted" && matchedReplacement
            ? matchedReplacement.type
            : draft.type;
        const procedureUnchanged = !draft.stepsMode || sameProcedure(
          matchedReplacement?.steps,
          draft.stepsMode === "clear" ? [] : draft.steps,
        );
        const unchanged = Boolean(
          matchedReplacement &&
          sameTextCard?.id === matchedReplacement.id &&
          matchedReplacement.type === resolvedType &&
          procedureUnchanged,
        );
        const duplicate = draft.operation === "add"
          ? existing.has(normalizeBehaviorText(draft.text))
          : Boolean(sameTextCard && sameTextCard.id !== matchedReplacement?.id);
        const canApply = draft.operation === "add"
          ? !duplicate
          : Boolean(matchedReplacement) && !duplicate && !unchanged;
        return {
          ...draft,
          id: `import-${now}-${index}`,
          checked: canApply,
          duplicate,
          unchanged,
          replaceId: matchedReplacement?.id,
          type: resolvedType,
          resultImportClientId: matchedImportedResult?.id,
          resultId:
            matchedResult?.id ??
            (matchedImportedResult
              ? undefined
              : draft.operation === "replace" ? matchedReplacement?.resultId : defaultResultId),
          unmatchedResult:
            draft.resultTitle && !matchedImportedResult && !matchedResult
              ? draft.resultTitle
              : undefined,
          unmatchedReplacement:
            draft.operation === "replace" && draft.replacesText && !matchedReplacement
              ? draft.replacesText
              : undefined,
        };
      }),
    );
    setImportError(null);
    setBridgeNotice(null);
  }

  function updateImportResult(id: string, patch: Partial<ResultImportCandidate>) {
    setImportResults((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  function updateImportItem(id: string, patch: Partial<ImportCandidate>) {
    setImportItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function changeResultImportOperation(
    item: ResultImportCandidate,
    operation: ResultImportCandidate["operation"],
  ) {
    const status = resultImportStatus(operation, item.title, item.evidence);
    updateImportResult(item.id, {
      operation,
      replaceId: undefined,
      replacesTitle: undefined,
      unmatchedReplacement: undefined,
      ...status,
      checked: operation === "add" && !status.duplicate,
    });
  }

  function changeResultImportTarget(item: ResultImportCandidate, replaceId?: string) {
    const target = resultOptions.find((result) => result.id === replaceId);
    const status = resultImportStatus("replace", item.title, item.evidence, replaceId);
    updateImportResult(item.id, {
      replaceId,
      replacesTitle: target?.title,
      unmatchedReplacement: undefined,
      ...status,
      checked: Boolean(target) && !status.duplicate && !status.unchanged,
    });
  }

  function changeResultImportText(
    item: ResultImportCandidate,
    patch: { title?: string; evidence?: string },
  ) {
    const title = patch.title ?? item.title;
    const evidence = patch.evidence ?? item.evidence;
    const status = resultImportStatus(item.operation, title, evidence, item.replaceId);
    updateImportResult(item.id, { ...patch, ...status });
  }

  function importTextStatus(
    operation: ImportCandidate["operation"],
    text: string,
    replaceId?: string,
    type?: BehaviorType,
    stepsMode?: ImportCandidate["stepsMode"],
    steps?: string[],
  ) {
    const sourceCards = allCards ?? cards;
    const normalized = normalizeBehaviorText(text);
    const target = replaceId ? sourceCards.find((card) => card.id === replaceId) : undefined;
    const sameTextCard = sourceCards.find(
      (card) => normalizeBehaviorText(card.text) === normalized,
    );
    const resolvedType = type === "unsorted" && target ? target.type : type;
    const procedureUnchanged = !stepsMode || sameProcedure(
      target?.steps,
      stepsMode === "clear" ? [] : steps,
    );
    return {
      unchanged: Boolean(
        target &&
        normalizeBehaviorText(target.text) === normalized &&
        (!resolvedType || target.type === resolvedType) &&
        procedureUnchanged,
      ),
      duplicate:
        operation === "add"
          ? Boolean(sameTextCard)
          : Boolean(sameTextCard && sameTextCard.id !== replaceId),
    };
  }

  function changeImportOperation(item: ImportCandidate, operation: ImportCandidate["operation"]) {
    const status = importTextStatus(
      operation,
      item.text,
      undefined,
      item.type,
      item.stepsMode,
      item.steps,
    );
    updateImportItem(item.id, {
      operation,
      replaceId: undefined,
      replacesText: undefined,
      unmatchedReplacement: undefined,
      ...status,
      checked: operation === "add" && !status.duplicate,
    });
  }

  function changeImportTarget(item: ImportCandidate, replaceId?: string) {
    const target = (allCards ?? cards).find((card) => card.id === replaceId);
    const requestedResult = matchGoalResult(item.resultTitle, resultOptions);
    const type = item.type === "unsorted" && target ? target.type : item.type;
    const status = importTextStatus(
      "replace",
      item.text,
      replaceId,
      type,
      item.stepsMode,
      item.steps,
    );
    updateImportItem(item.id, {
      replaceId,
      replacesText: target?.text,
      unmatchedReplacement: undefined,
      type,
      resultId: requestedResult?.id ?? target?.resultId,
      resultImportClientId: undefined,
      ...status,
      checked: Boolean(target) && !status.duplicate && !status.unchanged,
    });
  }

  function changeImportText(item: ImportCandidate, text: string) {
    const status = importTextStatus(
      item.operation,
      text,
      item.replaceId,
      item.type,
      item.stepsMode,
      item.steps,
    );
    updateImportItem(item.id, { text, ...status });
  }

  function changeImportType(item: ImportCandidate, type: BehaviorType) {
    const status = importTextStatus(
      item.operation,
      item.text,
      item.replaceId,
      type,
      item.stepsMode,
      item.steps,
    );
    updateImportItem(item.id, { type, ...status });
  }

  function importItemReady(item: ImportCandidate) {
    const importedResult = item.resultImportClientId
      ? importResults.find((result) => result.id === item.resultImportClientId)
      : undefined;
    return Boolean(
      item.checked &&
      item.text.trim() &&
      (item.operation === "add" || item.replaceId) &&
      (!item.resultImportClientId || (importedResult && resultImportReady(importedResult))),
    );
  }

  function resultImportReady(item: ResultImportCandidate) {
    return Boolean(
      item.checked &&
      item.title.trim() &&
      (item.operation === "add" || item.replaceId),
    );
  }

  function confirmImport() {
    const chosenResults = importResults.filter(resultImportReady);
    const chosenBehaviors = importItems.filter(importItemReady);
    if (chosenResults.length === 0 && chosenBehaviors.length === 0) return;
    onApplyImport(
      chosenResults.map((item) => ({
        clientId: item.id,
        operation: item.operation,
        replaceId: item.replaceId,
        title: item.title.trim(),
        evidence: item.evidence?.trim() || undefined,
      })),
      chosenBehaviors.map((item) => ({
        operation: item.operation,
        replaceId: item.replaceId,
        text: item.text.trim(),
        type: item.type,
        stepsMode: item.stepsMode,
        steps: item.steps,
        resultId: item.resultId,
        resultImportClientId: item.resultImportClientId,
      })),
    );
    setBridgeOpen(false);
    setImportText("");
    setImportResults([]);
    setImportItems([]);
    setImportError(null);
    const resultAdds = chosenResults.filter((item) => item.operation === "add").length;
    const resultReplaces = chosenResults.length - resultAdds;
    const behaviorAdds = chosenBehaviors.filter((item) => item.operation === "add").length;
    const behaviorReplaces = chosenBehaviors.length - behaviorAdds;
    const procedureChanges = chosenBehaviors.filter((item) => item.stepsMode).length;
    const resultPart = chosenResults.length > 0
      ? `关键结果 ${resultAdds ? `新增 ${resultAdds}` : ""}${resultAdds && resultReplaces ? "、" : ""}${resultReplaces ? `替换 ${resultReplaces}` : ""}`
      : "";
    const behaviorPart = chosenBehaviors.length > 0
      ? `推进项 ${behaviorAdds ? `新增 ${behaviorAdds}` : ""}${behaviorAdds && behaviorReplaces ? "、" : ""}${behaviorReplaces ? `替换 ${behaviorReplaces}` : ""}${procedureChanges ? `（含步骤流程 ${procedureChanges}）` : ""}`
      : "";
    setBridgeNotice(`已${[resultPart, behaviorPart].filter(Boolean).join("；")}；可撤回本次导入`);
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
  const chosenSchedulable = chosen.filter(
    (card) =>
      isRepeatable(card.type) ||
      (card.type === "onetime" &&
        !tasks.some(
          (task) => task.id === card.taskId || task.sourceBehaviorId === card.id,
        )),
  );
  const chosenTaskIds = new Set(
    chosen.flatMap((card) => (card.taskId ? [card.taskId] : [])),
  );
  const chosenPendingTaskCount = tasks.filter(
    (task) =>
      task.status !== "done" &&
      (chosenTaskIds.has(task.id) ||
        Boolean(task.sourceBehaviorId && selected.has(task.sourceBehaviorId))),
  ).length;
  const chosenActiveHabitCount = chosen.filter((card) => habitBehaviorIds.has(card.id)).length;
  const chosenRepeatables = chosenSchedulable.filter((card) => isRepeatable(card.type));
  const chosenOneTimes = chosenSchedulable.filter((card) => card.type === "onetime");
  const upcomingScheduleDates = Array.from({ length: 7 }).map((_, index) => {
    const date = addDays(new Date(), index);
    return {
      date,
      iso: toISODate(date) as ISODate,
      label: index === 0 ? "今天" : index === 1 ? "明天" : CN_WEEKDAY[date.getDay()],
    };
  });

  function batchAddHabits() {
    chosenHabits.forEach(onAddHabit);
    setSelected(new Set());
  }

  function toggleBatchScheduleDate(date: ISODate) {
    setBatchScheduleDates((current) => {
      // 只有一次性任务时仍保持单选；只要包含可重复行为，就可以铺到多天。
      if (chosenRepeatables.length === 0) return new Set([date]);
      const next = new Set(current);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  function confirmBatchSchedule() {
    const dates = upcomingScheduleDates
      .map((item) => item.iso)
      .filter((date) => batchScheduleDates.has(date));
    if (dates.length === 0) return;
    chosenRepeatables.forEach((card) => {
      dates.forEach((date) => onSchedule(card.id, card.text, date));
    });
    // 一次性任务不能复制七份；混选时统一落在所选日期里最早的一天。
    chosenOneTimes.forEach((card) => onSchedule(card.id, card.text, dates[0]));
    setSelected(new Set());
    setScheduling(false);
    setBatchScheduleDates(new Set());
  }

  function scheduleOneTime(card: BehaviorCard, date: ISODate) {
    onSchedule(card.id, card.text, date);
    setSingleSchedulingId(null);
    setSingleScheduleDates(new Set());
  }

  function openSingleSchedule(card: BehaviorCard, repeatTasks: Task[]) {
    if (singleSchedulingId === card.id) {
      setSingleSchedulingId(null);
      setSingleScheduleDates(new Set());
      return;
    }
    setSingleSchedulingId(card.id);
    setSingleScheduleDates(
      isRepeatable(card.type)
        ? new Set(
            repeatTasks
              .map((task) => task.date)
              .filter((date) => upcomingScheduleDates.some((item) => item.iso === date)),
          )
        : new Set(),
    );
  }

  function toggleSingleScheduleDate(date: ISODate) {
    setSingleScheduleDates((current) => {
      const next = new Set(current);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  function saveRepeatSchedule(card: BehaviorCard, repeatTasks: Task[]) {
    const original = new Set(
      repeatTasks
        .map((task) => task.date)
        .filter((date) => upcomingScheduleDates.some((item) => item.iso === date)),
    );
    upcomingScheduleDates.forEach(({ iso }) => {
      if (original.has(iso) && !singleScheduleDates.has(iso)) onUnschedule(card.id, iso);
      if (!original.has(iso) && singleScheduleDates.has(iso)) onSchedule(card.id, card.text, iso);
    });
    setSingleSchedulingId(null);
    setSingleScheduleDates(new Set());
  }

  // seed 为空 = 从愿望本身发散；有 seed = 把这一条愿望/成果发散成“同级备选”。
  // 真正的 AND 型任务步骤走 BehaviorStepsEditor，不能混到这里铺平。
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
        ? `把「${seed.text}」发散成互相独立的行为备选；它们会放在当前结果下，与原条目同级。勾掉你不要的：`
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
    if (kind === "task_package" && issue) {
      setBehaviorReview({ forId: card.id, sourceText: card.text, kind: "task-package", issue });
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

        {review.kind === "task-package" && (
          <>
            <p className="text-[11px] leading-relaxed text-[var(--color-text-secondary)]">
              这更适合作为任务包：{review.issue}
            </p>
            <p className="text-[10px] leading-relaxed text-[var(--color-text-tertiary)]">
              用上方“任务步骤”把完整流程留在这张卡里；步骤共同完成父任务，不会散成同级行为。
            </p>
            <button
              type="button"
              onClick={() => setBehaviorReview(null)}
              className="self-end text-[10px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
            >
              知道了
            </button>
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
          onPointerUp={refreshCurrentSort}
          onKeyUp={refreshCurrentSort}
          onBlur={refreshCurrentSort}
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
      <div
        data-testid="focus-behavior-toolbar"
        className={[
          "sticky z-20 -mx-1 flex w-[calc(100%+0.5rem)] items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-white/95 px-2 py-1.5 shadow-[0_3px_10px_rgba(15,23,42,0.06)] backdrop-blur",
          resultOptions.length > 0 ? "top-[46px]" : "top-0",
        ].join(" ")}
      >
        <span className="flex-1 truncate text-[11px] font-medium text-[var(--color-text-secondary)]">
          行为操作
        </span>
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          className="flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-semibold text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary-light)] disabled:cursor-default disabled:text-[var(--color-text-tertiary)] disabled:opacity-45 disabled:hover:bg-transparent"
          title={canUndo ? "撤回上一步改动" : "还没有可撤回的改动"}
        >
          <Undo2 className="h-3.5 w-3.5" />
          撤回
        </button>
        <button
          type="button"
          onClick={onRejudgeAll}
          disabled={rejudging}
          className="flex h-7 flex-shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-bg-gray-light)] hover:text-[var(--color-text-secondary)] disabled:opacity-50"
          title="全部重判一遍，开思考模式判得更准（慢一些）。你手动改判过的不动"
        >
          <RefreshCw className={["w-3 h-3", rejudging ? "animate-spin" : ""].join(" ")} />
          {rejudging ? `重判中 ${rejudgeProgress}/${rejudgeTotal}` : "重判"}
        </button>
        <button
          type="button"
          onClick={() => setConfirmReset(true)}
          className="flex h-7 flex-shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-bg-gray-light)] hover:text-[var(--color-text-secondary)]"
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
            优先推进
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
          placeholder="想到一条推进项就直接加，回车"
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

      {/* 不把焦点地图硬做成聊天框：把完整上下文交给任意 AI，聊完再收回结果与行为。 */}
      <div className="flex w-full flex-col gap-2 rounded-[11px] border border-[#D9E5FF] bg-[#F8FAFF] p-2.5">
        <div className="flex w-full flex-wrap items-center gap-2">
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary-light)] text-[var(--color-primary)]">
            <MessagesSquare className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-[150px] flex-1">
            <p className="text-[11px] font-semibold text-[var(--color-text-primary)]">需要聊一聊，才理得清结果和行为？</p>
            <p className="mt-0.5 text-[9px] leading-3.5 text-[var(--color-text-tertiary)]">
              把完整上下文带去任意聊天 AI，聊完可调整关键结果和行为。
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
                setImportResults([]);
                setImportItems([]);
                setImportError(null);
              }}
              rows={4}
              placeholder="把 AI 最后的「可导入关键结果 / 可导入行为」区块粘贴到这里……"
              className="w-full resize-y rounded-lg border border-[var(--color-border)] bg-white px-2.5 py-2 text-[11px] leading-relaxed text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-primary)]"
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[9px] leading-3.5 text-[var(--color-text-tertiary)]">
                先确认关键结果，再确认行为归属；所有替换都要匹配原文。
              </span>
              <button
                type="button"
                onClick={identifyImport}
                disabled={!importText.trim()}
                className="flex-shrink-0 rounded-lg bg-white px-2.5 py-1.5 text-[10px] font-semibold text-[var(--color-primary)] ring-1 ring-inset ring-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary-light)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                识别变更
              </button>
            </div>

            {importError && (
              <p className="rounded-lg bg-[#FFF7ED] px-2.5 py-2 text-[10px] leading-relaxed text-[#C2410C]">
                {importError}
              </p>
            )}

            {(importResults.length > 0 || importItems.length > 0) && (
              <div className="flex w-full flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-[var(--color-text-secondary)]">
                    关键结果 {importResults.length} 条 · 行为 {importItems.length} 条，确认后才生效
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setImportResults((prev) => prev.map((item) => ({
                        ...item,
                        checked:
                          !item.duplicate &&
                          !item.unchanged &&
                          (item.operation === "add" || Boolean(item.replaceId)),
                      })));
                      setImportItems((prev) => prev.map((item) => ({
                        ...item,
                        checked:
                          !item.duplicate &&
                          !item.unchanged &&
                          (item.operation === "add" || Boolean(item.replaceId)),
                      })));
                    }}
                    className="text-[9px] font-medium text-[var(--color-primary)]"
                  >
                    恢复推荐选择
                  </button>
                </div>

                {importResults.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <p className="text-[9px] font-semibold text-[var(--color-primary)]">
                      1 · 先确认关键结果
                    </p>
                    {importResults.map((item) => (
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
                          onChange={(event) => updateImportResult(item.id, { checked: event.target.checked })}
                          className="mt-1 h-3.5 w-3.5 flex-shrink-0 accent-[var(--color-primary)]"
                          aria-label={`选择应用关键结果「${item.title}」`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="mb-1.5 flex w-full flex-wrap items-center gap-1.5">
                            <select
                              value={item.operation}
                              onChange={(event) =>
                                changeResultImportOperation(
                                  item,
                                  event.target.value as ResultImportCandidate["operation"],
                                )
                              }
                              className="rounded-md bg-[var(--color-primary-light)] px-1.5 py-1 text-[9px] font-semibold text-[var(--color-primary)] outline-none"
                              aria-label={`关键结果「${item.title}」的变更方式`}
                            >
                              <option value="add">新增</option>
                              <option value="replace">替换</option>
                            </select>
                            {item.operation === "replace" && (
                              <select
                                value={item.replaceId ?? ""}
                                onChange={(event) =>
                                  changeResultImportTarget(item, event.target.value || undefined)
                                }
                                className="min-w-0 max-w-full flex-1 rounded-md bg-[#FFF7ED] px-1.5 py-1 text-[9px] font-medium text-[#C2410C] outline-none"
                                aria-label={`选择「${item.title}」要替换的原关键结果`}
                              >
                                <option value="">选择要替换的原关键结果…</option>
                                {resultOptions.map((result) => (
                                  <option key={result.id} value={result.id}>{result.title}</option>
                                ))}
                              </select>
                            )}
                          </div>
                          <input
                            value={item.title}
                            onChange={(event) => changeResultImportText(item, { title: event.target.value })}
                            className="w-full bg-transparent text-[11px] font-semibold text-[var(--color-text-primary)] outline-none"
                            aria-label="变更后的关键结果"
                          />
                          <input
                            value={item.evidence ?? ""}
                            onChange={(event) => changeResultImportText(item, { evidence: event.target.value })}
                            placeholder="达成证据：怎样确认有进展？"
                            className="mt-0.5 w-full bg-transparent text-[9px] text-[var(--color-text-secondary)] outline-none placeholder:text-[var(--color-text-tertiary)]"
                            aria-label={`关键结果「${item.title}」的达成证据`}
                          />
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            {item.duplicate && (
                              <span className="rounded bg-[#FFF7ED] px-1.5 py-0.5 text-[8px] font-medium text-[#C2410C]">
                                {item.operation === "add"
                                  ? "已有同名关键结果，默认不选"
                                  : "会与另一条关键结果重名，默认不选"}
                              </span>
                            )}
                            {item.unchanged && (
                              <span className="rounded bg-[var(--color-bg-gray-light)] px-1.5 py-0.5 text-[8px] text-[var(--color-text-secondary)]">
                                内容没有变化
                              </span>
                            )}
                            {item.operation === "replace" && !item.replaceId && (
                              <span className="text-[8px] font-medium text-[#C2410C]">
                                {item.unmatchedReplacement
                                  ? `没找到原关键结果「${item.unmatchedReplacement}」，请手动选择`
                                  : "请选择要替换的原关键结果"}
                              </span>
                            )}
                            {item.operation === "replace" && item.replaceId && !item.unchanged && (
                              <span className="text-[8px] text-[var(--color-primary)]">
                                原有行为归属会保留
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {importItems.length > 0 && (
                  <p className="mt-1 text-[9px] font-semibold text-[var(--color-primary)]">
                    {importResults.length > 0 ? "2" : "1"} · 再确认行为和归属
                  </p>
                )}

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
                      aria-label={`选择应用「${item.text}」`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="mb-1.5 flex w-full flex-wrap items-center gap-1.5">
                        <select
                          value={item.operation}
                          onChange={(event) =>
                            changeImportOperation(
                              item,
                              event.target.value as ImportCandidate["operation"],
                            )
                          }
                          className="rounded-md bg-[var(--color-primary-light)] px-1.5 py-1 text-[9px] font-semibold text-[var(--color-primary)] outline-none"
                          aria-label={`「${item.text}」的变更方式`}
                        >
                          <option value="add">新增</option>
                          <option value="replace">替换</option>
                        </select>
                        {item.operation === "replace" && (
                          <select
                            value={item.replaceId ?? ""}
                            onChange={(event) =>
                              changeImportTarget(item, event.target.value || undefined)
                            }
                            className="min-w-0 max-w-full flex-1 rounded-md bg-[#FFF7ED] px-1.5 py-1 text-[9px] font-medium text-[#C2410C] outline-none"
                            aria-label={`选择「${item.text}」要替换的原行为`}
                          >
                            <option value="">选择要替换的原行为…</option>
                            {(allCards ?? cards).map((card) => (
                              <option key={card.id} value={card.id}>{card.text}</option>
                            ))}
                          </select>
                        )}
                      </div>
                      <input
                        value={item.text}
                        onChange={(event) => changeImportText(item, event.target.value)}
                        className="w-full bg-transparent text-[11px] font-medium text-[var(--color-text-primary)] outline-none"
                        aria-label="变更后的行为文字"
                      />
                      {item.stepsMode && (() => {
                        const original = item.replaceId
                          ? (allCards ?? cards).find((card) => card.id === item.replaceId)
                          : undefined;
                        const nextSteps = item.stepsMode === "clear" ? [] : item.steps ?? [];
                        return (
                          <div className="mt-1.5 rounded-md border border-[#BFDBFE] bg-[#F8FAFF] px-2 py-1.5">
                            <div className="flex flex-wrap items-center justify-between gap-1">
                              <span className="text-[9px] font-semibold text-[var(--color-primary)]">
                                {item.type === "onetime" ? "任务步骤" : "固定流程"}
                                {item.operation === "replace" && original
                                  ? ` · ${original.steps?.length ?? 0} 步 → ${nextSteps.length} 步`
                                  : ` · ${nextSteps.length} 步`}
                              </span>
                              <span className="text-[8px] text-[var(--color-text-tertiary)]">
                                整体替换，顺序以此为准
                              </span>
                            </div>
                            {nextSteps.length > 0 ? (
                              <ol className="mt-1 flex flex-col gap-0.5">
                                {nextSteps.map((step, index) => (
                                  <li key={`${index}-${step}`} className="flex items-start gap-1.5 text-[9px] leading-snug text-[var(--color-text-secondary)]">
                                    <span className="w-3 flex-shrink-0 text-right tabular-nums text-[var(--color-primary)]">
                                      {index + 1}.
                                    </span>
                                    <span>{step}</span>
                                  </li>
                                ))}
                              </ol>
                            ) : (
                              <p className="mt-1 text-[9px] text-[#C2410C]">清空这条行为的固定流程</p>
                            )}
                            {item.operation === "replace" && original && (
                              <p className="mt-1 text-[8px] leading-snug text-[var(--color-text-tertiary)]">
                                只更新行为模板；已经排出的任务保持原步骤。
                              </p>
                            )}
                          </div>
                        );
                      })()}
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <select
                          value={item.type}
                          onChange={(event) =>
                            changeImportType(item, event.target.value as BehaviorType)
                          }
                          className="rounded-md bg-[var(--color-bg-gray-lighter)] px-1.5 py-1 text-[9px] font-medium text-[var(--color-text-secondary)] outline-none"
                          aria-label={`「${item.text}」的类型`}
                        >
                          {IMPORT_TYPE_OPTIONS.map((type) => (
                            <option key={type} value={type}>{TYPE_LABEL[type]}</option>
                          ))}
                        </select>
                        {(resultOptions.length > 0 || importResults.length > 0) && (
                          <select
                            value={
                              item.resultImportClientId
                                ? `import:${item.resultImportClientId}`
                                : item.resultId ?? ""
                            }
                            onChange={(event) => {
                              const value = event.target.value;
                              updateImportItem(item.id, {
                                resultId: value && !value.startsWith("import:") ? value : undefined,
                                resultImportClientId: value.startsWith("import:")
                                  ? value.slice("import:".length)
                                  : undefined,
                                resultTitle: undefined,
                                unmatchedResult: undefined,
                              });
                            }}
                            className="min-w-0 max-w-[220px] rounded-md bg-[var(--color-bg-gray-lighter)] px-1.5 py-1 text-[9px] text-[var(--color-text-secondary)] outline-none"
                            aria-label={`「${item.text}」归属的关键结果`}
                          >
                            <option value="">未归属关键结果</option>
                            {resultOptions.map((result) => (
                              <option key={result.id} value={result.id}>{result.title}</option>
                            ))}
                            {importResults.map((result) => (
                              <option key={result.id} value={`import:${result.id}`}>
                                导入后：{result.title}
                              </option>
                            ))}
                          </select>
                        )}
                        {item.duplicate && (
                          <span className="rounded bg-[#FFF7ED] px-1.5 py-0.5 text-[8px] font-medium text-[#C2410C]">
                            {item.operation === "add"
                              ? "已有相同行为，默认不选"
                              : "变更后会与另一条行为重复，默认不选"}
                          </span>
                        )}
                        {item.unchanged && (
                          <span className="rounded bg-[var(--color-bg-gray-light)] px-1.5 py-0.5 text-[8px] font-medium text-[var(--color-text-secondary)]">
                            替换前后相同，无需应用
                          </span>
                        )}
                        {item.operation === "replace" && !item.replaceId && (
                          <span className="text-[8px] font-medium text-[#C2410C]">
                            {item.unmatchedReplacement
                              ? `没找到 AI 写的原行为「${item.unmatchedReplacement}」，请手动选择`
                              : "请选择要替换的原行为"}
                          </span>
                        )}
                        {item.operation === "replace" && item.replaceId && !item.unchanged && (
                          <span className="text-[8px] text-[var(--color-primary)]">
                            {(() => {
                              const original = (allCards ?? cards).find(
                                (card) => card.id === item.replaceId,
                              );
                              const onlyProcedureChanges = Boolean(
                                item.stepsMode &&
                                original &&
                                normalizeBehaviorText(original.text) === normalizeBehaviorText(item.text) &&
                                original.type === item.type &&
                                !item.resultImportClientId &&
                                original.resultId === item.resultId,
                              );
                              return onlyProcedureChanges
                                ? "只更新固定流程 · 保留原评分与关联"
                                : "保留原位置与关联 · 清空旧评分";
                            })()}
                          </span>
                        )}
                        {item.unmatchedResult && (
                          <span className="text-[8px] text-[#C27720]">
                            AI 写的是「{item.unmatchedResult}」，请确认归属
                          </span>
                        )}
                        {item.resultImportClientId && !importResults.some(
                          (result) => result.id === item.resultImportClientId && resultImportReady(result),
                        ) && (
                          <span className="text-[8px] text-[#C27720]">
                            先勾选并补全它引用的关键结果
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
                      setImportResults([]);
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
                    disabled={
                      !importResults.some(resultImportReady) && !importItems.some(importItemReady)
                    }
                    className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-[10px] font-semibold text-white transition-colors hover:bg-[#1D4ED8] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    应用 {importResults.filter(resultImportReady).length + importItems.filter(importItemReady).length} 条变更
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
          {sort === "score"
            ? "影响力占 60%，能做到占 40%；两轴都评完才参与排名，没评分的统一放最后。拖动时列表不乱跳，松手后自动按新分数落位"
            : "按影响力从高到低比较；还没填写影响力的统一放最后。拖动时列表不乱跳，松手后自动按新分数落位"}
        </span>
        <span className="w-full text-[10px] font-medium leading-relaxed text-[var(--color-text-secondary)]">
          左边方框只用于多选；单条推进项直接用卡片里的按钮。
        </span>
      </div>

      {/* 默认是鸟瞰清单；一次只展开一条，评分表单不再永久撑高每个行为。 */}
      <div className="w-full flex flex-col gap-1">
        {list.map((b) => {
          const rank = goldenRank.get(b.id);
          const st = TYPE_STYLE[b.type];
          const picked = selected.has(b.id);
          const task = !isRepeatable(b.type)
            ? tasks.find((candidate) =>
                candidate.id === b.taskId || candidate.sourceBehaviorId === b.id,
              )
            : undefined;
          const repeatTasks = isRepeatable(b.type)
            ? tasks.filter((candidate) => candidate.sourceBehaviorId === b.id)
            : [];
          const originalRepeatDates = new Set(repeatTasks.map((candidate) => candidate.date));
          const repeatScheduleChanged = upcomingScheduleDates.some(
            ({ iso }) => originalRepeatDates.has(iso) !== singleScheduleDates.has(iso),
          );
          const startActionCount =
            (b.startAction ? 1 : 0) + (b.steps?.filter((step) => step.startAction).length ?? 0);
          const inHabits = habitBehaviorIds.has(b.id);
          const issueKind = blockerOf(b);
          const isExpanded = expandedId === b.id;
          return (
            <div
              key={b.id}
              className={[
                "w-full flex flex-col rounded-lg border px-2.5 transition-[background-color,border-color,box-shadow]",
                isExpanded ? "py-2 shadow-[0_3px_12px_rgba(15,23,42,0.06)]" : "py-1.5",
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
              <div className="flex min-h-7 w-full items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => toggleSelect(b.id)}
                  className={[
                    "flex h-[17px] w-[17px] flex-shrink-0 items-center justify-center rounded border",
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
                  <span className="flex h-[17px] w-[17px] flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-[9px] font-bold text-white">
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
                    className="min-w-0 flex-1 rounded border border-[var(--color-primary)] bg-white px-2 py-1 text-[12px] focus:outline-none"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setExpandedId((current) => (current === b.id ? null : b.id));
                      setTypingId(null);
                    }}
                    className="min-w-0 flex-1 truncate text-left text-[12px] font-medium leading-5 text-[var(--color-text-primary)]"
                    data-full-text={b.text}
                    aria-expanded={isExpanded}
                  >
                    {b.text}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setExpandedId(b.id);
                    setTypingId(typingId === b.id ? null : b.id);
                  }}
                  className="flex-shrink-0 rounded border px-1.5 py-[1px] text-[8px] font-medium"
                  style={{ backgroundColor: st.bg, borderColor: st.border, color: st.text }}
                  title={b.type === "unsorted" ? "AI 正在判它是什么，也可以自己点一个" : "判错了？点一下改"}
                >
                  {b.type === "unsorted"
                    ? judgingIds.has(b.id)
                      ? "判定中…"
                      : "未判定"
                    : b.type === "onetime" && b.steps?.length
                      ? "任务包"
                      : TYPE_LABEL[b.type]}
                </button>
                {b.steps && b.steps.length > 0 && (
                  <span
                    className="flex-shrink-0 text-[8px] font-medium text-[var(--color-primary)]"
                    title={`${b.type === "onetime" ? "任务步骤" : "固定流程"} ${b.steps.length} 步`}
                  >
                    {b.steps.length}步
                  </span>
                )}
                {startActionCount > 0 && (
                  <span
                    className="flex-shrink-0 rounded bg-[#EEF2FF] px-1 py-[1px] text-[8px] font-medium text-[#4F46E5]"
                    title={
                      startActionCount === 1
                        ? `最小启动：${b.startAction?.title ?? b.steps?.find((step) => step.startAction)?.startAction?.title}`
                        : `${startActionCount} 个步骤设有最小启动`
                    }
                  >
                    {startActionCount > 1 ? `${startActionCount}个最小启动` : "有最小启动"}
                  </span>
                )}
                {(task || repeatTasks.length > 0 || inHabits) && (
                  <span
                    className="flex-shrink-0"
                    title={
                      task
                        ? "已排日程"
                        : repeatTasks.length > 0
                          ? `已排 ${repeatTasks.length} 天`
                          : "已在习惯"
                    }
                  >
                    <Check className="h-3 w-3 text-[var(--color-success)]" />
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setExpandedId((current) => (current === b.id ? null : b.id))}
                  className="flex flex-shrink-0 items-center gap-1 rounded-md px-1 py-0.5 text-[9px] tabular-nums text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-gray-light)]"
                  aria-label={`${isExpanded ? "收起" : "展开"}「${b.text}」的评分与设置`}
                  aria-expanded={isExpanded}
                  title={`影响 ${b.impact ?? "未评分"} · 能做 ${b.feasibility ?? "未评分"}`}
                >
                  <span className={b.impact == null ? "text-[var(--color-text-tertiary)]" : "font-semibold text-[var(--color-primary)]"}>
                    影 {b.impact ?? "—"}
                  </span>
                  <span className="text-[var(--color-border)]">·</span>
                  <span className={b.feasibility == null ? "text-[var(--color-text-tertiary)]" : "font-semibold text-[var(--color-primary)]"}>
                    能 {b.feasibility ?? "—"}
                  </span>
                  {issueKind && <AlertTriangle className="h-3 w-3 text-[#B45309]" />}
                  <ChevronDown className={["h-3.5 w-3.5 transition-transform", isExpanded ? "rotate-180" : ""].join(" ")} />
                </button>
              </div>

              {isExpanded && (
                <div className="mt-1.5 flex w-full flex-col gap-1 border-t border-[var(--color-border)] pt-2">
                  <div className="flex w-full items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(b.id);
                        setEditText(b.text);
                        setTypingId(null);
                      }}
                      className="flex items-center gap-1 text-[10px] font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                    >
                      <Pencil className="h-3 w-3" />
                      修改文字
                    </button>
                    <span className="flex-1" />
                    {task && <span className="text-[9px] font-medium text-[var(--color-success)]">已排日程</span>}
                    {repeatTasks.length > 0 && (
                      <span className="text-[9px] font-medium text-[var(--color-success)]">
                        已排 {repeatTasks.length} 天
                      </span>
                    )}
                    {inHabits && <span className="text-[9px] font-medium text-[var(--color-success)]">已在习惯</span>}
                    <button
                      type="button"
                      onClick={() => {
                        if (behaviorReview?.forId === b.id) setBehaviorReview(null);
                        onDelete(b.id);
                      }}
                      className="flex items-center gap-1 text-[10px] text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)]"
                      aria-label="删掉这条"
                    >
                      <Trash2 className="h-3 w-3" />
                      删除
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
                    成果可以原地拆成任务包，也可以继续发散行为备选；愿望需要先发散。
                  </span>
                </div>
              )}

              {b.type === "unsorted" && b.impact == null && b.feasibility == null ? (
                <span className="text-[10px] text-[var(--color-text-tertiary)] py-1">
                  {judgingIds.has(b.id)
                    ? "AI 正在判它是不是行为，判完就能打分（也可以直接点上面的标签自己定）"
                    : "AI 没判出来（可能没连上）——点上面的标签自己定一个，就能打分了"}
                </span>
              ) : needsBreakdown(b.type) ? (
                <span className="text-[10px] leading-relaxed text-[var(--color-text-tertiary)] py-1">
                  {b.type === "outcome"
                    ? "它现在还是成果，先选择拆成一个任务包，或发散成多条独立备选；确定执行单位后再评分。"
                    : "愿望本身不能评分，先发散出可以执行的推进项。"}
                </span>
              ) : (
                <>
                  {renderSlider(b, "impact")}
                  {renderSlider(b, "feasibility")}
                </>
              )}

              {isActionable(b.type) && (
                <>
                  <BehaviorStepsEditor
                    behaviorTitle={b.text}
                    goal={goalContext}
                    steps={b.steps ?? []}
                    mode={b.type === "onetime" ? "task" : "procedure"}
                    onChange={(steps) => onSetSteps(b.id, steps)}
                  />
                  {!(b.steps?.length) && (
                    <StartActionEditor
                      value={b.startAction}
                      onChange={(startAction) => onSetStartAction(b.id, startAction)}
                    />
                  )}
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
              {(isRepeatable(b.type) || (b.type === "onetime" && !task)) && (
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
                  {(isRepeatable(b.type) || (b.type === "onetime" && !task)) && (
                    <button
                      type="button"
                      onClick={() => openSingleSchedule(b, repeatTasks)}
                      className="flex items-center gap-1 rounded-md border border-[#C7D2FE] bg-[#EEF2FF] px-2 py-1 text-[10px] font-semibold text-[#4F46E5] transition-colors hover:bg-[#E0E7FF]"
                      aria-expanded={singleSchedulingId === b.id}
                    >
                      <CalendarPlus className="h-3 w-3" />
                      排日程
                    </button>
                  )}
                  {b.type === "onetime" && Boolean(b.steps?.length) && !inHabits && (
                    <button
                      type="button"
                      onClick={() => onSetType(b.id, "habit")}
                      className="flex items-center gap-1 rounded-md border border-[#BFDBFE] bg-white px-2 py-1 text-[10px] font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-primary-light)] hover:text-[var(--color-primary)]"
                      title="这套步骤以后会重复执行时使用"
                    >
                      <RefreshCw className="h-3 w-3" />
                      改为重复流程
                    </button>
                  )}
                </div>
              )}

              {singleSchedulingId === b.id &&
                (isRepeatable(b.type) || (b.type === "onetime" && !task)) && (
                <div className="mt-0.5 flex w-full flex-col gap-1.5 rounded-lg bg-[var(--color-bg-gray-lighter)] p-2">
                  <div className="grid w-full grid-cols-4 gap-1.5">
                    {upcomingScheduleDates.map(({ date, iso, label }) => {
                      const alreadyScheduled = originalRepeatDates.has(iso);
                      const pickedDate = singleScheduleDates.has(iso);
                      const pendingRemoval = alreadyScheduled && !pickedDate;
                      return (
                        <button
                          key={iso}
                          type="button"
                          onClick={() =>
                            isRepeatable(b.type)
                              ? toggleSingleScheduleDate(iso)
                              : scheduleOneTime(b, iso)
                          }
                          className={[
                            "flex flex-col items-center rounded-md border py-1 transition-colors",
                            pendingRemoval
                              ? "border-[#FCA5A5] bg-[#FEF2F2] text-[var(--color-danger)]"
                              : pickedDate
                                ? "border-[#818CF8] bg-[#EEF2FF] text-[#4F46E5]"
                                : "border-[#C7D2FE] bg-white text-[#4F46E5] hover:bg-[#EEF2FF]",
                          ].join(" ")}
                          title={
                            isRepeatable(b.type)
                              ? pickedDate
                                ? `取消${label}的安排`
                                : `选中${label}`
                              : `安排到${label}`
                          }
                        >
                          <span className="text-[10px] font-semibold leading-tight">
                            {pendingRemoval
                              ? "将移除"
                              : alreadyScheduled && pickedDate
                                ? "已排"
                                : pickedDate
                                  ? "已选"
                                  : label}
                          </span>
                          <span className="text-[9px] leading-tight opacity-70">
                            {date.getMonth() + 1}/{date.getDate()}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {isRepeatable(b.type) ? (
                    <div className="flex w-full items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          setSingleScheduleDates(
                            singleScheduleDates.size === upcomingScheduleDates.length
                              ? new Set()
                              : new Set(upcomingScheduleDates.map((item) => item.iso)),
                          )
                        }
                        className="rounded-md border border-[var(--color-border)] bg-white px-2 py-1 text-[10px] font-medium text-[var(--color-text-secondary)]"
                      >
                        {singleScheduleDates.size === upcomingScheduleDates.length ? "清空" : "整周"}
                      </button>
                      <span className="flex-1 text-[9px] text-[var(--color-text-tertiary)]">
                        已选 {singleScheduleDates.size} 天
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setSingleSchedulingId(null);
                          setSingleScheduleDates(new Set());
                        }}
                        className="px-2 py-1 text-[10px] text-[var(--color-text-tertiary)]"
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        disabled={!repeatScheduleChanged}
                        onClick={() => saveRepeatSchedule(b, repeatTasks)}
                        className="rounded-md bg-[#4F46E5] px-2.5 py-1 text-[10px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {singleScheduleDates.size === 0 ? "清空安排" : "保存安排"}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setSingleSchedulingId(null);
                        setSingleScheduleDates(new Set());
                      }}
                      className="self-end px-2 py-1 text-[10px] text-[var(--color-text-tertiary)]"
                    >
                      取消
                    </button>
                  )}
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
              {repeatTasks.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--color-success)]">
                  <Check className="h-3 w-3" />
                  <span>已排进日程</span>
                  {repeatTasks
                    .slice()
                    .sort((left, right) => left.date.localeCompare(right.date))
                    .map((candidate) => (
                      <button
                        key={candidate.id}
                        type="button"
                        onClick={() => onUnschedule(b.id, candidate.date)}
                        className="flex items-center gap-0.5 rounded-md border border-[#BBF7D0] bg-[#F0FDF4] px-1.5 py-0.5 text-[9px] text-[#15803D] transition-colors hover:border-[#FCA5A5] hover:bg-[#FEF2F2] hover:text-[var(--color-danger)]"
                        aria-label={`撤回 ${cnDate(candidate.date)} 的排期`}
                      >
                        {cnDate(candidate.date)}
                        <X className="h-2.5 w-2.5" />
                      </button>
                    ))}
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
                        {b.type === "outcome" ? (
                          <>
                            <strong>这是一项成果</strong>
                            {b.reason ? `（${b.reason}）` : ""}
                            {" —— "}如果它是你准备交付的一件事，就在原地拆成任务包；如果还不知道采用哪条路径，再发散备选。
                          </>
                        ) : (
                          <>
                            <strong>{info.label}</strong>
                            {b.reason ? `（${b.reason}）` : ""} —— {info.hint}
                          </>
                        )}
                      </span>
                    </div>

                    {info.action === "breakdown" && b.type === "outcome" && (
                      <div className="flex w-full flex-col gap-1.5">
                        <BehaviorStepsEditor
                          behaviorTitle={b.text}
                          goal={goalContext}
                          steps={b.steps ?? []}
                          mode="task-package"
                          onChange={(steps) => {
                            if (steps.length > 0) onConvertToTaskPackage(b.id, steps);
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => handleWand(b)}
                          disabled={wandBusy !== null}
                          className="self-start flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary-light)] disabled:opacity-50"
                        >
                          <Wand2 className="w-3 h-3" />
                          {busy ? "发散中，10 秒左右…" : "不做任务包，发散行为备选"}
                        </button>
                      </div>
                    )}
                    {info.action === "breakdown" && b.type !== "outcome" && (
                      <button
                        type="button"
                        onClick={() => handleWand(b)}
                        disabled={wandBusy !== null}
                        className="self-start flex items-center gap-1 px-2 py-1 rounded-md border border-[#B45309] text-[11px] font-medium text-[#B45309] hover:bg-[#FEF3C7] transition-colors disabled:opacity-50"
                      >
                        <Wand2 className="w-3 h-3" />
                        {busy ? "发散中，10 秒左右…" : "发散成行为备选"}
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
              )}

            </div>
          );
        })}
      </div>

      <p className="text-[11px] leading-relaxed text-[var(--color-text-tertiary)]">
        右上角是当前最值得优先推进的项目。可重复行为一次只养 1-3 个；任务包则选少数排进日程，
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
              onClick={() => setConfirmBatchDelete(true)}
              className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--color-danger)] hover:opacity-75 transition-opacity"
            >
              <Trash2 className="w-3.5 h-3.5" />
              删除所选
            </button>
            <span className="h-3.5 w-px bg-[var(--color-border)]" />
            <button
              type="button"
              onClick={() => {
                setSelected(new Set());
                setScheduling(false);
                setBatchScheduleDates(new Set());
              }}
              className="text-[12px] text-[var(--color-text-tertiary)]"
            >
              取消选择
            </button>
          </div>

          {scheduling ? (
            /* 七天按钮，不用原生 date input——它在 iOS 上放固定定位条里选完常常不生效 */
            <div className="w-full flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className="flex-1 text-[11px] text-[var(--color-text-secondary)]">
                  {chosenRepeatables.length > 0 ? "可以连续选多天，再统一安排" : "一次性任务只能选择一天"}
                </span>
                {chosenRepeatables.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setBatchScheduleDates(
                        batchScheduleDates.size === upcomingScheduleDates.length
                          ? new Set()
                          : new Set(upcomingScheduleDates.map((item) => item.iso)),
                      )
                    }
                    className="text-[11px] font-semibold text-[#4F46E5]"
                  >
                    {batchScheduleDates.size === upcomingScheduleDates.length ? "清空" : "整周"}
                  </button>
                )}
              </div>
              <div className="w-full grid grid-cols-4 gap-1.5">
                {upcomingScheduleDates.map(({ date, iso, label }) => {
                  const pickedDate = batchScheduleDates.has(iso);
                  return (
                    <button
                      key={iso}
                      type="button"
                      onClick={() => toggleBatchScheduleDate(iso)}
                      className={[
                        "flex flex-col items-center rounded-lg border py-1.5 transition-colors",
                        pickedDate
                          ? "border-[#818CF8] bg-[#4F46E5] text-white"
                          : "border-[#C7D2FE] bg-[#EEF2FF] text-[#4F46E5] hover:bg-[#E0E7FF]",
                      ].join(" ")}
                    >
                      <span className="text-[11px] font-semibold leading-tight">
                        {pickedDate ? "已选" : label}
                      </span>
                      <span className="text-[10px] opacity-70 leading-tight">
                        {date.getMonth() + 1}/{date.getDate()}
                      </span>
                    </button>
                  );
                })}
              </div>
              {chosenRepeatables.length > 0 && chosenOneTimes.length > 0 && batchScheduleDates.size > 1 && (
                <span className="text-[9px] leading-relaxed text-[#B45309]">
                  可重复行为会铺到全部所选日期；{chosenOneTimes.length} 条一次性任务只排在最早的一天。
                </span>
              )}
              <div className="flex items-center gap-2">
                <span className="flex-1 text-[10px] text-[var(--color-text-tertiary)]">
                  已选 {batchScheduleDates.size} 天
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setScheduling(false);
                    setBatchScheduleDates(new Set());
                  }}
                  className="px-2 py-1.5 text-[11px] text-[var(--color-text-tertiary)]"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={batchScheduleDates.size === 0}
                  onClick={confirmBatchSchedule}
                  className="rounded-lg bg-[#4F46E5] px-3 py-1.5 text-[11px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  确认安排
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
              {chosenSchedulable.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setScheduling(true);
                    setBatchScheduleDates(new Set());
                  }}
                  className="flex-1 py-2 rounded-lg bg-[#4F46E5] text-white text-[13px] font-semibold"
                >
                  安排到日程（{chosenSchedulable.length}）
                </button>
              )}
              {chosenHabits.length === 0 && chosenSchedulable.length === 0 && (
                <span className="flex-1 text-[12px] text-[var(--color-text-tertiary)] py-2 text-center">
                  选中的都已经有去处了
                </span>
              )}
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmBatchDelete}
        title={`删除选中的 ${selected.size} 条行为？`}
        description={`会从焦点地图删除这批行为${
          chosenPendingTaskCount > 0
            ? `，并移除由它们排出的 ${chosenPendingTaskCount} 个未完成日程`
            : ""
        }。${
          chosenActiveHabitCount > 0
            ? `其中 ${chosenActiveHabitCount} 条已经进入习惯页，习惯和既往打卡会保留。`
            : ""
        }删错后可以点行为操作栏的「撤回」整批找回。`}
        confirmLabel="删除所选"
        onConfirm={() => {
          onDeleteMany(Array.from(selected));
          setSelected(new Set());
          setScheduling(false);
          setBatchScheduleDates(new Set());
          setConfirmBatchDelete(false);
        }}
        onCancel={() => setConfirmBatchDelete(false)}
      />

      <ConfirmDialog
        isOpen={confirmReset}
        title="重排？"
        description={`会清空这 ${cards.length} 条的两轴位置，一根滑块都不留。清错了可以点行为操作栏的「撤回」找回`}
        confirmLabel="清空重排"
        onConfirm={() => {
          onResetAxes();
          setConfirmReset(false);
          setOrder(cards.map((c) => c.id));
          setSort("score");
        }}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  );
}
