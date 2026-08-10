"use client";

import { useState } from "react";
import type { Aspiration, BehaviorCard, GoalResult } from "@/components/todo/types";
import { isGolden } from "@/components/todo/behavior";
import { callBehaviorAPI } from "@/components/todo/behaviorApi";
import ConfirmDialog from "@/components/ConfirmDialog";
import {
  Check,
  ChevronRight,
  FolderTree,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

export const UNASSIGNED_RESULT_ID = "__unassigned__";

type SuggestedResult = {
  title: string;
  evidence: string;
  behaviorIds: string[];
  checked: boolean;
};

type Props = {
  aspiration: Aspiration;
  results: GoalResult[];
  cards: BehaviorCard[];
  activeResultId: string | null;
  onSelect: (resultId: string) => void;
  onCreate: (title: string, evidence?: string) => string;
  onUpdate: (id: string, patch: { title?: string; evidence?: string }) => void;
  onDelete: (id: string) => void;
  onApplyStructure: (
    groups: Array<{ title: string; evidence?: string; behaviorIds: string[] }>,
  ) => string[];
};

function parseSuggestions(raw: unknown, cards: BehaviorCard[]): SuggestedResult[] {
  if (!Array.isArray(raw)) return [];
  const knownIds = new Set(cards.map((card) => card.id));
  const usedIds = new Set<string>();
  return raw
    .map((entry): SuggestedResult | null => {
      const result = entry as Record<string, unknown>;
      const title = String(result.title ?? "").trim().slice(0, 40);
      if (!title) return null;
      const evidence = String(result.evidence ?? "").trim().slice(0, 90);
      const behaviorIds = Array.isArray(result.behaviorIds)
        ? result.behaviorIds
            .map((id) => String(id ?? "").trim())
            .filter((id) => knownIds.has(id) && !usedIds.has(id))
        : [];
      behaviorIds.forEach((id) => usedIds.add(id));
      return { title, evidence, behaviorIds, checked: true };
    })
    .filter((result): result is SuggestedResult => result !== null)
    .slice(0, 5);
}

export default function GoalResultsPanel({
  aspiration,
  results,
  cards,
  activeResultId,
  onSelect,
  onCreate,
  onUpdate,
  onDelete,
  onApplyStructure,
}: Props) {
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [title, setTitle] = useState("");
  const [evidence, setEvidence] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestedResult[] | null>(null);
  const [suggestionNote, setSuggestionNote] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const resultIds = new Set(results.map((result) => result.id));
  const unassigned = cards.filter((card) => !card.resultId || !resultIds.has(card.resultId));
  const cardById = new Map(cards.map((card) => [card.id, card]));

  function beginCreate() {
    setEditingId("new");
    setTitle("");
    setEvidence("");
  }

  function beginEdit(result: GoalResult) {
    setEditingId(result.id);
    setTitle(result.title);
    setEvidence(result.evidence ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
    setTitle("");
    setEvidence("");
  }

  function saveResult() {
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    if (editingId === "new") {
      const id = onCreate(cleanTitle, evidence);
      onSelect(id);
    } else if (editingId) {
      onUpdate(editingId, { title: cleanTitle, evidence });
      onSelect(editingId);
    }
    cancelEdit();
  }

  async function suggestStructure() {
    if (suggesting || cards.length === 0) return;
    setSuggesting(true);
    setSuggestions(null);
    setSuggestionNote(null);
    const response = await callBehaviorAPI({
      mode: "structure-results",
      goal: aspiration.title,
      items: cards.map((card) => ({ id: card.id, text: card.text })),
    });
    setSuggesting(false);
    if (!response.ok) {
      setSuggestionNote(
        response.noKey
          ? "还没有配置 AI，可以先手动建结果，再给行为选择归属"
          : "AI 暂时没响应，原有行为没有变化",
      );
      return;
    }
    const parsed = parseSuggestions(response.data.results, cards);
    if (parsed.length === 0) {
      setSuggestionNote("这次没有整理出可靠结构，可以重试或手动添加");
      return;
    }
    setSuggestions(parsed);
  }

  function applySuggestions() {
    if (!suggestions) return;
    const chosen = suggestions
      .filter((suggestion) => suggestion.checked && suggestion.title.trim())
      .map((suggestion) => ({
        title: suggestion.title.trim(),
        evidence: suggestion.evidence.trim() || undefined,
        behaviorIds: suggestion.behaviorIds,
      }));
    if (chosen.length === 0) return;
    const ids = onApplyStructure(chosen);
    if (ids[0]) onSelect(ids[0]);
    setSuggestions(null);
    setSuggestionNote(null);
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
              关键结果 {results.length > 0 ? results.length : ""}
            </span>
            <span className="rounded-full bg-white px-1.5 py-0.5 text-[9px] text-[var(--color-text-tertiary)]">
              可选层
            </span>
          </div>
          <p className="mt-0.5 text-[10px] leading-relaxed text-[var(--color-text-tertiary)]">
            先说明什么变化算推进，再在每条结果下面比较行为
          </p>
        </div>
        {results.length === 0 && cards.length > 0 && (
          <button
            type="button"
            onClick={suggestStructure}
            disabled={suggesting}
            className="flex flex-shrink-0 items-center gap-1 rounded-lg border border-[var(--color-primary)] bg-white px-2 py-1.5 text-[11px] font-medium text-[var(--color-primary)] disabled:opacity-50"
          >
            <Sparkles className={`h-3.5 w-3.5 ${suggesting ? "animate-pulse" : ""}`} />
            {suggesting ? "梳理中" : "AI 梳理"}
          </button>
        )}
        <button
          type="button"
          onClick={beginCreate}
          className="flex flex-shrink-0 items-center gap-0.5 rounded-lg bg-[var(--color-primary)] px-2 py-1.5 text-[11px] font-medium text-white"
        >
          <Plus className="h-3.5 w-3.5" />
          添加
        </button>
      </div>

      {results.length === 0 && !suggestions && (
        <div className="rounded-[10px] border border-dashed border-[#BFD2FA] bg-white px-3 py-2.5">
          <p className="text-[12px] font-medium text-[var(--color-text-secondary)]">
            当前是直接拆行为模式
          </p>
          <p className="mt-0.5 text-[10px] leading-relaxed text-[var(--color-text-tertiary)]">
            {cards.length > 0
              ? `${cards.length} 条行为共用一张焦点地图。目标复杂时，可以让 AI 先按结果分组。`
              : "简单目标可以保持这样；目标变复杂时再增加结果层。"}
          </p>
        </div>
      )}

      {suggestionNote && (
        <p className="rounded-lg bg-white px-2.5 py-2 text-[11px] text-[var(--color-text-secondary)]">
          {suggestionNote}
        </p>
      )}

      {suggestions && (
        <div className="flex flex-col gap-2 rounded-[10px] border border-[var(--color-primary)] bg-white p-2.5">
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <p className="text-[12px] font-semibold text-[var(--color-text-primary)]">
                AI 提议了 {suggestions.length} 条结果路径
              </p>
              <p className="text-[10px] text-[var(--color-text-tertiary)]">
                先检查标题、达成证据和行为归属，确认后才会修改
              </p>
            </div>
            <button type="button" onClick={() => setSuggestions(null)} aria-label="关闭建议">
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
                  <input
                    value={suggestion.title}
                    onChange={(event) =>
                      setSuggestions((current) =>
                        current?.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, title: event.target.value } : item,
                        ) ?? null,
                      )
                    }
                    className="w-full bg-transparent text-[12px] font-semibold text-[var(--color-text-primary)] outline-none"
                    aria-label={`第 ${index + 1} 条结果标题`}
                  />
                  <input
                    value={suggestion.evidence}
                    onChange={(event) =>
                      setSuggestions((current) =>
                        current?.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, evidence: event.target.value } : item,
                        ) ?? null,
                      )
                    }
                    placeholder="怎样算有进展或达成"
                    className="mt-0.5 w-full bg-transparent text-[10px] text-[var(--color-text-secondary)] outline-none placeholder:text-[var(--color-text-tertiary)]"
                    aria-label={`第 ${index + 1} 条结果的达成证据`}
                  />
                </div>
                <span className="flex-shrink-0 text-[10px] text-[var(--color-text-tertiary)]">
                  {suggestion.behaviorIds.length} 条行为
                </span>
              </div>
              {suggestion.behaviorIds.length > 0 && (
                <p className="pl-6 text-[9px] leading-relaxed text-[var(--color-text-tertiary)] line-clamp-2">
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
              onClick={() => setSuggestions(null)}
              className="px-3 py-1.5 text-[11px] text-[var(--color-text-secondary)]"
            >
              取消
            </button>
            <button
              type="button"
              onClick={applySuggestions}
              disabled={!suggestions.some((suggestion) => suggestion.checked && suggestion.title.trim())}
              className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40"
            >
              确认采用
            </button>
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {results.map((result, index) => {
            const mine = cards.filter((card) => card.resultId === result.id);
            const golden = mine.filter(isGolden).length;
            const active = activeResultId === result.id;
            return (
              <div
                key={result.id}
                className={`flex items-center gap-1.5 rounded-[10px] border p-2 transition-colors ${
                  active
                    ? "border-[var(--color-primary)] bg-white shadow-sm"
                    : "border-[var(--color-border)] bg-white/70"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelect(result.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span
                    className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-[10px] font-bold ${
                      active
                        ? "bg-[var(--color-primary)] text-white"
                        : "bg-[var(--color-primary-light)] text-[var(--color-primary)]"
                    }`}
                  >
                    {index + 1}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[12px] font-semibold text-[var(--color-text-primary)]">
                      {result.title}
                    </span>
                    <span className="truncate text-[9px] text-[var(--color-text-tertiary)]">
                      {result.evidence || "还没写怎样算达成"}
                    </span>
                  </span>
                  <span className="flex-shrink-0 text-[9px] text-[var(--color-text-tertiary)]">
                    {mine.length} 行为{golden > 0 ? ` · ${golden} 黄金` : ""}
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-[var(--color-text-tertiary)]" />
                </button>
                <button type="button" onClick={() => beginEdit(result)} aria-label={`编辑${result.title}`}>
                  <Pencil className="h-3.5 w-3.5 text-[var(--color-text-tertiary)]" />
                </button>
                <button type="button" onClick={() => setDeleteId(result.id)} aria-label={`删除${result.title}`}>
                  <Trash2 className="h-3.5 w-3.5 text-[var(--color-text-tertiary)]" />
                </button>
              </div>
            );
          })}

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
                  未归属行为
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

      {editingId && (
        <div className="flex flex-col gap-2 rounded-[10px] border border-[var(--color-primary)] bg-white p-2.5">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) saveResult();
            }}
            placeholder="什么变化发生了，才算更接近目标？"
            autoFocus
            className="w-full rounded-lg border border-[var(--color-border)] px-2.5 py-2 text-[12px] outline-none focus:border-[var(--color-primary)]"
          />
          <input
            value={evidence}
            onChange={(event) => setEvidence(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) saveResult();
            }}
            placeholder="达成证据（可选）：怎样算有进展？"
            className="w-full rounded-lg border border-[var(--color-border)] px-2.5 py-2 text-[12px] outline-none focus:border-[var(--color-primary)]"
          />
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
              {editingId === "new" ? "添加结果" : "保存"}
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={deleteId !== null}
        title="删除这条关键结果？"
        description="下面的行为不会删除，只会回到“未归属行为”，之后可以重新分组。"
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
