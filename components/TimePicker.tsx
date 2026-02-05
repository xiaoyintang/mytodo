"use client";

import { useState, useRef, useEffect } from "react";
import { Clock } from "lucide-react";

type Props = {
  value: string; // "HH:mm" or ""
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
};

const HOURS = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, "0"));
const MINUTES = ["00", "15", "30", "45"];

export default function TimePicker({ value, onChange, placeholder = "选择时间", label }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedHour, setSelectedHour] = useState<string | null>(null);
  const [selectedMinute, setSelectedMinute] = useState<string | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState<"bottom" | "top">("bottom");
  const containerRef = useRef<HTMLDivElement>(null);
  const hourColumnRef = useRef<HTMLDivElement>(null);

  // Parse initial value
  useEffect(() => {
    if (value) {
      const [h, m] = value.split(":");
      setSelectedHour(h);
      setSelectedMinute(m);
    } else {
      setSelectedHour(null);
      setSelectedMinute(null);
    }
  }, [value]);

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

  // Scroll to selected hour when opening
  useEffect(() => {
    if (isOpen && hourColumnRef.current && selectedHour) {
      const hourIndex = HOURS.indexOf(selectedHour);
      if (hourIndex >= 0) {
        hourColumnRef.current.scrollTop = hourIndex * 36;
      }
    }
  }, [isOpen, selectedHour]);

  // Calculate dropdown position based on available space
  useEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const dropdownHeight = 320; // approximate height of dropdown
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;

      if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
        setDropdownPosition("top");
      } else {
        setDropdownPosition("bottom");
      }
    }
  }, [isOpen]);

  const hasValue = value !== "";
  const displayValue = value || placeholder;

  function handleConfirm() {
    if (selectedHour && selectedMinute) {
      onChange(`${selectedHour}:${selectedMinute}`);
      setIsOpen(false);
    }
  }

  function handleClear() {
    setSelectedHour(null);
    setSelectedMinute(null);
    onChange("");
    setIsOpen(false);
  }

  function handleHourSelect(hour: string) {
    setSelectedHour(hour);
    if (!selectedMinute) {
      setSelectedMinute("00");
    }
  }

  function handleMinuteSelect(minute: string) {
    setSelectedMinute(minute);
    if (!selectedHour) {
      setSelectedHour("09");
    }
  }

  return (
    <div className="relative flex-1" ref={containerRef}>
      {/* Input Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
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
          "absolute left-0 right-0 bg-white rounded-[10px] border border-[var(--color-border)] shadow-[0_4px_16px_-2px_rgba(0,0,0,0.1)] z-50 overflow-hidden",
          dropdownPosition === "top" ? "bottom-full mb-2" : "top-full mt-2",
        ].join(" ")}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-[var(--color-bg-gray-lighter)]">
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

          {/* Content - Hour and Minute Columns */}
          <div className="flex gap-2 px-3 py-2">
            {/* Hour Column */}
            <div
              ref={hourColumnRef}
              className="flex-1 h-[180px] overflow-y-auto flex flex-col gap-0.5 scrollbar-thin"
            >
              {HOURS.map((hour) => (
                <button
                  key={hour}
                  type="button"
                  onClick={() => handleHourSelect(hour)}
                  className={[
                    "w-full py-2 text-center text-[14px] rounded-md transition-colors",
                    selectedHour === hour
                      ? "bg-[var(--color-primary)] text-white font-semibold"
                      : "hover:bg-[var(--color-bg-gray-light)] text-[var(--color-text-secondary)]",
                  ].join(" ")}
                >
                  {hour}:00
                </button>
              ))}
            </div>

            {/* Minute Column */}
            <div className="flex-1 h-[180px] overflow-y-auto flex flex-col gap-0.5">
              {MINUTES.map((minute) => (
                <button
                  key={minute}
                  type="button"
                  onClick={() => handleMinuteSelect(minute)}
                  className={[
                    "w-full py-2 text-center text-[14px] rounded-md transition-colors",
                    selectedMinute === minute
                      ? "bg-[var(--color-primary)] text-white font-semibold"
                      : "hover:bg-[var(--color-bg-gray-light)] text-[var(--color-text-secondary)]",
                  ].join(" ")}
                >
                  :{minute}
                </button>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end px-4 py-3 border-t border-[var(--color-border)]">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!selectedHour || !selectedMinute}
              className={[
                "px-4 py-2 rounded-md text-[13px] font-medium transition-colors",
                selectedHour && selectedMinute
                  ? "bg-[var(--color-primary)] text-white hover:bg-[#1d4ed8]"
                  : "bg-[var(--color-bg-gray-light)] text-[var(--color-text-tertiary)] cursor-not-allowed",
              ].join(" ")}
            >
              确认
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
