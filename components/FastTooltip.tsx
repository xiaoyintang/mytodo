"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type TooltipState = {
  text: string;
  left: number;
  top: number;
  above: boolean;
};

function tooltipTarget(target: EventTarget | null) {
  return target instanceof Element
    ? target.closest<HTMLElement>("[data-full-text]")
    : null;
}

function isClipped(element: HTMLElement) {
  return (
    element.scrollWidth > element.clientWidth + 1 ||
    element.scrollHeight > element.clientHeight + 1
  );
}

/**
 * 全局截断文字提示：只在文字真的被省略时出现。
 * 用 fixed + portal，避免被卡片的 overflow-hidden 裁掉。
 */
export default function FastTooltip() {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const active = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const hide = () => {
      active.current = null;
      setTooltip(null);
    };

    const show = (element: HTMLElement, keyboard = false) => {
      const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
      if ((!finePointer && !keyboard) || !isClipped(element)) {
        hide();
        return;
      }

      const text = element.dataset.fullText?.trim();
      if (!text) {
        hide();
        return;
      }

      const rect = element.getBoundingClientRect();
      const maxWidth = Math.min(360, window.innerWidth - 24);
      const center = rect.left + rect.width / 2;
      const left = Math.min(
        Math.max(center, 12 + maxWidth / 2),
        window.innerWidth - 12 - maxWidth / 2,
      );
      const above = rect.bottom + 96 > window.innerHeight;

      active.current = element;
      setTooltip({
        text,
        left,
        top: above ? rect.top - 7 : rect.bottom + 7,
        above,
      });
    };

    const onPointerOver = (event: PointerEvent) => {
      const target = tooltipTarget(event.target);
      if (!target || target === active.current) return;
      show(target);
    };

    const onPointerOut = (event: PointerEvent) => {
      const current = active.current;
      if (!current) return;
      if (event.relatedTarget instanceof Node && current.contains(event.relatedTarget)) return;
      if (event.target instanceof Node && current.contains(event.target)) hide();
    };

    const onFocusIn = (event: FocusEvent) => {
      const target = tooltipTarget(event.target);
      if (target) show(target, true);
    };

    const onFocusOut = (event: FocusEvent) => {
      const current = active.current;
      if (current && event.target instanceof Node && current.contains(event.target)) hide();
    };

    document.addEventListener("pointerover", onPointerOver);
    document.addEventListener("pointerout", onPointerOut);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);

    return () => {
      document.removeEventListener("pointerover", onPointerOver);
      document.removeEventListener("pointerout", onPointerOut);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, []);

  if (!tooltip) return null;

  return createPortal(
    <div
      role="tooltip"
      className="animate-fast-tooltip pointer-events-none fixed z-[100] max-w-[360px] break-words rounded-lg border border-white/10 bg-[#27272A] px-2.5 py-1.5 text-[11px] font-medium leading-4 text-white shadow-[0_8px_24px_rgba(24,24,27,0.22)]"
      style={{
        left: tooltip.left,
        top: tooltip.top,
        transform: tooltip.above ? "translate(-50%, -100%)" : "translateX(-50%)",
      }}
    >
      {tooltip.text}
    </div>,
    document.body,
  );
}
