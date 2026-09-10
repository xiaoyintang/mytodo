"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, MoreHorizontal, Pencil, Trash2 } from "lucide-react";

export default function TaskQuickActions({ title, onRename, onDetails, onDelete }: {
  title: string;
  onRename: () => void;
  onDetails: () => void;
  onDelete: () => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  function close(restoreFocus = false) {
    setPosition(null);
    if (restoreFocus) trigger.current?.focus();
  }
  useEffect(() => {
    if (!position) return;
    menu.current?.querySelector<HTMLButtonElement>("button")?.focus();
    function dismiss(event: Event) {
      if (event.target instanceof Node && menu.current?.contains(event.target)) return;
      setPosition(null);
    }
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, true);
    return () => {
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", dismiss, true);
    };
  }, [position]);
  const actions = [
    { label: "改名", Icon: Pencil, run: onRename },
    { label: "查看详情", Icon: FileText, run: onDetails },
    { label: "删除任务", Icon: Trash2, run: onDelete },
  ];
  return <>
    <button ref={trigger} type="button" aria-label={`更多操作：${title}`} aria-haspopup="menu" aria-expanded={!!position}
      onClick={(event) => {
        event.stopPropagation();
        if (position) { close(); return; }
        const rect = event.currentTarget.getBoundingClientRect();
        setPosition({ left: Math.max(8, Math.min(rect.right - 168, window.innerWidth - 176)),
          top: rect.bottom + 148 <= window.innerHeight ? rect.bottom + 4 : Math.max(8, rect.top - 144) });
      }}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--color-text-tertiary)] opacity-60 transition-[opacity,background-color] hover:bg-[var(--color-bg-gray-light)] sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 focus-visible:opacity-100">
      <MoreHorizontal className="h-4 w-4" />
    </button>
    {position && createPortal(<div className="fixed inset-0 z-[110]" data-no-tab-swipe onClick={(event) => { event.stopPropagation(); close(true); }}>
      <div ref={menu} role="menu" aria-label={`${title}的操作`} style={position}
        className="fixed w-[168px] rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-white)] p-1 shadow-lg"
        onClick={(event) => event.stopPropagation()}
        onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) close(); }}
        onKeyDown={(event) => {
          if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(true); }
          if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
            event.preventDefault();
            const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button"));
            const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
            const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
              : (current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
            buttons[next]?.focus();
          }
        }}>
        {actions.map(({ label, Icon, run }, index) => <button key={label} type="button" role="menuitem"
          onClick={() => { close(); run(); }}
          className={`flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-[13px] outline-none hover:bg-[var(--color-bg-gray-lighter)] focus:bg-[var(--color-bg-gray-lighter)] ${index === 2 ? "text-[var(--color-danger)]" : "text-[var(--color-text-primary)]"}`}>
          <Icon className="h-3.5 w-3.5" />{label}
        </button>)}
      </div>
    </div>, document.body)}
  </>;
}
