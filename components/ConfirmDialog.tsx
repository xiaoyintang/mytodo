"use client";

import { TriangleAlert } from "lucide-react";

type Props = {
  isOpen: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

// 通用二次确认弹窗（替代 window.confirm）
// z-index 高于 TaskBottomSheet(z-101)，保证在详情弹窗之上也能正常显示
export default function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmLabel = "删除",
  onConfirm,
  onCancel,
}: Props) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center px-8">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />

      {/* Dialog */}
      <div className="relative w-full max-w-[320px] bg-white rounded-2xl shadow-[0_8px_32px_-4px_rgba(0,0,0,0.2)] p-5 flex flex-col items-center gap-3">
        <div className="w-11 h-11 rounded-full bg-[var(--color-danger-light)] flex items-center justify-center">
          <TriangleAlert className="w-5 h-5 text-[var(--color-danger)]" />
        </div>
        <span className="text-[16px] font-semibold text-[var(--color-text-primary)] text-center">
          {title}
        </span>
        {description && (
          <p className="text-[13px] text-[var(--color-text-secondary)] text-center leading-relaxed -mt-1">
            {description}
          </p>
        )}
        <div className="w-full flex gap-2.5 mt-1">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-[var(--color-border)] text-[14px] font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-bg-gray-light)] transition-colors"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl bg-[var(--color-danger)] text-[14px] font-semibold text-white hover:bg-[#B91C1C] transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
