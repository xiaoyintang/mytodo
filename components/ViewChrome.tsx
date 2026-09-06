"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { ISODate, ViewMode } from "@/components/todo/types";
import { addDays, CN_WEEKDAY, parseISODate, startOfWeek, toISODate } from "@/components/todo/date";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Plus, X } from "lucide-react";

const TABS: Array<[ViewMode, string]> = [
  ["day", "今天"],
  ["week", "本周"],
  ["log", "记录"],
  ["habit", "习惯"],
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="workspace-view-enter flex min-h-full w-full max-w-[460px] flex-col overflow-hidden bg-white pb-14 sm:min-h-0 sm:rounded-[16px] sm:border sm:border-[var(--color-border)] sm:pb-0 md:min-h-[calc(100vh-48px)] md:max-w-[960px] lg:max-w-[1040px]">
      {children}
    </div>
  );
}

type HeaderProps = {
  title: string;
  subtitle?: string;
  onPrev?: () => void;
  onNext?: () => void;
  onToday?: () => void;
  onTitleClick?: () => void;
  onAdd?: () => void;
};

export function AppHeader({ title, subtitle, onPrev, onNext, onToday, onTitleClick, onAdd }: HeaderProps) {
  return (
    <header className="flex w-full items-center justify-between gap-3 px-[18px] pb-3 pt-4 sm:pt-[18px]">
      <div className="min-w-0">
        <h1 className="min-w-0 text-[22px] font-bold leading-7 tracking-[-0.35px] text-[var(--color-text-primary)]">
          {onTitleClick ? (
            <button
              type="button"
              onClick={onTitleClick}
              className="group flex min-w-0 items-center gap-1 rounded-md text-left outline-none transition-colors hover:text-[var(--color-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2"
              aria-label={`选择日期，当前为${title}`}
            >
              <span className="truncate" data-full-text={title}>{title}</span>
              <ChevronDown className="h-4 w-4 flex-shrink-0 text-[var(--color-text-tertiary)] transition-colors group-hover:text-[var(--color-primary)]" />
            </button>
          ) : (
            <span className="block truncate" data-full-text={title}>{title}</span>
          )}
        </h1>
        {subtitle && (
          <p
            className="mt-0.5 truncate text-[12px] font-medium leading-4 text-[var(--color-text-tertiary)]"
            data-full-text={subtitle}
          >
            {subtitle}
          </p>
        )}
      </div>

      <div className="flex flex-shrink-0 items-center gap-1">
        {onToday && (
          <button
            type="button"
            onClick={onToday}
            className="mr-1 flex h-8 items-center gap-1 rounded-lg border border-[var(--color-primary)] px-2 text-[11px] font-semibold text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary-light)]"
            aria-label="回到今天"
          >
            <CalendarDays className="h-3.5 w-3.5" />
            回今天
          </button>
        )}
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

type MonthDatePickerProps = {
  selectedDate: ISODate;
  today: ISODate;
  onSelect: (date: ISODate) => void;
  onClose: () => void;
};

export function MonthDatePicker({ selectedDate, today, onSelect, onClose }: MonthDatePickerProps) {
  const selected = parseISODate(selectedDate);
  const [visibleMonth, setVisibleMonth] = useState(
    () => new Date(selected.getFullYear(), selected.getMonth(), 1),
  );

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const monthStart = new Date(year, month, 1);
  const gridStart = startOfWeek(monthStart, true);
  const calendarDays = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));

  function moveMonth(offset: number) {
    setVisibleMonth(new Date(year, month + offset, 1));
  }

  function chooseDate(date: ISODate) {
    onSelect(date);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/20 p-0 sm:items-center sm:p-4"
      role="presentation"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="month-date-picker-title"
        className="w-full max-w-[380px] rounded-t-[20px] border border-[var(--color-border)] bg-white p-4 shadow-[0_18px_60px_rgba(15,23,42,0.2)] sm:rounded-[18px]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 id="month-date-picker-title" className="text-[16px] font-bold text-[var(--color-text-primary)]">
              跳到某一天
            </h2>
            <p className="mt-0.5 text-[11px] text-[var(--color-text-tertiary)]">跨周、跨月都可以直接选择</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-gray-light)]"
            aria-label="关闭日期选择"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() => moveMonth(-1)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-gray-light)]"
            aria-label="上个月"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-[14px] font-semibold tabular-nums text-[var(--color-text-primary)]">
            {year}年{month + 1}月
          </span>
          <button
            type="button"
            onClick={() => moveMonth(1)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-gray-light)]"
            aria-label="下个月"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-2 grid grid-cols-7 text-center">
          {["一", "二", "三", "四", "五", "六", "日"].map((weekday) => (
            <span key={weekday} className="py-1 text-[10px] font-medium text-[var(--color-text-tertiary)]">
              {weekday}
            </span>
          ))}
          {calendarDays.map((day) => {
            const iso = toISODate(day);
            const isSelected = iso === selectedDate;
            const isToday = iso === today;
            const isOutsideMonth = day.getMonth() !== month;
            return (
              <button
                key={iso}
                type="button"
                onClick={() => chooseDate(iso)}
                className="flex h-10 items-center justify-center rounded-lg"
                aria-label={`${day.getFullYear()}年${day.getMonth() + 1}月${day.getDate()}日${isToday ? "，今天" : ""}`}
                aria-current={isToday ? "date" : undefined}
              >
                <span
                  className={[
                    "flex h-8 w-8 items-center justify-center rounded-full text-[12px] font-semibold tabular-nums transition-colors",
                    isSelected
                      ? "bg-[var(--color-primary)] text-white shadow-sm"
                      : isToday
                        ? "border border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]"
                        : isOutsideMonth
                          ? "text-[var(--color-text-tertiary)] opacity-45 hover:bg-[var(--color-bg-gray-lighter)]"
                          : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-gray-light)]",
                  ].join(" ")}
                >
                  {day.getDate()}
                </span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => chooseDate(today)}
          className="mt-3 flex h-9 w-full items-center justify-center rounded-lg bg-[var(--color-primary-light)] text-[12px] font-semibold text-[var(--color-primary)] transition-colors hover:bg-[#DBEAFE]"
        >
          回到今天
        </button>
      </section>
    </div>
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
              ? "workspace-tab-active font-semibold text-[var(--color-text-primary)] after:absolute after:bottom-[-1px] after:h-0.5 after:w-5 after:rounded-full after:bg-[var(--color-primary)]"
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
