"use client";

import { useState } from "react";
import type { Aspiration, AspirationKind, BehaviorCard, BehaviorType, ViewMode } from "@/components/todo/types";
import {
  BEHAVIOR_TYPE_LABEL,
  BEHAVIOR_TYPE_ORDER,
  BEHAVIOR_TYPE_STYLE,
  looksLikeAspiration,
} from "@/components/todo/behavior";
import { ArrowLeft, ChevronRight, Plus, Sparkles, Target, Trash2, Wand2, X } from "lucide-react";
import ConfirmDialog from "@/components/ConfirmDialog";

type Props = {
  viewMode: ViewMode;
  onChangeViewMode: (mode: ViewMode) => void;
  aspirations: Aspiration[];
  behaviors: BehaviorCard[];
  onCreateAspiration: (title: string, kind: AspirationKind) => void;
  onDeleteAspiration: (id: string) => void;
  onAddBehaviors: (aspirationId: string, items: Array<{ text: string; type: BehaviorType }>) => void;
  onDeleteBehavior: (id: string) => void;
};

const TABS: Array<[ViewMode, string]> = [
  ["day", "日视图"],
  ["week", "周视图"],
  ["log", "记录"],
  ["habit", "习惯"],
];

const KIND_LABEL: Record<AspirationKind, string> = { aspiration: "愿望", outcome: "结果" };

// 预览区里待确认的候选行为（可逐条勾选）
type PendingItem = { text: string; type: BehaviorType; checked: boolean };
type Pending = { note: string; items: PendingItem[] };

