"use client";

import { useState, useEffect, useMemo, useRef, Fragment } from "react";
import type { Aspiration, DayPlan, EntryCategory, ISODate, Task, TimeEntry, ViewMode } from "@/components/todo/types";
import { CN_WEEKDAY, addDays, formatCNDateTitle, parseISODate, startOfWeek, toISODate } from "@/components/todo/date";
import { formatMinutes, matchTaskByTitle, timeToMinutes, minutesToTime } from "@/components/todo/time";
import { goalColor } from "@/components/todo/goal";
import { parseTimeEntries, type ParsedEntry } from "@/components/todo/nlparse";
import {
  CATEGORY_LIST,
  buildTitleCategoryMap,
  categoryOf,
  categoryStyle,
  ruleClassify,
} from "@/components/todo/category";
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Mic, Sparkles, Trash2, X, Check, Link2, Zap, Pencil, Copy, Undo2 } from "lucide-react";
import TimePicker from "@/components/TimePicker";
import ConfirmDialog from "@/components/ConfirmDialog";
import TimerPanel from "@/components/TimerPanel";
import MainlineBar from "@/components/MainlineBar";
import CategoryDonut, { type DonutSlice } from "@/components/CategoryDonut";
import GoalInvestChart from "@/components/GoalInvestChart";


type Props = {
  viewMode: ViewMode;
  onChangeViewMode: (mode: ViewMode) => void;
  selectedDate: ISODate;
  onSelectDate: (date: ISODate) => void;
  tasks: Task[];
  entries: TimeEntry[];
  onAddEntries: (entries: Omit<TimeEntry, "id">[]) => void;
  onDeleteEntry: (entryId: string) => void;
  onUpdateEntry: (entryId: string, updates: Partial<Omit<TimeEntry, "id">>) => void;
  onSetEntriesCategory: (entryIds: string[], category: EntryCategory) => void;
  onApplyCategories: (byTitle: Record<string, EntryCategory>) => void;
  onUndoEntries: () => void;
  canUndoEntries: boolean;
  /** 计时器提到 TodoApp 那层了（要进云同步），这里只用不建 */
  timer: {
    running: { title: string; startedAt: number } | null;
    elapsedMs: number;
    start: (title: string) => void;
    stop: () => void;
  };
  today: ISODate;
  aspirations: Aspiration[];
  dayPlans: Record<string, DayPlan>;
  onOpenGoals: () => void;
  running: { title: string; startedAt: number } | null;
  elapsedMs: number;
  onStopTimer: () => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
};

// 汇总里的一行：一个事项名 + 累计时长 + 它包含哪些记录（改分类时要一起改）
type SummaryRow = {
  name: string;
  minutes: number;
  ids: string[];
  category: EntryCategory | null;
};

const TABS: Array<{ mode: ViewMode; label: string }> = [
  { mode: "day", label: "日视图" },
  { mode: "week", label: "周视图" },
  { mode: "log", label: "记录" },
  { mode: "habit", label: "习惯" },
];

// AI 解析请求：8 秒超时 + 失败自动重试一次（应对 VPN 抽风）。返回 null 表示彻底失败（由调用方降级规则）。
async function fetchAIParse(text: string, now: string): Promise<ParsedEntry[] | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, now }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.status === 501) return null; // 没配 key，重试也没用
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.entries)) return data.entries;
      }
    } catch {
      // 超时 / 网络中断 → 进入下一次重试
    }
  }
  return null;
}

// 事项名 → 大类 AI 分类（只在关键词认不出来时调用）。失败返回 null，界面显示"未分类"。
async function fetchClassify(titles: string[]): Promise<Record<string, EntryCategory> | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch("/api/classify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titles }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    const map = data?.categories;
    if (!map || typeof map !== "object") return null;
    return map as Record<string, EntryCategory>;
  } catch {
    return null;
  }
}

