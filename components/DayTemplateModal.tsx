"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarPlus,
  Check,
  ChevronLeft,
  Clock3,
  CopyPlus,
  LayoutTemplate,
  ListChecks,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import ConfirmDialog from "@/components/ConfirmDialog";
import type {
  Aspiration,
  GoalResult,
  ISODate,
  Task,
  TaskTemplate,
  TaskTemplateItem,
} from "@/components/todo/types";
import { CN_WEEKDAY, parseISODate } from "@/components/todo/date";
import { formatMinutes } from "@/components/todo/time";
import { templateItemAlreadyExists } from "@/components/todo/taskTemplate";

type Props = {
  isOpen: boolean;
  date: ISODate;
  tasks: Task[];
  templates: TaskTemplate[];
  aspirations: Aspiration[];
  goalResults: GoalResult[];
  onClose: () => void;
  onCreate: (name: string, taskIds: string[]) => string | null;
  onDelete: (templateId: string) => void;
  onApply: (
    templateId: string,
    itemIds: string[],
    date: ISODate,
  ) => { created: number; skipped: number };
};

function dateLabel(date: ISODate) {
  const value = parseISODate(date);
  return `${value.getMonth() + 1}月${value.getDate()}日 · ${CN_WEEKDAY[value.getDay()]}`;
}

function taskTimeLabel(task: Pick<Task, "startTime" | "endTime" | "targetMinutes">) {
  if (task.targetMinutes) return `投入 ${formatMinutes(task.targetMinutes)}`;
  if (task.startTime && task.endTime) return `${task.startTime}–${task.endTime}`;
  return task.startTime || "不限时段";
}

function defaultTemplateName(date: ISODate, existing: TaskTemplate[]) {
  const day = parseISODate(date).getDay();
  const base = day === 0 || day === 6 ? "周末模板" : "工作日模板";
  if (!existing.some((template) => template.name === base)) return base;
  let index = 2;
  while (existing.some((template) => template.name === `${base} ${index}`)) index += 1;
  return `${base} ${index}`;
}