async function callBehaviorAPI(
  body: Record<string, unknown>,
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; noKey: boolean }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000); // 发散比解析慢，给足时间
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
  onDeleteBehavior,
}: Props) {
  const [openId, setOpenId] = useState<string | null>(null);

  // 新建愿望
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newKind, setNewKind] = useState<AspirationKind>("aspiration");

  // 行为集群收集
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<"judge" | "wand" | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  const [deleteAspId, setDeleteAspId] = useState<string | null>(null);

  const open = openId ? aspirations.find((a) => a.id === openId) ?? null : null;
  const openBehaviors = open ? behaviors.filter((b) => b.aspirationId === open.id) : [];

  function resetCollect() {
    setInput("");
    setPending(null);
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

  // 我自己想到一句话 → AI 判定是愿望/结果/行为，不是行为就顺手发散
  async function handleJudge() {
    const text = input.trim();
    if (!text || !open || busy) return;
    setBusy("judge");
    setNote(null);
    setPending(null);

    const res = await callBehaviorAPI({ mode: "judge", text, aspiration: open.title });
    setBusy(null);

    if (!res.ok) {
      // AI 不可用：直接收着，别挡住你记东西；看着像愿望就提醒一句
      const hint = res.noKey ? "没配 AI" : "AI 没连上";
      onAddBehaviors(open.id, [{ text, type: "habit" }]);
      setInput("");
      setNote(
        looksLikeAspiration(text)
          ? `${hint}，先原样收进集群了。不过这句看着像愿望不像行为，回头改成"现在马上就能做"的说法更好`
          : `${hint}，先原样收进集群了`,
      );
      return;
    }

    const kind = String(res.data.kind ?? "behavior");
    // 去掉句尾标点，免得和下面拼的句子撞成"。。"
    const reason = String(res.data.reason ?? "").trim().replace(/[。.!！\s]+$/, "");
    const items = toPendingItems(res.data.behaviors);
    if (items.length === 0) {
      setNote("AI 没给出可用的行为，换个说法再试试");
      return;
    }
    setPending({
      note:
        kind === "behavior"
          ? `这是「行为」${reason ? `——${reason}` : ""}`
          : `这是「${kind === "outcome" ? "结果" : "愿望"}」${reason ? `——${reason}` : ""}。下面是能马上做的行为：`,
      items,
    });
  }

  // 魔法棒：假设毫不费力，从愿望直接发散一批
  async function handleWand() {
    if (!open || busy) return;
    setBusy("wand");
    setNote(null);
    setPending(null);

    const res = await callBehaviorAPI({
      mode: "wand",
      aspiration: open.title,
      existing: openBehaviors.map((b) => b.text),
    });
    setBusy(null);

    if (!res.ok) {
      setNote(res.noKey ? "没配 AI，魔法棒用不了——手动往下面输入框里加吧" : "AI 没连上，稍后再试");
      return;
    }
    const items = toPendingItems(res.data.behaviors);
    if (items.length === 0) {
      setNote("AI 这次没发散出东西，再点一次试试");
      return;
    }
    setPending({ note: "假设毫不费力，这些是能实现它的行为。勾掉你不要的：", items });
  }

  function confirmPending() {
    if (!pending || !open) return;
    const picked = pending.items.filter((i) => i.checked).map(({ text, type }) => ({ text, type }));
    if (picked.length > 0) onAddBehaviors(open.id, picked);
    resetCollect();
  }

  function togglePending(index: number) {
    setPending((p) =>
      p ? { ...p, items: p.items.map((it, i) => (i === index ? { ...it, checked: !it.checked } : it)) } : p,
    );
  }

  function handleDeleteAspiration() {
    if (!deleteAspId) return;
    onDeleteAspiration(deleteAspId);
    if (openId === deleteAspId) setOpenId(null);
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

      <div className="w-full flex flex-col gap-5 px-6 pt-5 pb-6">
        {!open ? (
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
                  2. 用魔法棒发散：假设毫不费力，有哪些<strong>现在马上就能做</strong>的行为能实现它
                  <br />
                  3. 攒够一堆候选行为（行为集群），下一步再用焦点地图筛出真正该做的那几个
                </p>
              </div>
            ) : (
              <div className="w-full flex flex-col gap-2">
                {aspirations.map((a) => {
                  const count = behaviors.filter((b) => b.aspirationId === a.id).length;
                  return (
                    <div
                      key={a.id}
                      className="w-full flex items-center gap-2 px-3.5 py-3 rounded-[10px] bg-white border border-[var(--color-border)]"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setOpenId(a.id);
                          resetCollect();
                        }}
                        className="flex-1 flex items-center gap-2.5 min-w-0 text-left"
                      >
                        <Target className="w-4 h-4 text-[var(--color-primary)] flex-shrink-0" />
                        <div className="flex-1 flex flex-col gap-0.5 min-w-0">
                          <span className="text-[14px] font-medium text-[var(--color-text-primary)] truncate">
                            {a.title}
                          </span>
                          <span className="text-[11px] text-[var(--color-text-tertiary)]">
                            {KIND_LABEL[a.kind]} · {count > 0 ? `${count} 个候选行为` : "还没有行为"}
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
                  resetCollect();
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

            {/* 魔法棒 */}
            <div className="w-full flex flex-col gap-2">
              <p className="text-[12px] leading-relaxed text-[var(--color-text-secondary)]">
                「如果有根魔法棒，我毫不费力就能做到任何事，我会让自己做<strong>哪些行为</strong>？」
              </p>
              <button
                type="button"
                onClick={handleWand}
                disabled={busy !== null}
                className={[
                  "w-full flex items-center justify-center gap-1.5 rounded-[10px] py-2.5 text-[14px] font-semibold transition-colors",
                  busy === null
                    ? "bg-[var(--color-primary)] text-white hover:bg-[#1d4ed8]"
                    : "bg-[var(--color-bg-gray-light)] text-[var(--color-text-tertiary)] cursor-not-allowed",
                ].join(" ")}
              >
                <Wand2 className="w-4 h-4" />
                {busy === "wand" ? "发散中..." : "挥一下魔法棒"}
              </button>
            </div>

            {/* 自己输入 */}
            <div className="w-full flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[var(--color-primary)]" />
                <span className="text-[var(--color-text-primary)] text-[15px] font-semibold">我自己想到的</span>
                <span className="text-[var(--color-text-tertiary)] text-[12px]">回车提交 · 可语音</span>
              </div>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    handleJudge();
                  }
                }}
                placeholder="说一句话，AI 帮你看它是愿望、结果、还是真能做的行为"
                enterKeyHint="send"
                rows={2}
                className="w-full px-3 py-2.5 rounded-[10px] border border-[var(--color-border)] text-[14px] leading-relaxed placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] resize-none"
              />
              {busy === "judge" && (
                <span className="text-[12px] text-[var(--color-text-tertiary)]">AI 判定中...</span>
              )}
              {note && <p className="text-[12px] text-[var(--color-text-secondary)]">{note}</p>}
            </div>

            {/* 候选行为预览 */}
            {pending && (
              <div className="w-full flex flex-col gap-2 p-3 rounded-[10px] bg-[var(--color-bg-gray-lighter)] border border-[var(--color-border)]">
                <p className="text-[12px] font-medium text-[var(--color-text-secondary)] leading-relaxed">
                  {pending.note}
                </p>
                {pending.items.map((it, i) => {
                  const st = BEHAVIOR_TYPE_STYLE[it.type];
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
                        {BEHAVIOR_TYPE_LABEL[it.type]}
                      </span>
                    </button>
                  );
                })}
                <div className="flex justify-end gap-2 mt-1">
                  <button
                    type="button"
                    onClick={resetCollect}
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
            )}

            {/* 行为集群 */}
            <div className="w-full flex flex-col gap-3">
              <div className="w-full flex items-center justify-between">
                <span className="text-[var(--color-text-primary)] text-[16px] font-semibold">行为集群</span>
                <span className="text-[var(--color-text-tertiary)] text-[13px] font-medium">
                  {openBehaviors.length > 0 ? `${openBehaviors.length} 个行为` : "还是空的"}
                </span>
              </div>

              {openBehaviors.length === 0 ? (
                <p className="text-[12px] leading-relaxed text-[var(--color-text-tertiary)]">
                  先攒着，别筛。福格的建议是一口气想 10-20 个，越多越好，好不好、做不做得到都<strong>先别judge</strong>——那是下一步焦点地图的事。
                </p>
              ) : (
                BEHAVIOR_TYPE_ORDER.map((type) => {
                  const list = openBehaviors.filter((b) => b.type === type);
                  if (list.length === 0) return null;
                  const st = BEHAVIOR_TYPE_STYLE[type];
                  return (
                    <div key={type} className="w-full flex flex-col gap-2">
                      <span
                        className="self-start px-1.5 py-[1px] rounded border text-[10px] font-medium"
                        style={{ backgroundColor: st.bg, borderColor: st.border, color: st.text }}
                      >
                        {BEHAVIOR_TYPE_LABEL[type]} · {list.length}
                      </span>
                      {list.map((b) => (
                        <div
                          key={b.id}
                          className="w-full flex items-center gap-2 px-3.5 py-2.5 rounded-[10px] bg-white border border-[var(--color-border)]"
                        >
                          <span className="flex-1 text-[13px] text-[var(--color-text-primary)] leading-snug">
                            {b.text}
                          </span>
                          <button
                            type="button"
                            onClick={() => onDeleteBehavior(b.id)}
                            className="w-[18px] h-[18px] flex items-center justify-center flex-shrink-0"
                            aria-label="删除这个行为"
                          >
                            <X className="w-[15px] h-[15px] text-[#A1A1AA]" />
                          </button>
                        </div>
                      ))}
                    </div>
                  );
                })
              )}
            </div>

            {openBehaviors.length >= 5 && (
              <p className="text-[12px] text-[var(--color-text-tertiary)] text-center">
                攒够了就该排焦点地图了 —— 二期做
              </p>
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
          return target ? `「${target.title}」和它下面的 ${n} 个行为都会删掉，且不可恢复` : undefined;
        })()}
        onConfirm={handleDeleteAspiration}
        onCancel={() => setDeleteAspId(null)}
      />
    </div>
  );
}
