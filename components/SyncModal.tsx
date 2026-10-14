"use client";

import { useState } from "react";
import { X, Cloud, RefreshCw, Check, TriangleAlert, Dices, Unlink } from "lucide-react";
import type { SyncStatus } from "@/components/todo/sync";
import type { SyncConflict } from "@/components/todo/syncMerge";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  code: string;
  status: SyncStatus;
  lastSyncedAt: number | null;
  onConnect: (code: string) => void;
  onDisconnect: () => void;
  onRefresh: () => void;
  conflicts?: SyncConflict[];
  taskTitles?: Record<string, string>;
  onResolveConflict?: (signature: string, choice: "local" | "cloud") => void;
};

const CODE_RE = /^[A-Za-z0-9_-]{4,64}$/;

function statusText(status: SyncStatus, lastSyncedAt: number | null): string {
  switch (status) {
    case "syncing":
      return "同步中…";
    case "synced": {
      if (!lastSyncedAt) return "已同步";
      const s = Math.round((Date.now() - lastSyncedAt) / 1000);
      if (s < 60) return "刚刚已同步";
      return `${Math.round(s / 60)} 分钟前同步`;
    }
    case "error":
      return "同步失败，检查网络后重试";
    case "conflict":
      return "版本有冲突，待你确认";
    case "not_configured":
      return "云同步未配置";
    default:
      return "未连接";
  }
}

