"use client";

import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { Clock } from "lucide-react";

type Props = {
  value: string; // "HH:mm" or ""
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
};

const ITEM_H = 36; // 每格高度
const VISIBLE_ROWS = 5;
const WHEEL_H = ITEM_H * VISIBLE_ROWS; // 180
const PAD = (WHEEL_H - ITEM_H) / 2; // 上下留白，让首尾项也能滚到中心

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

// 滚轮划过一格时的"嗒"声（WebAudio 合成，无需音频文件）
let audioCtx: AudioContext | null = null;
function playTick() {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    const ctx = audioCtx;
    if (ctx.state === "suspended") void ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = 1900;
    gain.gain.setValueAtTime(0.035, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.02);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.025);
  } catch {
    // 音频不可用就静默滚动
  }
}

// 单列滚轮（iOS 风格：snap 吸附 + 中心选中带 + 渐隐遮罩）
function WheelColumn({
  values,
  selected,
  onSelect,
}: {
  values: string[];
  selected: number;
  onSelect: (index: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const lastIdx = useRef(selected);

  // 挂载即定位到初始值（在绘制前完成，避免闪一下 0 点；不触发声音）
  useLayoutEffect(() => {
    if (ref.current) ref.current.scrollTop = selected * ITEM_H;
    lastIdx.current = selected;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleScroll() {
    const el = ref.current;
    if (!el) return;
    const idx = Math.max(0, Math.min(values.length - 1, Math.round(el.scrollTop / ITEM_H)));
    if (idx !== lastIdx.current) {
      lastIdx.current = idx;
      playTick();
      onSelect(idx);
    }
  }

  return (
    <div className="relative flex-1">
      <div
        ref={ref}
        onScroll={handleScroll}
        className="overflow-y-auto scrollbar-none"
        style={{ height: WHEEL_H, scrollSnapType: "y mandatory" }}
      >
        <div style={{ height: PAD }} />
        {values.map((v, i) => (
          <button
            key={v}
            type="button"
            onClick={() => ref.current?.scrollTo({ top: i * ITEM_H, behavior: "smooth" })}
            className={[
              "w-full flex items-center justify-center text-[16px] tabular-nums transition-colors",
              i === selected
                ? "text-[var(--color-primary)] font-semibold"
                : "text-[var(--color-text-tertiary)]",
            ].join(" ")}
            style={{ height: ITEM_H, scrollSnapAlign: "center" }}
          >
            {v}
          </button>
        ))}
        <div style={{ height: PAD }} />
      </div>

      {/* 中心选中带 */}
      <div className="pointer-events-none absolute inset-x-1 top-1/2 -translate-y-1/2 h-[36px] rounded-lg bg-[var(--color-primary-light)] opacity-60 -z-10" />
      {/* 上下渐隐遮罩 */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[64px] bg-gradient-to-b from-white via-white/70 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[64px] bg-gradient-to-t from-white via-white/70 to-transparent" />
    </div>
  );
}

export default function TimePicker({ value, onChange, placeholder = "选择时间", label }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [hourIdx, setHourIdx] = useState(9);
  const [minuteIdx, setMinuteIdx] = useState(0);
  const [dropdownPosition, setDropdownPosition] = useState<"bottom" | "top">("bottom");
  const containerRef = useRef<HTMLDivElement>(null);

  // 打开/关闭：打开时同步把滚轮定位到"已有值"或"当前时间"
  // （在事件里 setState 会被批处理，下一次渲染时索引已就位，滚轮挂载即落在正确位置）
  function handleToggle() {
    if (isOpen) {
      setIsOpen(false);
      return;
    }
    if (value) {
      const [h, m] = value.split(":").map(Number);
      setHourIdx(Number.isFinite(h) && h >= 0 && h <= 23 ? h : 0);
      setMinuteIdx(Number.isFinite(m) && m >= 0 && m <= 59 ? m : 0);
    } else {
      // 没填时间 → 默认落在当前时间，少滑
      const now = new Date();
      setHourIdx(now.getHours());
      setMinuteIdx(now.getMinutes());
    }
    setIsOpen(true);
  }

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  // Calculate dropdown position based on available space
  useEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const dropdownHeight = 300;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      setDropdownPosition(spaceBelow < dropdownHeight && spaceAbove > spaceBelow ? "top" : "bottom");
    }
  }, [isOpen]);

  const hasValue = value !== "";
  const displayValue = value || placeholder;

  function handleConfirm() {
    onChange(`${HOURS[hourIdx]}:${MINUTES[minuteIdx]}`);
    setIsOpen(false);
  }

  function handleClear() {
    onChange("");
    setIsOpen(false);
  }

  return (
    <div className="relative flex-1" ref={containerRef}>
      {/* Input Button */}
      <button
        type="button"
        onClick={handleToggle}
        className={[
          "w-full flex items-center gap-2 px-3 py-2.5 rounded-md border transition-all",
          isOpen || hasValue
            ? "border-[var(--color-primary)] border-2 bg-[var(--color-primary-light)]"
            : "border-[var(--color-border)]",
        ].join(" ")}
      >
        <Clock className={[
          "w-4 h-4",
          hasValue ? "text-[var(--color-primary)]" : "text-[var(--color-text-tertiary)]"
        ].join(" ")} />
        <span className={[
          "text-[14px]",
          hasValue
            ? "text-[var(--color-primary)] font-semibold"
            : "text-[var(--color-text-tertiary)]"
        ].join(" ")}>
          {displayValue}
        </span>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className={[
          "absolute left-0 right-0 min-w-[200px] bg-white rounded-[10px] border border-[var(--color-border)] shadow-[0_4px_16px_-2px_rgba(0,0,0,0.1)] z-50 overflow-hidden",
          dropdownPosition === "top" ? "bottom-full mb-2" : "top-full mt-2",
        ].join(" ")}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-[var(--color-bg-gray-lighter)]">
            <span className="text-[13px] font-semibold text-[var(--color-text-primary)]">
              {label || "选择时间"}
            </span>
            <button
              type="button"
              onClick={handleClear}
              className="text-[13px] font-medium text-[var(--color-primary)] hover:underline"
            >
              清除
            </button>
          </div>

          {/* 滚轮区：时 / 分 */}
          <div className="relative flex px-3 py-1">
            <WheelColumn values={HOURS} selected={hourIdx} onSelect={setHourIdx} />
            <span
              className="flex items-center text-[16px] font-semibold text-[var(--color-text-secondary)] px-1"
              style={{ height: WHEEL_H }}
            >
              :
            </span>
            <WheelColumn values={MINUTES} selected={minuteIdx} onSelect={setMinuteIdx} />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-[var(--color-border)]">
            <span className="text-[14px] font-semibold text-[var(--color-primary)] tabular-nums">
              {HOURS[hourIdx]}:{MINUTES[minuteIdx]}
            </span>
            <button
              type="button"
              onClick={handleConfirm}
              className="px-4 py-2 rounded-md text-[13px] font-medium bg-[var(--color-primary)] text-white hover:bg-[#1d4ed8] transition-colors"
            >
              确认
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