export default function TimeLogView({
  viewMode,
  onChangeViewMode,
  selectedDate,
  onSelectDate,
  tasks,
  entries,
  onAddEntries,
  onDeleteEntry,
  onUpdateEntry,
  onSetEntriesCategory,
  onApplyCategories,
  onUndoEntries,
  canUndoEntries,
  timer,
  today,
  aspirations,
  dayPlans,
  onOpenGoals,
  running,
  elapsedMs,
  onStopTimer,
  onPrevWeek,
  onNextWeek,
}: Props) {
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<ParsedEntry[] | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseSource, setParseSource] = useState<"ai" | "rule" | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  // 台账行内编辑状态
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editMinutes, setEditMinutes] = useState("");
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [deleteEntryId, setDeleteEntryId] = useState<string | null>(null);
  const [copySourceId, setCopySourceId] = useState<string | null>(null); // 复制表单挂在哪条下面
  const [weekOpen, setWeekOpen] = useState(false); // 周汇总默认收起
  const [catEditing, setCatEditing] = useState<string | null>(null); // 正在改分类的汇总行（按事项名）
  const [goalEditing, setGoalEditing] = useState<string | null>(null); // 正在改归属目标的那条记录
  const classifyAskedRef = useRef<Set<string>>(new Set()); // 已问过 AI 的事项名，避免反复请求

  const todayISO = toISODate(new Date());

  const selected = parseISODate(selectedDate);
  const weekStart = startOfWeek(selected, true);
  const days = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));

  // 今日台账
  const dayEntries = entries
    .filter((e) => e.date === selectedDate)
    .slice()
    .sort((a, b) => (a.startTime ?? "99:99").localeCompare(b.startTime ?? "99:99"));
  const dayTotal = dayEntries.reduce((s, e) => s + e.minutes, 0);

  // 标题 → 大类 查表（手动改过的 > 已分类的同名记录 > 关键词规则）
  const titleCategory = useMemo(() => buildTitleCategoryMap(entries), [entries]);

  // 汇总辅助：按（关联任务标题 或 记录标题）聚合一组记录
  function aggregate(list: TimeEntry[]): SummaryRow[] {
    const map = new Map<string, SummaryRow>();
    for (const e of list) {
      const task = e.taskId ? tasks.find((t) => t.id === e.taskId) : undefined;
      const key = task?.title ?? e.title;
      const row = map.get(key) ?? { name: key, minutes: 0, ids: [], category: null };
      row.minutes += e.minutes;
      row.ids.push(e.id);
      if (!row.category) row.category = categoryOf(e, titleCategory);
      map.set(key, row);
    }
    return [...map.values()].sort((a, b) => b.minutes - a.minutes);
  }

  // 按大类汇总（正事/娱乐/休息/未分类），供环形图用；没时长的类不画
  function categorySlices(rows: SummaryRow[]): DonutSlice[] {
    const totals = new Map<EntryCategory | null, number>();
    for (const r of rows) totals.set(r.category, (totals.get(r.category) ?? 0) + r.minutes);
    const order: Array<EntryCategory | null> = [...CATEGORY_LIST, null];
    return order
      .filter((c) => (totals.get(c) ?? 0) > 0)
      .map((c) => ({
        label: c ?? "未分类",
        minutes: totals.get(c) ?? 0,
        color: categoryStyle(c).solid,
      }));
  }

  // 今日汇总
  const daySummary = aggregate(dayEntries);
  const dayMaxMinutes = daySummary.length > 0 ? daySummary[0].minutes : 0;
  const daySlices = categorySlices(daySummary);

  // 今日出现、但关键词规则也认不出来的事项名 → 交给 AI 分类（每个名字一个会话只问一次）
  const unknownTitles = useMemo(() => {
    const set = new Set<string>();
    for (const e of dayEntries) {
      const t = e.title.trim();
      if (t && !titleCategory.has(t) && !ruleClassify(t)) set.add(t);
    }
    return [...set];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, entries, titleCategory]);
  const unknownKey = unknownTitles.join("|");

  useEffect(() => {
    const todo = unknownTitles.filter((t) => !classifyAskedRef.current.has(t));
    if (todo.length === 0) return;
    todo.forEach((t) => classifyAskedRef.current.add(t));
    // 不做 cancel：分类结果写回是幂等的，晚到也照收（否则 StrictMode 双跑会把结果丢掉）
    void (async () => {
      const result = await fetchClassify(todo);
      if (result && Object.keys(result).length > 0) onApplyCategories(result);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unknownKey]);

  // 本周汇总：按（关联任务标题 或 记录标题）聚合
  const weekEnd = addDays(weekStart, 6);
  const weekEntries = entries.filter((e) => {
    const d = parseISODate(e.date);
    return d >= weekStart && d <= weekEnd;
  });
  const weekTotal = weekEntries.reduce((s, e) => s + e.minutes, 0);
  const summary = aggregate(weekEntries);
  const maxMinutes = summary.length > 0 ? summary[0].minutes : 0;
  const weekSlices = categorySlices(summary);

  // 识别"现在开始 X"（启动计时）与"停/结束"（停止计时）指令。命中即处理并返回 true。
  function handleTimerCommand(text: string): boolean {
    const t = text.trim();

    // 停止：短停止词
    if (/^(停|停下|停止|结束|结束了|停了|收工|停止计时|结束计时)$/.test(t)) {
      if (timer.running) {
        timer.stop();
        setInput("");
        setParseError(null);
      } else {
        setParseError("现在没有正在进行的计时");
      }
      return true;
    }

    // 开始：两种说法都认
    //   ① "（现在/马上）开始 X" —— 带"开始"两个字
    //   ② "现在 X" / "这就 X" —— 口语里常常省掉"开始"，说"现在养号"就是要开始计时
    // ② 必须有"现在/这就/马上"打头，不然"复盘面试"这种纯补记会被误当成开始计时。
    // 两种都排除 X 里带时长/时刻的（那是补记，交给正常解析）。
    const m =
      t.match(/^(?:现在|这就|马上|准备|等下|等一下)?\s*开始\s*(.+)$/) ??
      t.match(/^(?:现在|这就|马上)\s*(.+)$/);
    if (m) {
      const title = m[1].trim().replace(/[了吧啦。.!！,，、\s]+$/g, "").trim();
      const hasTimeToken = /[:：]|\d\s*点|\d\s*时|分钟|小时|钟头|半小时|个半|\d+\s*分/.test(title);
      if (title && !hasTimeToken) {
        if (selectedDate !== todayISO) {
          setParseError("计时从现在开始，请先切回今天再说「现在 X」");
        } else if (timer.running) {
          setParseError(`已经在计时「${timer.running.title}」，先停止再开始新的`);
        } else {
          timer.start(title);
          setInput("");
          setParseError(null);
        }
        return true;
      }
    }
    return false;
  }

  // useAI=false 走本地规则解析（零延迟）；useAI=true 走 /api/parse，失败时降级规则
  async function handleParse(useAI: boolean) {
    const text = input.trim();
    if (!text || parsing) return;
    if (handleTimerCommand(text)) return; // 计时开始/停止指令：拦截，不走时间记录解析
    setParsing(true);
    setParseError(null);
    setPending(null);

    let parsed: ParsedEntry[] | null = null;
    let source: "ai" | "rule" = "rule";

    if (useAI) {
      const d = new Date();
      const now = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      const aiResult = await fetchAIParse(text, now);
      if (aiResult) {
        parsed = aiResult;
        source = "ai";
      } else {
        setParseError("AI 解析不可用（网络不稳），已改用规则解析");
      }
    }

    if (!parsed) {
      parsed = parseTimeEntries(text);
    }

    setParsing(false);
    setParseSource(source);
    if (parsed.length === 0) {
      setParseError('没识别出时间记录。试试"背单词40分钟""刚才复盘面试30分钟"，或"现在养号"启动计时');
      return;
    }
    setPending(parsed);
  }

  function handleConfirm() {
    if (!pending || pending.length === 0) return;
    onAddEntries(
      pending.map((p) => {
        const matched = matchTaskByTitle(p.title, selectedDate, tasks);
        return {
          date: selectedDate,
          title: p.title,
          minutes: p.minutes,
          startTime: p.startTime,
          endTime: p.endTime,
          taskId: matched?.id,
        };
      }),
    );
    setPending(null);
    setInput("");
    setParseSource(null);
  }

  function removePending(index: number) {
    if (!pending) return;
    const next = pending.filter((_, i) => i !== index);
    setPending(next.length > 0 ? next : null);
  }

  function handleConfirmDeleteEntry() {
    if (!deleteEntryId) return;
    onDeleteEntry(deleteEntryId);
    if (editingId === deleteEntryId) setEditingId(null);
    setDeleteEntryId(null);
  }

  function startEditEntry(e: TimeEntry) {
    setEditingId(e.id);
    setEditTitle(e.title);
    setEditMinutes(String(e.minutes));
    setEditStart(e.startTime ?? "");
    setEditEnd(e.endTime ?? "");
  }

  // 修改起止时间后，若两端齐全则自动算出时长（仍可手动改）
  function handleEditTime(which: "start" | "end", value: string) {
    const start = which === "start" ? value : editStart;
    const end = which === "end" ? value : editEnd;
    if (which === "start") setEditStart(value);
    else setEditEnd(value);
    if (start && end) {
      const diff = timeToMinutes(end) - timeToMinutes(start);
      if (diff > 0) setEditMinutes(String(diff));
    }
  }

  // 修改时长后，若有开始时间则结束时间自动跟着挪（开始 + 时长）
  function handleEditMinutes(value: string) {
    setEditMinutes(value);
    const m = Math.round(Number(value));
    if (editStart && Number.isFinite(m) && m > 0) {
      const newEnd = minutesToTime(timeToMinutes(editStart) + m);
      setEditEnd(newEnd ?? "");
    }
  }

  function saveEditEntry(e: TimeEntry) {
    const title = editTitle.trim();
    const minutes = Math.round(Number(editMinutes));
    if (!title || !Number.isFinite(minutes) || minutes <= 0) return;
    // 标题变了就重新匹配任务关联；没变则保留原关联
    const taskId = title === e.title ? e.taskId : matchTaskByTitle(title, e.date, tasks)?.id;
    onUpdateEntry(e.id, {
      title,
      minutes,
      startTime: editStart || undefined,
      endTime: editEnd || undefined,
      taskId,
    });
    setEditingId(null);
  }

  // 复制：照着某笔再记一次（沿用同一个名字 → 汇总能合并），时长清空由你重填
  function startCopyEntry(e: TimeEntry) {
    const d = new Date();
    setCopySourceId(e.id); // 让新建表单出现在这条下面
    setEditingId("__new__");
    setEditTitle(e.title);
    setEditStart(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
    setEditEnd("");
    setEditMinutes("");
  }

  function saveNewEntry() {
    const title = editTitle.trim();
    const minutes = Math.round(Number(editMinutes));
    if (!title || !Number.isFinite(minutes) || minutes <= 0) return;
    onAddEntries([
      {
        date: selectedDate,
        title,
        minutes,
        startTime: editStart || undefined,
        endTime: editEnd || undefined,
        taskId: matchTaskByTitle(title, selectedDate, tasks)?.id,
      },
    ]);
    setEditingId(null);
  }

  // 台账条目编辑表单（新建/编辑共用），onSave 决定是新增还是更新
  function renderEntryEditor(onSave: () => void) {
    const canSave = editTitle.trim() !== "" && Number(editMinutes) > 0;
    return (
      <div className="w-full flex flex-col gap-2 px-3.5 py-3 rounded-[10px] bg-[var(--color-bg-gray-lighter)] border-[1.5px] border-[var(--color-primary)]">
        <input
          type="text"
          value={editTitle}
          onChange={(ev) => setEditTitle(ev.target.value)}
          placeholder="事项名称"
          className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] text-[14px] bg-white focus:outline-none focus:border-[var(--color-primary)]"
        />
        <div className="flex items-center gap-2">
          <TimePicker value={editStart} onChange={(v) => handleEditTime("start", v)} placeholder="开始" label="开始时间" />
          <span className="text-[13px] text-[var(--color-text-tertiary)]">—</span>
          <TimePicker value={editEnd} onChange={(v) => handleEditTime("end", v)} placeholder="结束" label="结束时间" />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={editMinutes}
            onChange={(ev) => handleEditMinutes(ev.target.value)}
            placeholder="时长"
            className="w-[100px] px-3 py-2 rounded-lg border border-[var(--color-border)] text-[13px] bg-white focus:outline-none focus:border-[var(--color-primary)]"
          />
          <span className="text-[13px] text-[var(--color-text-secondary)]">分钟</span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => setEditingId(null)}
            className="px-3 py-1.5 text-[12px] text-[var(--color-text-secondary)] hover:bg-white rounded transition-colors"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!canSave}
            className={[
              "px-4 py-1.5 text-[12px] rounded font-medium transition-colors",
              canSave
                ? "bg-[var(--color-primary)] text-white hover:bg-[#1d4ed8]"
                : "bg-[var(--color-bg-gray-light)] text-[var(--color-text-tertiary)] cursor-not-allowed",
            ].join(" ")}
          >
            保存
          </button>
        </div>
      </div>
    );
  }

  // 汇总里的一行：事项名 + 分类标签（可点着改）+ 时长 + 按类别上色的条形
  function renderSummaryRow(row: SummaryRow, maxOfList: number, isToday: boolean) {
    const st = categoryStyle(row.category);
    const editKey = `${isToday ? "d" : "w"}:${row.name}`;
    const open = catEditing === editKey;
    return (
      <div key={row.name} className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-[var(--color-text-primary)] truncate">{row.name}</span>
          <button
            type="button"
            onClick={() => setCatEditing(open ? null : editKey)}
            className="flex-shrink-0 px-1.5 py-[1px] rounded border text-[10px] font-medium leading-[16px]"
            style={{ backgroundColor: st.bg, borderColor: st.border, color: st.text }}
            title="点一下改分类"
          >
            {row.category ?? "未分类"}
          </button>
          <div className="flex-1" />
          <span className="text-[12px] font-medium text-[var(--color-text-secondary)] flex-shrink-0">
            {formatMinutes(row.minutes)}
          </span>
        </div>
        <div className="w-full h-[8px] rounded-full bg-[var(--color-bg-gray-light)] overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.max(4, Math.round((row.minutes / maxOfList) * 100))}%`,
              backgroundColor: st.solid,
            }}
          />
        </div>
        {open && (
          <div className="flex items-center gap-1.5 pt-1">
            <span className="text-[11px] text-[var(--color-text-tertiary)]">归为</span>
            {CATEGORY_LIST.map((c) => {
              const cs = categoryStyle(c);
              const active = row.category === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    onSetEntriesCategory(row.ids, c);
                    setCatEditing(null);
                  }}
                  className="px-2.5 py-1 rounded-md border text-[12px] font-medium transition-colors"
                  style={{
                    backgroundColor: active ? cs.solid : cs.bg,
                    borderColor: active ? cs.solid : cs.border,
                    color: active ? "#fff" : cs.text,
                  }}
                >
                  {c}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  function entryTimeLabel(e: { startTime?: string; endTime?: string }): string {
    if (e.startTime && e.endTime) return `${e.startTime} - ${e.endTime}`;
    if (e.startTime) return e.startTime;
    return "补记";
  }

  return (
    <div className="w-[420px] bg-[var(--color-bg-white)] flex flex-col rounded-[16px] overflow-hidden border border-[var(--color-border)]">
      {/* Header */}
      <div className="w-full flex items-center justify-between px-6 pt-6 pb-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-[var(--color-text-primary)] text-[28px] font-bold tracking-[-0.5px]">
            时间记录
          </h1>
          <p className="text-[var(--color-text-secondary)] text-[14px] font-medium">
            {formatCNDateTitle(selected)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onPrevWeek}
            className="w-9 h-9 rounded-lg border-[1.5px] border-[var(--color-border)] flex items-center justify-center bg-white hover:bg-[var(--color-bg-gray-light)] transition-colors"
            aria-label="上一周"
          >
            <ChevronLeft className="w-4 h-4 text-[var(--color-text-secondary)]" />
          </button>
          <button
            type="button"
            onClick={onNextWeek}
            className="w-9 h-9 rounded-lg border-[1.5px] border-[var(--color-border)] flex items-center justify-center bg-white hover:bg-[var(--color-bg-gray-light)] transition-colors"
            aria-label="下一周"
          >
            <ChevronRight className="w-4 h-4 text-[var(--color-text-secondary)]" />
          </button>
        </div>
      </div>

      <MainlineBar
        today={today}
        aspirations={aspirations}
        dayPlans={dayPlans}
        onOpenGoals={onOpenGoals}
        running={running}
        elapsedMs={elapsedMs}
        onStopTimer={onStopTimer}
      />

      {/* Tabs + Date Picker */}
      <div className="w-full flex flex-col gap-4 px-6 pt-4">
        <div className="w-full flex gap-1 bg-[var(--color-bg-gray-light)] rounded-[10px] p-1">
          {TABS.map((tab) => (
            <button
              key={tab.mode}
              type="button"
              onClick={() => onChangeViewMode(tab.mode)}
              className={[
                "flex-1 flex items-center justify-center rounded-lg px-2 py-[10px] transition-colors",
                viewMode === tab.mode
                  ? "bg-[var(--color-bg-white)] shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
                  : "hover:bg-white/60",
              ].join(" ")}
            >
              <span
                className={[
                  "text-[14px]",
                  viewMode === tab.mode
                    ? "text-[var(--color-text-primary)] font-semibold"
                    : "text-[var(--color-text-secondary)] font-medium",
                ].join(" ")}
              >
                {tab.label}
              </span>
            </button>
          ))}
        </div>

        <div className="w-full flex items-center justify-between">
          {days.map((d) => {
            const iso = toISODate(d);
            const isSelected = iso === selectedDate;
            const isToday = iso === toISODate(new Date());
            return (
              <button
                key={iso}
                type="button"
                onClick={() => onSelectDate(iso)}
                className={[
                  "flex flex-col items-center gap-[6px] px-3 py-2 rounded-[12px]",
                  isSelected ? "bg-[var(--color-primary)]" : isToday ? "bg-[var(--color-primary-light)]" : "",
                ].join(" ")}
              >
                <span
                  className={[
                    "text-[12px] font-medium",
                    isSelected
                      ? "text-[var(--color-bg-white)] font-semibold"
                      : isToday
                        ? "text-[var(--color-primary)] font-semibold"
                        : "text-[var(--color-text-tertiary)]",
                  ].join(" ")}
                >
                  {isToday ? "今天" : CN_WEEKDAY[d.getDay()]}
                </span>
                <span
                  className={[
                    "text-[16px] font-semibold",
                    isSelected
                      ? "text-[var(--color-bg-white)] font-bold"
                      : isToday
                        ? "text-[var(--color-primary)] font-bold"
                        : "text-[var(--color-text-secondary)]",
                  ].join(" ")}
                >
                  {d.getDate()}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="w-full flex flex-col gap-6 px-6 pt-4 pb-6">
        {/* 计时器（今天可开始；有计时在跑时始终显示，保证能停止） */}
        {(selectedDate === todayISO || timer.running) && (
          <TimerPanel
            running={timer.running}
            elapsedMs={timer.elapsedMs}
            onStart={timer.start}
            onStop={timer.stop}
          />
        )}

        {/* 快速记录 */}
        <div className="w-full flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Mic className="w-4 h-4 text-[var(--color-primary)]" />
            <span className="text-[var(--color-text-primary)] text-[16px] font-semibold">记一笔</span>
            <span className="text-[var(--color-text-tertiary)] text-[12px]">回车解析 · Shift+回车换行 · 可语音</span>
          </div>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // 回车提交解析；Shift+回车换行；输入法组字中的回车（选字）不算提交
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (input.trim() && !parsing) handleParse(true);
              }
            }}
            placeholder="口述或输入：现在养号（开始计时）、刚才复盘面试30分钟、9点到10点做数学"
            enterKeyHint="send"
            rows={2}
            className="w-full px-3 py-2.5 rounded-[10px] border border-[var(--color-border)] text-[14px] leading-relaxed placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] resize-none"
          />
          {parseError && (
            <p className="text-[12px] text-[var(--color-danger)]">{parseError}</p>
          )}

          {/* 解析预览 */}
          {pending ? (
            <div className="flex flex-col gap-2 p-3 rounded-[10px] bg-[var(--color-bg-gray-lighter)] border border-[var(--color-border)]">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                <span className="text-[12px] font-medium text-[var(--color-text-secondary)]">
                  识别出 {pending.length} 笔记录{parseSource === "rule" ? "（规则解析）" : ""}，确认后计入
                </span>
              </div>
              {pending.map((p, i) => {
                const matched = matchTaskByTitle(p.title, selectedDate, tasks);
                return (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-[var(--color-border)]">
                    <div className="flex-1 flex flex-col min-w-0">
                      <span className="text-[13px] font-medium text-[var(--color-text-primary)] truncate">{p.title}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-[var(--color-text-tertiary)]">{entryTimeLabel(p)}</span>
                        <span className="text-[11px] font-medium text-[var(--color-primary)]">{formatMinutes(p.minutes)}</span>
                        {matched && (
                          <span className="flex items-center gap-0.5 text-[10px] text-[var(--color-success)]">
                            <Link2 className="w-3 h-3" />
                            {matched.title}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removePending(i)}
                      className="w-6 h-6 flex items-center justify-center flex-shrink-0"
                    >
                      <X className="w-4 h-4 text-[var(--color-text-tertiary)]" />
                    </button>
                  </div>
                );
              })}
              <div className="flex justify-end gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => setPending(null)}
                  className="px-3 py-1.5 text-[12px] text-[var(--color-text-secondary)] hover:bg-white rounded transition-colors"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  className="flex items-center gap-1 px-4 py-1.5 text-[12px] bg-[var(--color-primary)] text-white rounded hover:bg-[#1d4ed8] transition-colors font-medium"
                >
                  <Check className="w-3.5 h-3.5" />
                  确认记录
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleParse(false)}
                disabled={!input.trim() || parsing}
                className={[
                  "flex-1 flex items-center justify-center gap-1.5 rounded-[10px] py-2.5 text-[14px] font-semibold border transition-colors",
                  input.trim() && !parsing
                    ? "bg-white border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-[var(--color-primary-light)]"
                    : "bg-[var(--color-bg-gray-light)] border-transparent text-[var(--color-text-tertiary)] cursor-not-allowed",
                ].join(" ")}
              >
                <Zap className="w-4 h-4" />
                快速解析
              </button>
              <button
                type="button"
                onClick={() => handleParse(true)}
                disabled={!input.trim() || parsing}
                className={[
                  "flex-1 flex items-center justify-center gap-1.5 rounded-[10px] py-2.5 text-[14px] font-semibold transition-colors",
                  input.trim() && !parsing
                    ? "bg-[var(--color-primary)] text-white hover:bg-[#1d4ed8]"
                    : "bg-[var(--color-bg-gray-light)] text-[var(--color-text-tertiary)] cursor-not-allowed",
                ].join(" ")}
              >
                <Sparkles className="w-4 h-4" />
                {parsing ? "解析中..." : "AI 解析"}
              </button>
            </div>
          )}
        </div>

        {/* 今日台账 */}
        <div className="w-full flex flex-col gap-3">
          <div className="w-full flex items-center justify-between">
            <span className="text-[var(--color-text-primary)] text-[16px] font-semibold">今日台账</span>
            <div className="flex items-center gap-2">
              {canUndoEntries && (
                <button
                  type="button"
                  onClick={onUndoEntries}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[12px] font-semibold text-[var(--color-primary)] hover:bg-[var(--color-primary-light)] transition-colors"
                  aria-label="撤回上一步改动"
                  title="撤回上一步（编辑 / 删除 / 新增都能退回）"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  撤回
                </button>
              )}
              <span className="text-[var(--color-text-tertiary)] text-[13px] font-medium">
                {dayEntries.length > 0 ? `${dayEntries.length} 笔 · 共 ${formatMinutes(dayTotal)}` : "暂无记录"}
              </span>
            </div>
          </div>
          {dayEntries.length > 0 && (
            <div className="w-full flex flex-col gap-2">
              {dayEntries.map((e) => {
                const task = e.taskId ? tasks.find((t) => t.id === e.taskId) : undefined;

                if (editingId === e.id) {
                  return <div key={e.id}>{renderEntryEditor(() => saveEditEntry(e))}</div>;
                }

                const composingHere = editingId === "__new__" && copySourceId === e.id;

                return (
                  <Fragment key={e.id}>
                    <div className="w-full flex items-center gap-2.5 px-3.5 py-3 rounded-[10px] bg-white border border-[var(--color-border)]">
                      <span className="w-[80px] flex-shrink-0 text-[12px] font-medium text-[var(--color-text-tertiary)]">
                        {entryTimeLabel(e)}
                      </span>
                      <div className="flex-1 flex flex-col gap-0.5 min-w-0">
                        <span className="text-[14px] font-medium text-[var(--color-text-primary)] truncate">
                          {e.title}
                        </span>
                        <span className="flex items-center gap-2 flex-wrap">
                          {task && (
                            <span className="flex items-center gap-0.5 text-[10px] text-[var(--color-success)]">
                              <Link2 className="w-3 h-3" />
                              计入「{task.title}」
                            </span>
                          )}
                          {/* 归属目标：创建时从 task/habit 复制来的，这里可以点着改 */}
                          {aspirations.length > 0 && (() => {
                            const gi = aspirations.findIndex((a) => a.id === e.aspirationId);
                            const c = gi >= 0 ? goalColor(aspirations[gi], gi) : "#A1A1AA";
                            return (
                              <button
                                type="button"
                                onClick={() => setGoalEditing(goalEditing === e.id ? null : e.id)}
                                className="flex items-center gap-1 rounded px-1.5 py-[1px] text-[10px] font-medium"
                                style={{
                                  backgroundColor: gi >= 0 ? `${c}14` : "var(--color-bg-gray-light)",
                                  color: gi >= 0 ? c : "var(--color-text-tertiary)",
                                }}
                                title="算哪个目标的投入？点一下改"
                              >
                                <span
                                  className="w-1.5 h-1.5 rounded-full"
                                  style={{ backgroundColor: c }}
                                />
                                {gi >= 0 ? aspirations[gi].title : "没归属"}
                              </button>
                            );
                          })()}
                        </span>
                      </div>
                      <span className="text-[13px] font-semibold text-[var(--color-primary)] flex-shrink-0">
                        {formatMinutes(e.minutes)}
                      </span>
                      <button
                        type="button"
                        onClick={() => startCopyEntry(e)}
                        className="w-[18px] h-[18px] flex items-center justify-center flex-shrink-0"
                        aria-label="再记一次"
                      >
                        <Copy className="w-[15px] h-[15px] text-[#A1A1AA]" />
                      </button>
                      <button
                        type="button"
                        onClick={() => startEditEntry(e)}
                        className="w-[18px] h-[18px] flex items-center justify-center flex-shrink-0"
                      >
                        <Pencil className="w-[16px] h-[16px] text-[#A1A1AA]" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteEntryId(e.id)}
                        className="w-[18px] h-[18px] flex items-center justify-center flex-shrink-0"
                      >
                        <Trash2 className="w-[16px] h-[16px] text-[#A1A1AA]" />
                      </button>
                    </div>
                    {/* 改归属目标：就地展开，改完立刻收起 */}
                    {goalEditing === e.id && (
                      <div className="w-full flex items-center gap-1.5 flex-wrap px-3.5 pb-1">
                        <span className="text-[10px] text-[var(--color-text-tertiary)]">算给</span>
                        {aspirations.map((a, i) => {
                          const on = e.aspirationId === a.id;
                          const c = goalColor(a, i);
                          return (
                            <button
                              key={a.id}
                              type="button"
                              onClick={() => {
                                onUpdateEntry(e.id, { aspirationId: on ? undefined : a.id });
                                setGoalEditing(null);
                              }}
                              className="px-2 py-[3px] rounded-md border text-[10px] font-medium max-w-full truncate"
                              style={{
                                backgroundColor: on ? c : "#fff",
                                borderColor: c,
                                color: on ? "#fff" : c,
                              }}
                            >
                              {a.title}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* 复制表单：直接出现在被复制那条下面 */}
                    {composingHere && renderEntryEditor(saveNewEntry)}
                  </Fragment>
                );
              })}
            </div>
          )}
        </div>

        {/* 今日汇总（默认展开，天天看） */}
        {daySummary.length > 0 && (
          <div className="w-full flex flex-col gap-3">
            <div className="w-full flex items-center justify-between">
              <span className="text-[var(--color-text-primary)] text-[16px] font-semibold">今日汇总</span>
              <span className="text-[var(--color-text-tertiary)] text-[13px] font-medium">共 {formatMinutes(dayTotal)}</span>
            </div>
            <CategoryDonut slices={daySlices} total={dayTotal} />

            <div className="w-full flex flex-col gap-2.5">
              {daySummary.map((row) => renderSummaryRow(row, dayMaxMinutes, true))}
            </div>
          </div>
        )}

        {/* 本周汇总（默认收起，点开才看） */}
        <div className="w-full flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setWeekOpen((v) => !v)}
            className="w-full flex items-center justify-between"
          >
            <span className="flex items-center gap-1 text-[var(--color-text-primary)] text-[16px] font-semibold">
              本周汇总
              {weekOpen ? (
                <ChevronUp className="w-4 h-4 text-[var(--color-text-tertiary)]" />
              ) : (
                <ChevronDown className="w-4 h-4 text-[var(--color-text-tertiary)]" />
              )}
            </span>
            <span className="text-[var(--color-text-tertiary)] text-[13px] font-medium">
              {weekEntries.length > 0 ? `共 ${formatMinutes(weekTotal)}` : "暂无记录"}
            </span>
          </button>
          {weekOpen && (
            <GoalInvestChart
              weekDates={days.map((d) => toISODate(d) as ISODate)}
              entries={entries}
              aspirations={aspirations}
              dayPlans={dayPlans}
            />
          )}

          {weekOpen && summary.length > 0 && (
            <>
              <CategoryDonut slices={weekSlices} total={weekTotal} />
              <div className="w-full flex flex-col gap-2.5">
                {summary.map((row) => renderSummaryRow(row, maxMinutes, false))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* 删除记录二次确认 */}
      <ConfirmDialog
        isOpen={deleteEntryId !== null}
        title="删除这笔记录？"
        description={(() => {
          const target = deleteEntryId ? entries.find((e) => e.id === deleteEntryId) : undefined;
          return target ? `删除「${target.title} · ${formatMinutes(target.minutes)}」，删错了可点台账上的「撤回」找回` : undefined;
        })()}
        onConfirm={handleConfirmDeleteEntry}
        onCancel={() => setDeleteEntryId(null)}
      />
    </div>
  );
}
