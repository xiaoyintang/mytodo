"use client";

import type { ReactNode } from "react";
import type { ISODate, ViewMode } from "@/components/todo/types";
import { CN_WEEKDAY, toISODate } from "@/components/todo/date";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";

const TABS: Array<[ViewMode, string]> = [
  ["day", "今天"],
  ["week", "本周"],
  ["log", "记录"],
  ["habit", "习惯"],
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full w-full max-w-[460px] flex-col overflow-hidden bg-white pb-14 sm:min-h-0 sm:rounded-[16px] sm:border sm:border-[var(--color-border)] sm:pb-0 md:min-h-[calc(100vh-48px)] md:max-w-[960px] lg:max-w-[1040px]">
      {children}
    </div>
  );
}

type HeaderProps = {
  title: string;
  subtitle?: string;
  onPrev?: () => void;
  onNext?: () => void;
  onAdd?: () => void;
};

export function AppHeader({ title, subtitle, onPrev, onNext, onAdd }: HeaderProps) {
  return (
    <header className="flex w-full items-center justify-between gap-3 px-[18px] pb-3 pt-4 sm:pt-[18px]">
      <div className="min-w-0">
        <h1 className="truncate text-[22px] font-bold leading-7 tracking-[-0.35px] text-[var(--color-text-primary)]">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-0.5 truncate text-[12px] font-medium leading-4 text-[var(--color-text-tertiary)]">
            {subtitle}
          </p>
        )}
      </div>

      <div className="flex flex-shrink-0 items-center gap-1">
        {onPrev && (
          <button
            type="button"
            onClick={onPrev}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-gray-light)]"
            aria-label="上一周"
          >
            <ChevronLeft className="h-[18px] w-[18px]" />
          </button>
        )}
        {onNext && (
          <button
            type="button"
            onClick={onNext}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-gray-light)]"
            aria-label="下一周"
          >
            <ChevronRight className="h-[18px] w-[18px]" />
          </button>
        )}
        {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            className="ml-1 flex h-8 w-8 items-center justify-center rounded-[10px] bg-[var(--color-primary)] text-white transition-colors hover:bg-[#1D4ED8]"
            aria-label="新增任务"
          >
            <Plus className="h-[17px] w-[17px]" strokeWidth={2.2} />
          </button>
        )}
      </div>
    </header>
  );
}

export function ViewTabs({ value, onChange }: { value: ViewMode; onChange: (mode: ViewMode) => void }) {
  return (
    <nav className="flex h-9 w-full items-stretch border-b border-[var(--color-border)] px-[18px]" aria-label="视图切换">
      {TABS.map(([mode, label]) => (
        <button
          key={mode}
          type="button"
          onClick={() => onChange(mode)}
          className={[
            "relative flex flex-1 items-center justify-center text-[13px] transition-colors",
            value === mode
              ? "font-semibold text-[var(--color-text-primary)] after:absolute after:bottom-[-1px] after:h-0.5 after:w-5 after:rounded-full after:bg-[var(--color-primary)]"
              : "font-medium text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]",
          ].join(" ")}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}

type DateStripProps = {
  days: Date[];
  selectedDate: ISODate;
  today: ISODate;
  onSelect: (date: ISODate) => void;
};

export function WeekDateStrip({ days, selectedDate, today, onSelect }: DateStripProps) {
  return (
    <div className="flex w-full items-start px-3 py-2">
      {days.map((day) => {
        const iso = toISODate(day);
        const selected = iso === selectedDate;
        const isToday = iso === today;
        return (
          <button
            key={iso}
            type="button"
            onClick={() => onSelect(iso)}
            className="flex flex-1 flex-col items-center gap-1 py-0.5"
            aria-label={`${CN_WEEKDAY[day.getDay()]} ${day.getDate()}日`}
          >
            <span
              className={[
                "text-[10px] font-medium leading-3",
                selected || isToday ? "text-[var(--color-primary)]" : "text-[var(--color-text-tertiary)]",
              ].join(" ")}
            >
              {isToday ? "今天" : CN_WEEKDAY[day.getDay()].slice(1)}
            </span>
            <span
              className={[
                "flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-semibold tabular-nums transition-colors",
                selected
                  ? "bg-[var(--color-primary)] text-white"
                  : isToday
                    ? "bg-[var(--color-primary-light)] text-[var(--color-primary)]"
                    : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-gray-light)]",
              ].join(" ")}
            >
              {day.getDate()}
            </span>
          </button>
        );
      })}
    </div>
  );
}
