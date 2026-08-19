"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft } from "lucide-react";

type Props = {
  onBack: () => void;
};

type Gesture = {
  pointerId: number;
  startX: number;
  startY: number;
  startedAt: number;
};

const TRIGGER_DISTANCE = 68;

/**
 * 手机端的左边缘返回手势。只占用屏幕最左侧一小条区域，避免和页面里的
 * 横向滑块、Tab 切换抢手势；拖动时给出轻量的跟手提示。
 */
export default function EdgeSwipeBack({ onBack }: Props) {
  const gestureRef = useRef<Gesture | null>(null);
  const [feedback, setFeedback] = useState({ visible: false, y: 120, progress: 0 });

  function reset() {
    gestureRef.current = null;
    setFeedback((current) => ({ ...current, visible: false, progress: 0 }));
  }

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;

      const deltaX = event.clientX - gesture.startX;
      const deltaY = event.clientY - gesture.startY;
      if (Math.abs(deltaY) > Math.max(18, Math.abs(deltaX) * 1.15)) {
        reset();
        return;
      }

      setFeedback({
        visible: true,
        y: gesture.startY,
        progress: Math.max(0, Math.min(1, deltaX / TRIGGER_DISTANCE)),
      });
    }

    function handlePointerEnd(event: PointerEvent) {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;

      const deltaX = event.clientX - gesture.startX;
      const deltaY = event.clientY - gesture.startY;
      const elapsed = performance.now() - gesture.startedAt;
      const shouldGoBack =
        deltaX >= TRIGGER_DISTANCE &&
        deltaX > Math.abs(deltaY) * 1.25 &&
        elapsed < 1200;

      reset();
      if (shouldGoBack) onBack();
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerEnd);
    window.addEventListener("pointercancel", reset);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerEnd);
      window.removeEventListener("pointercancel", reset);
    };
  }, [onBack]);

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    gestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startedAt: performance.now(),
    };
    setFeedback({ visible: true, y: event.clientY, progress: 0 });
  }

  return (
    <>
      <div
        aria-hidden="true"
        className="fixed inset-y-0 left-0 z-[70] w-5 touch-pan-y sm:hidden"
        onPointerDown={handlePointerDown}
      />
      {feedback.visible && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed left-1 z-[71] flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-border)] bg-white shadow-lg transition-[opacity,background-color,color] duration-100 sm:hidden"
          style={{
            top: Math.max(12, feedback.y - 18),
            opacity: 0.35 + feedback.progress * 0.65,
            transform: `translateX(${feedback.progress * 14}px) scale(${0.9 + feedback.progress * 0.1})`,
            color:
              feedback.progress >= 1
                ? "var(--color-primary)"
                : "var(--color-text-secondary)",
          }}
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={2.4} />
        </div>
      )}
    </>
  );
}
