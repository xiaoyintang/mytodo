"use client";

import { useRef, useState } from "react";

export default function TaskTitleEditor({ title, onSave, onClose }: {
  title: string; onSave: (title: string) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState(title);
  const closed = useRef(false);
  function finish(save: boolean) {
    if (closed.current) return;
    closed.current = true;
    const next = draft.trim();
    if (save && next && next !== title) onSave(next);
    onClose();
  }
  return <div data-no-tab-swipe>
    <textarea autoFocus aria-label="修改任务名称" rows={2} value={draft}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing || event.keyCode === 229) return;
        if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); finish(true); }
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); finish(false); }
      }}
      className="block w-full resize-y rounded-md border border-[var(--color-primary)] bg-[var(--color-bg-white)] px-2 py-1 text-[14px] leading-5 text-[var(--color-text-primary)] outline-none" />
    <span className="text-[10px] text-[var(--color-text-tertiary)]">回车或点空白保存 · Esc 取消</span>
  </div>;
}
