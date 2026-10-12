"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/** Only the feedback expires; undo history remains in its owning module. */
export default function TransientNotice({ expiresAt, onDismiss, children, className = "", contextKey = "" }: {
  expiresAt: number;
  onDismiss: () => void;
  children: ReactNode;
  className?: string;
  contextKey?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  const initialContext = useRef(contextKey);

  useEffect(() => {
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) { dismissRef.current(); return; }
    const timer = window.setTimeout(() => dismissRef.current(), remaining);
    function onPointer(event: PointerEvent) {
      if (event.target instanceof Node && !ref.current?.contains(event.target)) dismissRef.current();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") { dismissRef.current(); return; }
      if (["Tab", "Shift", "Control", "Meta", "Alt"].includes(event.key)) return;
      if (event.target instanceof Node && !ref.current?.contains(event.target)) dismissRef.current();
    }
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [expiresAt]);

  useEffect(() => {
    if (initialContext.current !== contextKey) dismissRef.current();
  }, [contextKey]);

  if (expiresAt <= Date.now()) return null;
  return <div ref={ref} role="status" data-no-tab-swipe className={`flex items-center gap-1 ${className}`}>
    <div className="min-w-0 flex-1">{children}</div>
    <button type="button" aria-label="关闭操作提示" onClick={onDismiss}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-gray-light)] hover:text-[var(--color-text-primary)]">
      <X className="h-4 w-4" />
    </button>
  </div>;
}
