"use client";

import { Fragment, useRef, useState } from "react";
import type { Aspiration, BehaviorCard, GoalResult } from "@/components/todo/types";
import { isActionable, isGolden } from "@/components/todo/behavior";
import { UNASSIGNED_RESULT_ID } from "@/components/todo/goal";
import { callBehaviorAPI } from "@/components/todo/behaviorApi";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useGoalProgress } from "@/components/todo/goalLevelContext";
import {
  Archive,
  ArchiveRestore,
  Check,
  ChevronDown,
  ChevronRight,
  FolderTree,
  GripVertical,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

type SuggestedResult = {
  operation: "add" | "replace";
  replaceId?: string;
  title: string;
  evidence: string;
  reason: string;
  behaviorIds: string[];
  checked: boolean;
  duplicate: boolean;
};

type SuggestMode = "ideate" | "review" | "structure";
type DraftReview = {
  kind: "ready" | "rewrite";
  issue?: string;
  suggestionTitle?: string;
  suggestionEvidence?: string;
};
type DropPlacement = { targetId: string; edge: "before" | "after" };

type ResultKind = "goal" | "state";

type Props = {
  aspiration: Aspiration;
  results: GoalResult[];
  archivedResults: GoalResult[];
  cards: BehaviorCard[];
  allCards: BehaviorCard[];
  activeResultId: string | null;
  onSelect: (resultId: string | null) => void;
  onCreate: (title: string, evidence: string | undefined, kind: ResultKind) => string;
  onUpdate: (id: string, patch: { title?: string; evidence?: string; kind?: ResultKind }) => void;
  /** 目标（要达成，有终点）还是状态（要保持，下面挂习惯）。 */
  kindOf: (result: GoalResult) => ResultKind;
  onReorder: (orderedIds: string[]) => void;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
  onApplyStructure: (
    groups: Array<{ title: string; evidence?: string; behaviorIds: string[] }>,
  ) => string[];
};

function normalized(value: string) {
  return value.toLowerCase().replace(/[\s，。！？、,.!?;；:：'"“”‘’（）()_-]+/g, "");
}

function reorderResults(
  results: GoalResult[],
  sourceId: string,
  targetId: string,
  edge: "before" | "after",
): GoalResult[] {
  if (sourceId === targetId) return results;
  const sourceIndex = results.findIndex((result) => result.id === sourceId);
  if (sourceIndex < 0) return results;
  const next = [...results];
  const [source] = next.splice(sourceIndex, 1);
  const targetIndex = next.findIndex((result) => result.id === targetId);
  if (targetIndex < 0) return results;
  next.splice(targetIndex + (edge === "after" ? 1 : 0), 0, source);
  return next;
}

function parseSuggestions(
  raw: unknown,
  cards: BehaviorCard[],
  results: GoalResult[],
): SuggestedResult[] {
  if (!Array.isArray(raw)) return [];
  const knownIds = new Set(cards.map((card) => card.id));
  const knownResultIds = new Set(results.map((result) => result.id));
  const usedIds = new Set<string>();
  return raw
    .map((entry): SuggestedResult | null => {
      const result = entry as Record<string, unknown>;
      const title = String(result.title ?? "").trim().slice(0, 40);
      if (!title) return null;
      const evidence = String(result.evidence ?? "").trim().slice(0, 90);
      const reason = String(result.reason ?? "").trim().slice(0, 60);
      const requestedOperation = String(result.operation ?? "add");
      const replaceId = String(result.replaceId ?? "").trim();
      const operation = requestedOperation === "replace" ? "replace" : "add";
      const validReplacement = operation === "replace" && knownResultIds.has(replaceId);
      const duplicate = operation === "add" && results.some(
        (existing) => normalized(existing.title) === normalized(title),
      );
      const behaviorIds = Array.isArray(result.behaviorIds)
        ? result.behaviorIds
            .map((id) => String(id ?? "").trim())
            .filter((id) => knownIds.has(id) && !usedIds.has(id))
        : [];
      behaviorIds.forEach((id) => usedIds.add(id));
      return {
        operation,
        ...(validReplacement ? { replaceId } : {}),
        title,
        evidence,
        reason,
        behaviorIds,
        checked: !duplicate && (operation === "add" || validReplacement),
        duplicate,
      };
    })
    .filter((result): result is SuggestedResult => result !== null)
    .slice(0, 5);
}

export default function GoalResultsPanel({
  aspiration,
  results,
  archivedResults,
  cards,
  allCards,
  activeResultId,
  onSelect,
  onCreate,
  onUpdate,
  onReorder,
  onArchive,
  onRestore,
  onDelete,
  onApplyStructure,
  kindOf,
}: Props) {
  const goalProgressByIdentity = useGoalProgress();
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [title, setTitle] = useState("");
  const [evidence, setEvidence] = useState("");
  const [editKind, setEditKind] = useState<ResultKind>("goal");
  const [suggesting, setSuggesting] = useState(false);
  const [suggestMode, setSuggestMode] = useState<SuggestMode | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestedResult[] | null>(null);
  const [suggestionSummary, setSuggestionSummary] = useState<string | null>(null);
  const [suggestionNote, setSuggestionNote] = useState<string | null>(null);
  const [clarifying, setClarifying] = useState(false);
  const [draftReview, setDraftReview] = useState<DraftReview | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showOtherResults, setShowOtherResults] = useState(false);
  const [showArchivedResults, setShowArchivedResults] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropPlacement, setDropPlacement] = useState<DropPlacement | null>(null);
  const dragRef = useRef<{ sourceId: string; placement: DropPlacement | null } | null>(null);

  const resultIds = new Set(results.map((result) => result.id));
  const unassigned = cards.filter((card) => !card.resultId || !resultIds.has(card.resultId));
  const cardById = new Map(cards.map((card) => [card.id, card]));
  const goalList = results.filter((result) => kindOf(result) === "goal");
  const stateList = results.filter((result) => kindOf(result) === "state");
  const hiddenCount = Math.max(0, goalList.length - 3) + Math.max(0, stateList.length - 3);
  const sections: Array<{ kind: ResultKind; all: GoalResult[]; visible: GoalResult[] }> = [
    { kind: "goal", all: goalList, visible: showOtherResults ? goalList : goalList.slice(0, 3) },
    { kind: "state", all: stateList, visible: showOtherResults ? stateList : stateList.slice(0, 3) },
  ];

  function beginCreate(kind: ResultKind) {
    setEditKind(kind);
    setEditingId("new");
    setTitle("");
    setEvidence("");
    setDraftReview(null);
  }

  function beginEdit(result: GoalResult) {
    setEditKind(kindOf(result));
    setEditingId(result.id);
    setTitle(result.title);
    setEvidence(result.evidence ?? "");
    setDraftReview(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setTitle("");
    setEvidence("");
    setDraftReview(null);
  }

  function saveResult() {
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    if (editingId === "new") {
      const id = onCreate(cleanTitle, evidence, editKind);
      if ((editKind === "goal" ? goalList : stateList).length >= 3) setShowOtherResults(true);
      onSelect(id);
    } else if (editingId) {
      onUpdate(editingId, { title: cleanTitle, evidence, kind: editKind });
      onSelect(editingId);
    }
    cancelEdit();
  }

  function commitOrder(next: GoalResult[]) {
    if (next.every((result, index) => result.id === results[index]?.id)) return;
    onReorder(next.map((result) => result.id));
  }

  function beginDrag(event: React.PointerEvent<HTMLButtonElement>, sourceId: string) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const placement = { targetId: sourceId, edge: "before" as const };
    dragRef.current = { sourceId, placement };
    setDraggingId(sourceId);
    setDropPlacement(placement);
  }

  function moveDrag(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    event.preventDefault();
    const hit = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-goal-result-id]");
    const targetId = hit?.dataset.goalResultId;
    if (!hit || !targetId) return;
    const rect = hit.getBoundingClientRect();
    const placement: DropPlacement = {
      targetId,
      edge: event.clientY < rect.top + rect.height / 2 ? "before" : "after",
    };
    if (
      drag.placement?.targetId === placement.targetId &&
      drag.placement.edge === placement.edge
    ) return;
    drag.placement = placement;
    setDropPlacement(placement);
  }

  function endDrag(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* pointer capture may already be gone */
    }
    if (drag?.placement) {
      commitOrder(
        reorderResults(results, drag.sourceId, drag.placement.targetId, drag.placement.edge),
      );
    }
    dragRef.current = null;
    setDraggingId(null);
    setDropPlacement(null);
  }

  function cancelDrag() {
    dragRef.current = null;
    setDraggingId(null);
    setDropPlacement(null);
  }

  async function requestSuggestions(mode: SuggestMode) {
    if (suggesting || (mode === "structure" && cards.length === 0)) return;
    setSuggesting(true);
    setSuggestMode(mode);
    setSuggestions(null);
    setSuggestionSummary(null);
    setSuggestionNote(null);
    const response = await callBehaviorAPI(
      mode === "structure"
        ? {
            mode: "structure-results",
            goal: aspiration.title,
            items: cards.map((card) => ({ id: card.id, text: card.text })),
          }
        : {
            mode: mode === "ideate" ? "suggest-results" : "review-results",
            goal: aspiration.title,
            results: results.map((result) => ({
              id: result.id,
              title: result.title,
              evidence: result.evidence,
            })),
          },
    );
    setSuggesting(false);
    if (!response.ok) {
      setSuggestionNote(
        response.noKey
          ? "还没有配置 AI，可以先手动添加目标"
          : "AI 暂时没响应，已有内容没有变化",
      );
      return;
    }
    const summary = String(response.data.summary ?? "").trim();
    const parsed = parseSuggestions(response.data.results, cards, results);
    if (parsed.length === 0) {
      setSuggestionNote(
        summary || (mode === "review"
          ? "暂时没有发现必须调整的目标"
          : "这次没有生成可靠建议，可以重试或手动添加"),
      );
      return;
    }
    setSuggestionSummary(summary || null);
    setSuggestions(parsed);
  }

  function updateSuggestion(index: number, patch: Partial<SuggestedResult>) {
    setSuggestions((current) =>
      current?.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ) ?? null,
    );
  }

  function closeSuggestions() {
    setSuggestions(null);
    setSuggestionSummary(null);
  }

  function suggestionReady(suggestion: SuggestedResult) {
    return Boolean(
      suggestion.checked &&
      suggestion.title.trim() &&
      (suggestion.operation === "add" || suggestion.replaceId),
    );
  }

  async function clarifyDraft() {
    if (clarifying || !title.trim()) return;
    setClarifying(true);
    setDraftReview(null);
    const response = await callBehaviorAPI({
      mode: "clarify-result",
      goal: aspiration.title,
      title: title.trim(),
      evidence: evidence.trim(),
    });
    setClarifying(false);
    if (!response.ok) {
      setDraftReview({
        kind: "rewrite",
        issue: response.noKey ? "还没有配置 AI" : "AI 暂时没响应",
      });
      return;
    }
    setDraftReview({
      kind: response.data.kind === "ready" ? "ready" : "rewrite",
      issue: String(response.data.issue ?? "").trim() || undefined,
      suggestionTitle: String(response.data.suggestionTitle ?? "").trim() || undefined,
      suggestionEvidence: String(response.data.suggestionEvidence ?? "").trim() || undefined,
    });
  }

  function applySuggestions() {
    if (!suggestions) return;
    const chosen = suggestions.filter(
      (suggestion) =>
        suggestion.checked &&
        suggestion.title.trim() &&
        (suggestion.operation === "add" || suggestion.replaceId),
    );
    const additions = chosen
      .filter((suggestion) => suggestion.operation === "add")
      .map((suggestion) => ({
        title: suggestion.title.trim(),
        evidence: suggestion.evidence.trim() || undefined,
        behaviorIds: suggestion.behaviorIds,
      }));
    if (chosen.length === 0) return;
    const replacements = chosen.filter(
      (suggestion): suggestion is SuggestedResult & { replaceId: string } =>
        suggestion.operation === "replace" && Boolean(suggestion.replaceId),
    );
    replacements.forEach((suggestion) =>
      onUpdate(suggestion.replaceId, {
        title: suggestion.title.trim(),
        evidence: suggestion.evidence.trim(),
      }),
    );
    const ids = additions.length > 0 ? onApplyStructure(additions) : [];
    if (replacements[0]?.replaceId) onSelect(replacements[0].replaceId);
    else if (ids[0]) onSelect(ids[0]);
    setSuggestions(null);
    setSuggestionSummary(null);
    setSuggestionNote(
      `已${additions.length > 0 ? `新增 ${additions.length} 条` : ""}${
        additions.length > 0 && replacements.length > 0 ? "、" : ""
      }${replacements.length > 0 ? `替换 ${replacements.length} 条` : ""}`,
    );
  }

  return (
    <div className="flex w-full flex-col gap-2.5 rounded-[12px] border border-[#D9E5FF] bg-[#F8FAFF] p-3">
      <div className="flex items-start gap-2">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary-light)] text-[var(--color-primary)]">
          <FolderTree className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-semibold text-[var(--color-text-primary)]">
              目标与状态
            </span>
          </div>
          <p className="mt-0.5 text-[10px] leading-relaxed text-[var(--color-text-tertiary)]">
            目标要达成：有终点，是一张清单。状态要保持：没有终点，下面挂习惯。
          </p>
        </div>
        <button
          type="button"
          onClick={() => requestSuggestions(results.length === 0 ? "ideate" : "review")}
          disabled={suggesting}
          className="flex flex-shrink-0 items-center gap-1 rounded-lg border border-[var(--color-primary)] bg-white px-2 py-1.5 text-[11px] font-medium text-[var(--color-primary)] disabled:opacity-50"
        >
          <Sparkles className={`h-3.5 w-3.5 ${suggesting && suggestMode !== "structure" ? "animate-pulse" : ""}`} />
          {suggesting && suggestMode !== "structure"
            ? results.length === 0 ? "思考中" : "检查中"
            : results.length === 0 ? "AI 一起想" : "AI 检查"}
        </button>
      </div>
      <div className="-mt-1 flex justify-end gap-1.5">
        <button
          type="button"
          onClick={() => beginCreate("goal")}
          className="flex min-h-8 items-center gap-0.5 rounded-lg bg-[var(--color-primary)] px-2.5 text-[11px] font-medium text-white"
        >
          <Plus className="h-3.5 w-3.5" />
          目标
        </button>
        <button
          type="button"
          onClick={() => beginCreate("state")}
          className="flex min-h-8 items-center gap-0.5 rounded-lg border border-[#A7F3D0] bg-white px-2.5 text-[11px] font-medium text-[#047857]"
        >
          <Plus className="h-3.5 w-3.5" />
          状态
        </button>
      </div>

      {results.length === 0 && !suggestions && (
        <div className="rounded-[10px] border border-dashed border-[#BFD2FA] bg-white px-3 py-2.5">
          <p className="text-[12px] font-medium text-[var(--color-text-secondary)]">
            当前是直接推进模式
          </p>
          <p className="mt-0.5 text-[10px] leading-relaxed text-[var(--color-text-tertiary)]">
            {cards.length > 0
              ? `${cards.length} 条推进项暂时共用一张焦点地图。可以按"要达成哪几件有终点的事"分成目标，也可以把已有内容反向整理。`
              : "想推进一件有终点的事（比如准备面试），就加一个目标，它会变成一张有顺序的清单。"}
          </p>
          {cards.length > 0 && (
            <button
              type="button"
              onClick={() => requestSuggestions("structure")}
              disabled={suggesting}
              className="mt-2 flex items-center gap-1 text-[10px] font-medium text-[var(--color-primary)] disabled:opacity-50"
            >
              <FolderTree className="h-3 w-3" />
              {suggesting && suggestMode === "structure" ? "整理中…" : "按现有推进项整理"}
            </button>
          )}
        </div>
      )}

      {suggestionNote && !(suggestMode === "review" && results.length === 0) && (
        <p className="rounded-lg bg-white px-2.5 py-2 text-[11px] text-[var(--color-text-secondary)]">
          {suggestionNote}
        </p>
      )}

      {suggestions && (
        <div className="flex flex-col gap-2 rounded-[10px] border border-[var(--color-primary)] bg-white p-2.5">
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <p className="text-[12px] font-semibold text-[var(--color-text-primary)]">
                AI 提议了 {suggestions.length} 条结果变更
              </p>
              <p className="text-[10px] text-[var(--color-text-tertiary)]">
                {suggestionSummary || "检查标题、完成标准和变更方式，确认后才会修改"}
              </p>
            </div>
            <button type="button" onClick={closeSuggestions} aria-label="关闭建议">
              <X className="h-4 w-4 text-[var(--color-text-tertiary)]" />
            </button>
          </div>
          {suggestions.map((suggestion, index) => (
            <div
              key={index}
              className={`flex flex-col gap-1.5 rounded-lg border p-2 ${
                suggestion.checked
                  ? "border-[#BFDBFE] bg-[#F8FAFF]"
                  : "border-[var(--color-border)] bg-[var(--color-bg-gray-lighter)] opacity-60"
              }`}
            >
              <div className="flex items-start gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setSuggestions((current) =>
                      current?.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, checked: !item.checked } : item,
                      ) ?? null,
                    )
                  }
                  className={`mt-1 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${
                    suggestion.checked
                      ? "border-[var(--color-primary)] bg-[var(--color-primary)]"
                      : "border-[var(--color-border)] bg-white"
                  }`}
                  aria-label={suggestion.checked ? "不采用这条结果" : "采用这条结果"}
                >
                  {suggestion.checked && <Check className="h-3 w-3 text-white" />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-1.5">
                    <select
                      value={suggestion.operation}
                      onChange={(event) => {
                        const operation = event.target.value as SuggestedResult["operation"];
                        updateSuggestion(index, {
                          operation,
                          replaceId: operation === "replace" ? suggestion.replaceId : undefined,
                          checked: operation === "add" ? !suggestion.duplicate : Boolean(suggestion.replaceId),
                        });
                      }}
                      className="rounded-md bg-[var(--color-primary-light)] px-1.5 py-1 text-[9px] font-semibold text-[var(--color-primary)] outline-none"
                      aria-label={`第 ${index + 1} 条结果的变更方式`}
                    >
                      <option value="add">新增</option>
                      <option value="replace">替换</option>
                    </select>
                    {suggestion.operation === "replace" && (
                      <select
                        value={suggestion.replaceId ?? ""}
                        onChange={(event) =>
                          updateSuggestion(index, {
                            replaceId: event.target.value || undefined,
                            checked: Boolean(event.target.value),
                          })
                        }
                        className="min-w-0 max-w-full flex-1 rounded-md bg-[#FFF7ED] px-1.5 py-1 text-[9px] font-medium text-[#C2410C] outline-none"
                        aria-label={`第 ${index + 1} 条建议要替换的目标`}
                      >
                        <option value="">选择要替换的目标…</option>
                        {results.map((result) => (
                          <option key={result.id} value={result.id}>{result.title}</option>
                        ))}
                      </select>
                    )}
                  </div>
                  <input
                    value={suggestion.title}
                    onChange={(event) => updateSuggestion(index, { title: event.target.value })}
                    className="w-full bg-transparent text-[12px] font-semibold text-[var(--color-text-primary)] outline-none"
                    aria-label={`第 ${index + 1} 条结果标题`}
                  />
                  <input
                    value={suggestion.evidence}
                    onChange={(event) => updateSuggestion(index, { evidence: event.target.value })}
                    placeholder="完成标准：做到什么样算完成"
                    className="mt-0.5 w-full bg-transparent text-[10px] text-[var(--color-text-secondary)] outline-none placeholder:text-[var(--color-text-tertiary)]"
                    aria-label={`第 ${index + 1} 条结果的完成标准`}
                  />
                </div>
                {suggestion.behaviorIds.length > 0 && (
                  <span className="flex-shrink-0 text-[10px] text-[var(--color-text-tertiary)]">
                    {suggestion.behaviorIds.length} 条推进项
                  </span>
                )}
              </div>
              {suggestion.reason && (
                <p className="pl-6 text-[9px] leading-relaxed text-[var(--color-primary)]">
                  {suggestion.reason}
                </p>
              )}
              {suggestion.duplicate && (
                <p className="pl-6 text-[9px] leading-relaxed text-[#C2410C]">
                  已有同名目标，默认不选
                </p>
              )}
              {suggestion.operation === "replace" && !suggestion.replaceId && (
                <p className="pl-6 text-[9px] leading-relaxed text-[#C2410C]">
                  请选择要替换的原目标
                </p>
              )}
              {suggestion.behaviorIds.length > 0 && (
                <p
                  className="line-clamp-2 pl-6 text-[9px] leading-relaxed text-[var(--color-text-tertiary)]"
                  data-full-text={suggestion.behaviorIds
                    .map((id) => cardById.get(id)?.text)
                    .filter(Boolean)
                    .join("、")}
                >
                  {suggestion.behaviorIds
                    .map((id) => cardById.get(id)?.text)
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
            </div>
          ))}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={closeSuggestions}
              className="px-3 py-1.5 text-[11px] text-[var(--color-text-secondary)]"
            >
              取消
            </button>
            <button
              type="button"
              onClick={applySuggestions}
              disabled={!suggestions.some(suggestionReady)}
              className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40"
            >
              应用 {suggestions.filter(suggestionReady).length} 条
            </button>
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between px-0.5">
            <span className="text-[10px] font-semibold text-[var(--color-text-secondary)]">
              各显示前 3 个
            </span>
            {hiddenCount > 0 && !showOtherResults && (
              <span className="text-[9px] text-[var(--color-text-tertiary)]">
                其余 {hiddenCount} 个已收起
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => onSelect(null)}
            className={`flex items-center gap-2 rounded-[10px] border p-2 text-left transition-colors ${
              activeResultId === null
                ? "border-[var(--color-primary)] bg-white shadow-sm"
                : "border-[var(--color-border)] bg-white/70"
            }`}
          >
            <span
              className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-[9px] font-bold ${
                activeResultId === null
                  ? "bg-[var(--color-primary)] text-white"
                  : "bg-[var(--color-primary-light)] text-[var(--color-primary)]"
              }`}
            >
              全部
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] font-semibold text-[var(--color-text-primary)]">
                身份全局
              </span>
              <span className="block text-[9px] text-[var(--color-text-tertiary)]">
                查看全部 {cards.length} 条推进项
              </span>
            </span>
            <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-[var(--color-text-tertiary)]" />
          </button>
          {sections.map((section) => section.all.length > 0 && (
          <Fragment key={section.kind}>
          <p className={`mt-1 px-0.5 text-[10px] font-semibold ${section.kind === "goal" ? "text-[var(--color-primary)]" : "text-[#047857]"}`}>
            {section.kind === "goal" ? `目标 ${section.all.length} · 要达成` : `状态 ${section.all.length} · 要保持`}
          </p>
          {section.visible.map((result, index) => {
            const isState = section.kind === "state";
            const mine = cards.filter((card) => card.resultId === result.id);
            const golden = mine.filter((card) => isActionable(card.type) && isGolden(card)).length;
            const active = activeResultId === result.id;
            const isDragging = draggingId === result.id;
            const isTarget = dropPlacement?.targetId === result.id && draggingId !== null;
            return (
              <div
                key={result.id}
                data-goal-result-id={result.id}
                className={[
                  "relative flex items-center gap-1.5 rounded-[10px] border p-2 transition-[opacity,box-shadow,border-color,background-color]",
                  active
                    ? "border-[var(--color-primary)] bg-white shadow-sm"
                    : "border-[var(--color-border)] bg-white/70",
                  isDragging ? "opacity-45" : "",
                  isTarget ? "shadow-[0_3px_10px_rgba(37,99,235,0.14)]" : "",
                ].join(" ")}
              >
                {isTarget && dropPlacement?.edge === "before" && (
                  <span className="pointer-events-none absolute -top-[2px] left-2 right-2 h-[2px] rounded-full bg-[var(--color-primary)]" />
                )}
                {isTarget && dropPlacement?.edge === "after" && (
                  <span className="pointer-events-none absolute -bottom-[2px] left-2 right-2 h-[2px] rounded-full bg-[var(--color-primary)]" />
                )}
                <button
                  type="button"
                  onClick={() => onSelect(result.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span
                    className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-[10px] font-bold ${
                      isState
                        ? active ? "bg-[#059669] text-white" : "bg-[#ECFDF5] text-[#047857]"
                        : active ? "bg-[var(--color-primary)] text-white" : "bg-[var(--color-primary-light)] text-[var(--color-primary)]"
                    }`}
                  >
                    {index + 1}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span
                      className="truncate text-[12px] font-semibold text-[var(--color-text-primary)]"
                      data-full-text={result.title}
                    >
                      {result.title}
                    </span>
                    <span
                      className="truncate text-[9px] text-[var(--color-text-tertiary)]"
                      data-full-text={result.evidence || (isState ? "要保持的状态" : "还没写完成标准")}
                    >
                      {result.evidence || (isState ? "要保持的状态" : "还没写完成标准")}
                    </span>
                  </span>
                  <span className="flex-shrink-0 text-[9px] text-[var(--color-text-tertiary)]">
                    {(() => {
                      // 状态看下面挂了几条行为；目标看清单进度，结项了就标已结项。
                      if (isState) return `${mine.length} 条行为`;
                      if (result.status === "done") return "已结项";
                      const summary = (goalProgressByIdentity[aspiration.id] ?? []).find((goal) => goal.resultId === result.id);
                      return summary && summary.total > 0 ? `${summary.done}/${summary.total}` : `${mine.length} 推进项${golden > 0 ? ` · ${golden} 优先` : ""}`;
                    })()}
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-[var(--color-text-tertiary)]" />
                </button>
                {section.all.length > 1 && (
                  <button
                    type="button"
                    onPointerDown={(event) => beginDrag(event, result.id)}
                    onPointerMove={moveDrag}
                    onPointerUp={endDrag}
                    onPointerCancel={cancelDrag}
                    onKeyDown={(event) => {
                      if (event.key === "ArrowUp" && index > 0) {
                        event.preventDefault();
                        commitOrder(reorderResults(results, result.id, section.all[index - 1].id, "before"));
                      }
                      if (event.key === "ArrowDown" && index < section.all.length - 1) {
                        event.preventDefault();
                        commitOrder(reorderResults(results, result.id, section.all[index + 1].id, "after"));
                      }
                    }}
                    className="flex h-6 w-6 flex-shrink-0 touch-none select-none items-center justify-center rounded-md cursor-grab hover:bg-white active:cursor-grabbing"
                    aria-label={`拖动调整「${result.title}」优先级`}
                    title="拖动调整优先级"
                    data-no-tab-swipe
                  >
                    <GripVertical className="h-3.5 w-3.5 text-[var(--color-text-tertiary)]" />
                  </button>
                )}
                <button type="button" onClick={() => beginEdit(result)} aria-label={`编辑${result.title}`}>
                  <Pencil className="h-3.5 w-3.5 text-[var(--color-text-tertiary)]" />
                </button>
                <button
                  type="button"
                  onClick={() => onArchive(result.id)}
                  aria-label={`归档${result.title}`}
                  title="暂时不推进，归档后仍保留下面的行为"
                >
                  <Archive className="h-3.5 w-3.5 text-[var(--color-text-tertiary)]" />
                </button>
              </div>
            );
          })}
          </Fragment>
          ))}

          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setShowOtherResults((current) => !current)}
              className="flex items-center justify-center gap-1 rounded-lg border border-dashed border-[var(--color-border)] bg-white/60 px-2 py-1.5 text-[10px] font-medium text-[var(--color-text-secondary)]"
            >
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${showOtherResults ? "rotate-180" : ""}`}
              />
              {showOtherResults ? "收起" : `展开其他 ${hiddenCount} 个`}
            </button>
          )}

          {unassigned.length > 0 && (
            <button
              type="button"
              onClick={() => onSelect(UNASSIGNED_RESULT_ID)}
              className={`flex items-center gap-2 rounded-[10px] border border-dashed p-2 text-left ${
                activeResultId === UNASSIGNED_RESULT_ID
                  ? "border-[#EA580C] bg-[#FFF7ED]"
                  : "border-[#FDBA74] bg-white"
              }`}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#FFF7ED] text-[11px] font-bold text-[#EA580C]">
                ?
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-semibold text-[var(--color-text-primary)]">
                  未归属推进项
                </span>
                <span className="block text-[9px] text-[var(--color-text-tertiary)]">
                  还有 {unassigned.length} 条需要决定服务于哪个结果
                </span>
              </span>
              <ChevronRight className="h-3.5 w-3.5 text-[var(--color-text-tertiary)]" />
            </button>
          )}
        </div>
      )}

      {archivedResults.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-[#D9E5FF] pt-2">
          <button
            type="button"
            onClick={() => setShowArchivedResults((current) => !current)}
            className="flex items-center gap-1.5 text-left text-[10px] font-medium text-[var(--color-text-secondary)]"
          >
            <Archive className="h-3.5 w-3.5" />
            已归档 {archivedResults.length}
            <ChevronDown
              className={`ml-auto h-3.5 w-3.5 transition-transform ${showArchivedResults ? "rotate-180" : ""}`}
            />
          </button>
          {showArchivedResults && (
            <div className="flex flex-col gap-1">
              {archivedResults.map((result) => {
                const linkedCount = allCards.filter((card) => card.resultId === result.id).length;
                return (
                  <div
                    key={result.id}
                    className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-white/60 px-2 py-1.5"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11px] font-medium text-[var(--color-text-secondary)]" data-full-text={result.title}>
                        {result.title}
                      </span>
                      <span className="block text-[9px] text-[var(--color-text-tertiary)]">
                        保留 {linkedCount} 条推进项
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => onRestore(result.id)}
                      className="flex items-center gap-1 rounded-md border border-[#BFDBFE] bg-white px-1.5 py-1 text-[9px] font-medium text-[var(--color-primary)]"
                    >
                      <ArchiveRestore className="h-3 w-3" />
                      恢复
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteId(result.id)}
                      aria-label={`永久删除${result.title}`}
                      title="永久删除结果，下面的推进项会回到未归属"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-[var(--color-text-tertiary)]" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {editingId && (
        <div className="flex flex-col gap-2 rounded-[10px] border border-[var(--color-primary)] bg-white p-2.5">
          <div className="flex gap-1.5" role="radiogroup" aria-label="这是目标还是状态">
            {([["goal", "目标 · 要达成", "有终点，一张清单"], ["state", "状态 · 要保持", "没有终点，下面挂习惯"]] as const).map(([kind, label, hint]) => (
              <button key={kind} type="button" role="radio" aria-checked={editKind === kind} onClick={() => setEditKind(kind)}
                className={`flex min-h-10 flex-1 flex-col items-start justify-center rounded-lg border px-2.5 py-1 text-left ${
                  editKind === kind ? "border-[var(--color-primary)] bg-[var(--color-primary-light)]" : "border-[var(--color-border)] bg-white"
                }`}>
                <span className="text-[11px] font-semibold text-[var(--color-text-primary)]">{label}</span>
                <span className="text-[9px] text-[var(--color-text-tertiary)]">{hint}</span>
              </button>
            ))}
          </div>
          <input
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              setDraftReview(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) saveResult();
            }}
            placeholder={editKind === "goal" ? "想完成的一件事，例如：准备面试" : "要保持的状态，例如：早睡早起"}
            autoFocus
            className="w-full rounded-lg border border-[var(--color-border)] px-2.5 py-2 text-[12px] outline-none focus:border-[var(--color-primary)]"
          />
          <input
            value={evidence}
            onChange={(event) => {
              setEvidence(event.target.value);
              setDraftReview(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) saveResult();
            }}
            placeholder={editKind === "goal" ? "完成标准（可选）：做到什么样算完成？" : "怎样算保持住（可选）：例如每周至少 5 天 12 点前睡"}
            className="w-full rounded-lg border border-[var(--color-border)] px-2.5 py-2 text-[12px] outline-none focus:border-[var(--color-primary)]"
          />
          {draftReview && (
            <div
              className={`rounded-lg px-2.5 py-2 text-[10px] leading-relaxed ${
                draftReview.kind === "ready"
                  ? "bg-[#F0FDF4] text-[#15803D]"
                  : "bg-[#FFF7ED] text-[#C2410C]"
              }`}
            >
              <p className="font-medium">
                {draftReview.issue || (draftReview.kind === "ready" ? "这是一条可观察的结果" : "建议再说清楚")}
              </p>
              {draftReview.kind === "rewrite" && draftReview.suggestionTitle && (
                <div className="mt-1.5 flex items-start gap-2 rounded-md bg-white/80 p-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[var(--color-text-primary)]">
                      {draftReview.suggestionTitle}
                    </p>
                    {draftReview.suggestionEvidence && (
                      <p className="mt-0.5 text-[var(--color-text-secondary)]">
                        {draftReview.suggestionEvidence}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setTitle(draftReview.suggestionTitle ?? title);
                      setEvidence(draftReview.suggestionEvidence ?? evidence);
                      setDraftReview(null);
                    }}
                    className="flex-shrink-0 rounded-md border border-[#FDBA74] bg-white px-2 py-1 font-medium text-[#C2410C]"
                  >
                    采用改写
                  </button>
                </div>
              )}
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={clarifyDraft}
              disabled={!title.trim() || clarifying}
              className="flex items-center gap-1 rounded-md border border-[#BFDBFE] bg-[var(--color-primary-light)] px-2 py-1.5 text-[10px] font-medium text-[var(--color-primary)] disabled:opacity-40"
            >
              <Sparkles className={`h-3 w-3 ${clarifying ? "animate-pulse" : ""}`} />
              {clarifying ? "检查中…" : "帮我说清楚"}
            </button>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={cancelEdit}
                className="px-3 py-1.5 text-[11px] text-[var(--color-text-secondary)]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={saveResult}
                disabled={!title.trim()}
                className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40"
              >
                {editingId === "new" ? "添加" : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={deleteId !== null}
        title="删除这个目标？"
        description="下面的推进项不会删除，只会回到“未归属推进项”，之后可以重新分组。"
        confirmLabel="删除结果"
        onConfirm={() => {
          if (deleteId) onDelete(deleteId);
          setDeleteId(null);
        }}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