export default function DayTemplateModal({
  isOpen,
  date,
  tasks,
  templates,
  aspirations,
  goalResults,
  onClose,
  onCreate,
  onDelete,
  onApply,
}: Props) {
  const dayTasks = useMemo(
    () =>
      tasks
        .filter((task) => task.date === date)
        .slice()
        .sort((a, b) => (a.startTime ?? "99:99").localeCompare(b.startTime ?? "99:99")),
    [date, tasks],
  );
  const [mode, setMode] = useState<"library" | "create">("library");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedApplyIds, setSelectedApplyIds] = useState<Set<string>>(new Set());
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [templateName, setTemplateName] = useState("");
  const [notice, setNotice] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const selectedTemplate =
    templates.find((template) => template.id === selectedTemplateId) ?? templates[0] ?? null;

  useEffect(() => {
    if (!isOpen) return;
    const first = templates[0] ?? null;
    setSelectedTemplateId(first?.id ?? null);
    setMode(first ? "library" : dayTasks.length > 0 ? "create" : "library");
    setTemplateName(defaultTemplateName(date, templates));
    setSelectedTaskIds(new Set(dayTasks.map((task) => task.id)));
    setSelectedApplyIds(
      new Set(
        first?.items
          .filter((item) => !templateItemAlreadyExists(item, date, tasks))
          .map((item) => item.id) ?? [],
      ),
    );
    setNotice("");
    setDeleteId(null);
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedTemplate) return;
    setSelectedApplyIds(
      new Set(
        selectedTemplate.items
          .filter((item) => !templateItemAlreadyExists(item, date, tasks))
          .map((item) => item.id),
      ),
    );
    setNotice("");
  }, [date, selectedTemplate?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null;

  function goalPath(item: Pick<TaskTemplateItem, "aspirationId" | "resultId">) {
    const goal = aspirations.find((aspiration) => aspiration.id === item.aspirationId);
    const result = goalResults.find(
      (candidate) =>
        candidate.id === item.resultId && candidate.aspirationId === item.aspirationId,
    );
    return [goal?.title, result?.title].filter(Boolean).join(" › ");
  }

  function toggleApply(item: TaskTemplateItem) {
    if (!selectedTemplate) return;
    if (templateItemAlreadyExists(item, date, tasks)) return;
    setSelectedApplyIds((current) => {
      const next = new Set(current);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
    setNotice("");
  }

  function toggleSourceTask(taskId: string) {
    setSelectedTaskIds((current) => {
      const next = new Set(current);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  function chooseTemplate(template: TaskTemplate) {
    setSelectedTemplateId(template.id);
    setMode("library");
  }

  function handleApply() {
    if (!selectedTemplate || selectedApplyIds.size === 0) return;
    const result = onApply(selectedTemplate.id, Array.from(selectedApplyIds), date);
    setSelectedApplyIds(new Set());
    setNotice(
      result.created > 0
        ? `已加入 ${result.created} 项${result.skipped ? `，跳过 ${result.skipped} 项重复任务` : ""}`
        : "这些项目已经在当天了",
    );
  }

  function handleCreate() {
    const name = templateName.trim();
    if (!name || selectedTaskIds.size === 0) return;
    const id = onCreate(name, Array.from(selectedTaskIds));
    if (!id) return;
    setSelectedTemplateId(id);
    setMode("library");
    setNotice(`“${name}”已保存，以后可以直接套用`);
  }

  const deleteTemplate = templates.find((template) => template.id === deleteId);

  return (
    <>
      <div className="fixed inset-0 z-[110] flex items-end justify-center sm:items-center sm:px-6">
        <button
          type="button"
          aria-label="关闭日计划模板"
          className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
          onClick={onClose}
        />
        <section
          role="dialog"
          aria-modal="true"
          aria-label="日计划模板"
          data-no-tab-swipe
          className="relative flex max-h-[88vh] w-full max-w-[660px] flex-col overflow-hidden rounded-t-[20px] bg-white shadow-[0_-8px_32px_rgba(15,23,42,0.16)] sm:rounded-[18px] sm:border sm:border-[var(--color-border)] sm:shadow-[0_16px_48px_rgba(15,23,42,0.18)]"
        >
          <header className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] px-5 py-4 sm:px-6">
            <div className="flex min-w-0 items-start gap-3">
              {mode === "create" && templates.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setMode("library")}
                  className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-gray-light)]"
                  aria-label="返回模板列表"
                >
                  <ChevronLeft className="h-[18px] w-[18px]" />
                </button>
              ) : (
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] bg-[var(--color-primary-light)] text-[var(--color-primary)]">
                  <LayoutTemplate className="h-[18px] w-[18px]" />
                </span>
              )}
              <div className="min-w-0">
                <h2 className="text-[17px] font-semibold text-[var(--color-text-primary)]">
                  {mode === "create" ? "保存为日计划模板" : "日计划模板"}
                </h2>
                <p className="mt-0.5 text-[11px] leading-4 text-[var(--color-text-tertiary)]">
                  {mode === "create"
                    ? `从 ${dateLabel(date)} 的任务中选择`
                    : `${dateLabel(date)} · 按需选择，不经过焦点地图`}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-gray-light)]"
              aria-label="关闭"
            >
              <X className="h-[18px] w-[18px]" />
            </button>
          </header>

          {mode === "create" ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-4 sm:px-6">
              <label className="text-[11px] font-medium text-[var(--color-text-secondary)]">
                模板名称
              </label>
              <input
                autoFocus
                value={templateName}
                onChange={(event) => setTemplateName(event.target.value)}
                placeholder="例如：工作日、周末、轻量日"
                className="mt-1.5 h-10 rounded-lg border border-[var(--color-border)] px-3 text-[13px] outline-none placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]"
              />

              <div className="mt-5 flex items-center justify-between">
                <span className="text-[12px] font-semibold text-[var(--color-text-primary)]">
                  选择要保留的任务
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setSelectedTaskIds(
                      selectedTaskIds.size === dayTasks.length
                        ? new Set()
                        : new Set(dayTasks.map((task) => task.id)),
                    )
                  }
                  className="text-[11px] font-medium text-[var(--color-primary)]"
                >
                  {selectedTaskIds.size === dayTasks.length ? "取消全选" : "全选"}
                </button>
              </div>

              <div className="mt-2 divide-y divide-[var(--color-border)] rounded-xl border border-[var(--color-border)]">
                {dayTasks.map((task) => {
                  const checked = selectedTaskIds.has(task.id);
                  const path = goalPath(task);
                  return (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => toggleSourceTask(task.id)}
                      className="flex w-full items-start gap-3 px-3 py-3 text-left hover:bg-[var(--color-bg-gray-lighter)]"
                    >
                      <span
                        className={[
                          "mt-0.5 flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-[5px] border transition-colors",
                          checked
                            ? "border-[var(--color-primary)] bg-[var(--color-primary)]"
                            : "border-[var(--color-border)] bg-white",
                        ].join(" ")}
                      >
                        {checked && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-[var(--color-text-primary)]" data-full-text={task.title}>
                          {task.title}
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-[var(--color-text-tertiary)]">
                          <span>{taskTimeLabel(task)}</span>
                          {path && <span className="truncate text-[var(--color-primary)]">{path}</span>}
                          {task.subtasks?.length ? <span>{task.subtasks.length} 个步骤</span> : null}
                        </span>
                      </span>
                    </button>
                  );
                })}
                {dayTasks.length === 0 && (
                  <div className="px-4 py-8 text-center text-[12px] text-[var(--color-text-tertiary)]">
                    这一天还没有任务，先在日视图里安排好，再保存为模板
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden sm:flex-row">
              {templates.length > 0 && (
                <aside className="flex flex-shrink-0 gap-2 overflow-x-auto border-b border-[var(--color-border)] px-4 py-3 sm:w-[180px] sm:flex-col sm:overflow-y-auto sm:border-b-0 sm:border-r sm:px-3">
                  {templates.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => chooseTemplate(template)}
                      className={[
                        "flex min-w-fit items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors sm:min-w-0",
                        selectedTemplate?.id === template.id
                          ? "bg-[var(--color-primary-light)] text-[var(--color-primary)]"
                          : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-gray-lighter)]",
                      ].join(" ")}
                    >
                      <span className="max-w-[130px] truncate text-[12px] font-semibold" data-full-text={template.name}>
                        {template.name}
                      </span>
                      <span className="text-[10px] opacity-70">{template.items.length}</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setTemplateName(defaultTemplateName(date, templates));
                      setSelectedTaskIds(new Set(dayTasks.map((task) => task.id)));
                      setMode("create");
                    }}
                    disabled={dayTasks.length === 0}
                    className="flex min-w-fit items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary-light)] disabled:cursor-not-allowed disabled:text-[var(--color-text-tertiary)] sm:min-w-0"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    从这一天新建
                  </button>
                </aside>
              )}

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
                {selectedTemplate ? (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-[14px] font-semibold text-[var(--color-text-primary)]" data-full-text={selectedTemplate.name}>
                          {selectedTemplate.name}
                        </h3>
                        <p className="mt-0.5 text-[10px] text-[var(--color-text-tertiary)]">
                          勾选今天需要的项目；已存在的不会重复加入
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setDeleteId(selectedTemplate.id)}
                        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-[var(--color-text-tertiary)] hover:bg-[var(--color-danger-light)] hover:text-[var(--color-danger)]"
                        aria-label={`删除模板 ${selectedTemplate.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="mt-3 divide-y divide-[var(--color-border)] rounded-xl border border-[var(--color-border)]">
                      {selectedTemplate.items.map((item) => {
                        const exists = templateItemAlreadyExists(item, date, tasks);
                        const checked = selectedApplyIds.has(item.id);
                        const path = goalPath(item);
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => toggleApply(item)}
                            disabled={exists}
                            className="flex w-full items-start gap-3 px-3 py-3 text-left transition-colors hover:bg-[var(--color-bg-gray-lighter)] disabled:cursor-default disabled:bg-[var(--color-bg-gray-lighter)]"
                          >
                            <span
                              className={[
                                "mt-0.5 flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-[5px] border",
                                exists
                                  ? "border-[var(--color-border)] bg-[var(--color-bg-gray-light)]"
                                  : checked
                                    ? "border-[var(--color-primary)] bg-[var(--color-primary)]"
                                    : "border-[var(--color-border)] bg-white",
                              ].join(" ")}
                            >
                              {(checked || exists) && (
                                <Check
                                  className={exists ? "h-3 w-3 text-[var(--color-text-tertiary)]" : "h-3 w-3 text-white"}
                                  strokeWidth={3}
                                />
                              )}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span
                                className={[
                                  "block truncate text-[13px] font-medium",
                                  exists
                                    ? "text-[var(--color-text-tertiary)]"
                                    : "text-[var(--color-text-primary)]",
                                ].join(" ")}
                                data-full-text={item.title}
                              >
                                {item.title}
                              </span>
                              <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-[var(--color-text-tertiary)]">
                                <span className="inline-flex items-center gap-1">
                                  {item.startTime ? <Clock3 className="h-3 w-3" /> : null}
                                  {taskTimeLabel(item)}
                                </span>
                                {path && <span className="truncate text-[var(--color-primary)]">{path}</span>}
                                {item.subtasks?.length ? (
                                  <span className="inline-flex items-center gap-1">
                                    <ListChecks className="h-3 w-3" />
                                    {item.subtasks.length} 步
                                  </span>
                                ) : null}
                              </span>
                            </span>
                            {exists && (
                              <span className="flex-shrink-0 rounded-full bg-white px-2 py-0.5 text-[9px] font-medium text-[var(--color-text-tertiary)]">
                                已在当天
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {notice && (
                      <p className="mt-3 rounded-lg bg-[var(--color-success-light)] px-3 py-2 text-[11px] font-medium text-[var(--color-success)]">
                        {notice}
                      </p>
                    )}

                    <div className="mt-4 flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedApplyIds(
                            new Set(
                              selectedTemplate.items
                                .filter(
                                  (item) =>
                                    !templateItemAlreadyExists(item, date, tasks),
                                )
                                .map((item) => item.id),
                            ),
                          )
                        }
                        className="text-[11px] font-medium text-[var(--color-primary)]"
                      >
                        选择全部未加入项
                      </button>
                      <button
                        type="button"
                        onClick={handleApply}
                        disabled={selectedApplyIds.size === 0}
                        className="flex h-9 items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-4 text-[12px] font-semibold text-white transition-colors hover:bg-[#1D4ED8] disabled:cursor-not-allowed disabled:bg-[var(--color-bg-gray-light)] disabled:text-[var(--color-text-tertiary)]"
                      >
                        <CalendarPlus className="h-4 w-4" />
                        加入这一天{selectedApplyIds.size > 0 ? ` · ${selectedApplyIds.size}` : ""}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center px-4 py-10 text-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-primary-light)] text-[var(--color-primary)]">
                      <CopyPlus className="h-5 w-5" />
                    </span>
                    <h3 className="mt-3 text-[14px] font-semibold text-[var(--color-text-primary)]">
                      还没有日计划模板
                    </h3>
                    <p className="mt-1 max-w-[300px] text-[11px] leading-5 text-[var(--color-text-tertiary)]">
                      先把某一天安排舒服，再把其中固定会做的项目保存下来。模板只减少重复输入，不替你决定该做什么。
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setTemplateName(defaultTemplateName(date, templates));
                        setSelectedTaskIds(new Set(dayTasks.map((task) => task.id)));
                        setMode("create");
                      }}
                      disabled={dayTasks.length === 0}
                      className="mt-4 flex h-9 items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-4 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:bg-[var(--color-bg-gray-light)] disabled:text-[var(--color-text-tertiary)]"
                    >
                      <Plus className="h-4 w-4" />
                      从这一天创建
                    </button>
                    {dayTasks.length === 0 && (
                      <p className="mt-2 text-[10px] text-[var(--color-text-tertiary)]">
                        当前日期没有任务可保存
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {mode === "create" && (
            <footer className="flex items-center justify-between gap-3 border-t border-[var(--color-border)] px-5 py-3 sm:px-6">
              <span className="text-[10px] text-[var(--color-text-tertiary)]">
                保存的是结构，不会带入完成状态
              </span>
              <button
                type="button"
                onClick={handleCreate}
                disabled={!templateName.trim() || selectedTaskIds.size === 0}
                className="flex h-9 items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-4 text-[12px] font-semibold text-white transition-colors hover:bg-[#1D4ED8] disabled:cursor-not-allowed disabled:bg-[var(--color-bg-gray-light)] disabled:text-[var(--color-text-tertiary)]"
              >
                <LayoutTemplate className="h-4 w-4" />
                保存模板 · {selectedTaskIds.size}
              </button>
            </footer>
          )}
        </section>
      </div>

      <ConfirmDialog
        isOpen={Boolean(deleteTemplate)}
        title={`删除“${deleteTemplate?.name ?? ""}”？`}
        description="只删除模板，不会影响已经加入日视图的任务。"
        confirmLabel="删除模板"
        onCancel={() => setDeleteId(null)}
        onConfirm={() => {
          if (!deleteTemplate) return;
          onDelete(deleteTemplate.id);
          setDeleteId(null);
          const next = templates.find((template) => template.id !== deleteTemplate.id);
          setSelectedTemplateId(next?.id ?? null);
          if (!next && dayTasks.length > 0) {
            setTemplateName(defaultTemplateName(date, []));
            setSelectedTaskIds(new Set(dayTasks.map((task) => task.id)));
            setMode("create");
          }
        }}
      />
    </>
  );
}