function randomCode(): string {
  const chars = "abcdefghijkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export default function SyncModal({
  isOpen,
  onClose,
  code,
  status,
  lastSyncedAt,
  onConnect,
  onDisconnect,
  onRefresh,
  conflicts = [],
  taskTitles = {},
  onResolveConflict,
}: Props) {
  const [input, setInput] = useState("");
  const [err, setErr] = useState("");
  const [checking, setChecking] = useState(false);
  const [pendingCode, setPendingCode] = useState<string | null>(null); // 待确认覆盖的码

  if (!isOpen) return null;

  const connected = code !== "";

  async function handleConnect() {
    const c = input.trim();
    if (!CODE_RE.test(c)) {
      setErr("同步码需 4-64 位字母 / 数字 / - / _");
      return;
    }
    setErr("");
    setChecking(true);
    try {
      const res = await fetch(`/api/sync?code=${encodeURIComponent(c)}`, { cache: "no-store" });
      setChecking(false);
      if (res.status === 501) {
        setErr("云同步未配置：需在 Vercel 添加 KV 存储（见下方说明）");
        return;
      }
      if (!res.ok) {
        setErr("连接失败，请重试");
        return;
      }
      const json = await res.json();
      const d = json?.data;
      const hasData = d && ((d.tasks?.length ?? 0) + (d.entries?.length ?? 0) > 0);
      if (hasData) {
        setPendingCode(c); // 云端已有数据，先确认再覆盖本机
      } else {
        onConnect(c); // 云端为空，直接连接并上传本地
        onClose();
      }
    } catch {
      setChecking(false);
      setErr("连接失败，请重试");
    }
  }

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center px-6">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative w-full max-w-[480px] max-h-[85dvh] overflow-y-auto bg-white rounded-2xl shadow-[0_8px_32px_-4px_rgba(0,0,0,0.2)] p-5 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-[16px] font-semibold text-[var(--color-text-primary)]">
            <Cloud className="w-5 h-5 text-[var(--color-primary)]" />
            多设备同步
          </span>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[var(--color-bg-gray-light)] transition-colors"
          >
            <X className="w-[18px] h-[18px] text-[var(--color-text-secondary)]" />
          </button>
        </div>

        {status === "conflict" && conflicts[0] && (() => {
          const conflict = conflicts[0];
          const fields: Record<string, string> = { tasks: "任务", entries: "记录", subtasks: "工作步骤", steps: "固定流程", title: "标题", status: "完成状态", dayPlans: "主线安排", startAction: "最小启动" };
          const label = conflict.path.map(part => taskTitles[part] ?? fields[part] ?? part).join(" · ");
          const preview = (value: unknown): string => {
            if (value === undefined) return "已删除 / 未设置";
            if (Array.isArray(value)) return value.length ? value.map((item, i) => `${i + 1}. ${typeof item === "object" && item ? `${item.done ? "✓ " : ""}${item.title ?? JSON.stringify(item)}` : String(item)}`).join("\n") : "空列表";
            if (typeof value === "object") return JSON.stringify(value, null, 2);
            return String(value);
          };
          return <section className="flex flex-col gap-3 rounded-xl border border-[var(--color-danger)] bg-[var(--color-danger-light)] p-3">
            <p className="text-sm font-medium">有 {conflicts.length} 处版本差异，需要你确认</p>
            <p className="text-xs text-[var(--color-text-secondary)]">两边改了同一处，或旧版本没有修改历史。请对照选择，其他内容会自动合并。</p>
            <p className="break-words text-sm font-medium">{label}</p>
            {(["local", "cloud"] as const).map(side => <div key={side} className="rounded-lg bg-white p-3">
              <div className="mb-2 text-xs text-[var(--color-text-secondary)]">{side === "local" ? "这台设备" : "云端（其他设备上传）"}</div>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words font-sans text-sm">{preview(side === "local" ? conflict.local : conflict.cloud)}</pre>
              <button type="button" onClick={() => onResolveConflict?.(conflict.signature, side)} className="mt-3 min-h-11 rounded-lg border border-[var(--color-primary)] px-3 text-sm text-[var(--color-primary)] hover:bg-[var(--color-primary-light)]">
                {side === "local" ? "保留本机这一处" : "使用云端这一处"}
              </button>
            </div>)}
          </section>;
        })()}

        {pendingCode ? (
          /* 覆盖确认 */
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-2 p-3 rounded-lg bg-[var(--color-danger-light)]">
              <TriangleAlert className="w-4 h-4 text-[var(--color-danger)] flex-shrink-0 mt-0.5" />
              <span className="text-[13px] text-[var(--color-text-primary)] leading-relaxed">
                同步码 <span className="font-semibold">{pendingCode}</span> 云端已有数据。连接后会读取云端内容，
                <span className="font-semibold">本机尚未上传的修改会尝试合并；版本有冲突时由你确认</span>。
                <br />
                请确认这是你另一台设备使用的同步码。
              </span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPendingCode(null)}
                className="flex-1 py-2.5 rounded-xl border border-[var(--color-border)] text-[14px] font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-bg-gray-light)] transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  onConnect(pendingCode);
                  setPendingCode(null);
                  onClose();
                }}
                className="flex-1 py-2.5 rounded-xl bg-[var(--color-danger)] text-[14px] font-semibold text-white hover:bg-[#B91C1C] transition-colors"
              >
                连接并同步
              </button>
            </div>
          </div>
        ) : connected ? (
          /* 已连接 */
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between px-3.5 py-3 rounded-[10px] bg-[var(--color-primary-light)] border border-[var(--color-primary)]">
              <div className="flex flex-col">
                <span className="text-[12px] text-[var(--color-text-secondary)]">当前同步码</span>
                <span className="text-[16px] font-bold text-[var(--color-primary)] tracking-wide">{code}</span>
              </div>
              <span
                className={[
                  "flex items-center gap-1 text-[12px] font-medium",
                  status === "synced"
                    ? "text-[var(--color-success)]"
                    : status === "error" || status === "not_configured" || status === "conflict"
                      ? "text-[var(--color-danger)]"
                      : "text-[var(--color-text-secondary)]",
                ].join(" ")}
              >
                {status === "synced" && <Check className="w-3.5 h-3.5" />}
                {status === "syncing" && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                {statusText(status, lastSyncedAt)}
              </span>
            </div>

            <p className="text-[12px] text-[var(--color-text-secondary)] leading-relaxed">
              在另一台设备打开 App，用同一个同步码即可看到相同数据。切换设备后
              <span className="font-medium">刷新页面</span>拿到最新。
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onRefresh}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-[var(--color-border)] text-[14px] font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-bg-gray-light)] transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                立即拉取
              </button>
              <button
                type="button"
                onClick={() => {
                  onDisconnect();
                  onClose();
                }}
                className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#FEF2F2] text-[#DC2626] text-[14px] font-medium hover:bg-[#FEE2E2] transition-colors"
              >
                <Unlink className="w-4 h-4" />
                断开
              </button>
            </div>
          </div>
        ) : (
          /* 未连接：输入同步码 */
          <div className="flex flex-col gap-3">
            <p className="text-[13px] text-[var(--color-text-secondary)] leading-relaxed">
              设一个只有你知道的同步码，在你的手机和电脑上都输入它，数据就会自动同步。
              第一次在数据最全的那台设备上设置。
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  setErr("");
                }}
                placeholder="输入同步码"
                className="flex-1 px-3 py-2.5 rounded-lg border border-[var(--color-border)] text-[14px] tracking-wide placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]"
              />
              <button
                type="button"
                onClick={() => setInput(randomCode())}
                className="flex items-center gap-1 px-3 rounded-lg border border-[var(--color-border)] text-[13px] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-gray-light)] transition-colors"
                title="随机生成"
              >
                <Dices className="w-4 h-4" />
              </button>
            </div>
            {err && <p className="text-[12px] text-[var(--color-danger)]">{err}</p>}
            <button
              type="button"
              onClick={handleConnect}
              disabled={!input.trim() || checking}
              className={[
                "w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[14px] font-semibold transition-colors",
                input.trim() && !checking
                  ? "bg-[var(--color-primary)] text-white hover:bg-[#1d4ed8]"
                  : "bg-[var(--color-bg-gray-light)] text-[var(--color-text-tertiary)] cursor-not-allowed",
              ].join(" ")}
            >
              <Cloud className="w-4 h-4" />
              {checking ? "连接中…" : "连接同步"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
