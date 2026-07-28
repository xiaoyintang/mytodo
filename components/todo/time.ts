import type { Task, TimeEntry } from "./types";

/** "HH:mm" → 从 0 点起的分钟数 */
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** 从 0 点起的分钟数 → "HH:mm"；超出当天（>= 24:00）返回 null */
export function minutesToTime(total: number): string | null {
  if (total < 0 || total >= 1440) return null;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** 分钟数 → 人类可读时长，如 "3小时20分" / "45分钟" */
export function formatMinutes(min: number): string {
  if (min < 60) return `${min}分钟`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}小时` : `${h}小时${m}分`;
}

/** 某任务已累计记录的分钟数。计入两类记录：
 *  1. 明确关联到该任务的（taskId 命中）——记录时任务已存在
 *  2. 未关联、但同一天且标题与任务完全一致的——先记时间后建任务，也能倒着认回来
 * 这样"先记录后建任务"和"先建任务后记录"两个顺序都能算进进度。 */
export function taskLoggedMinutes(task: Task, entries: TimeEntry[]): number {
  const title = task.title.trim();
  return entries.reduce((sum, e) => {
    if (e.taskId === task.id) return sum + e.minutes;
    if (!e.taskId && e.date === task.date && e.title.trim() === title) return sum + e.minutes;
    return sum;
  }, 0);
}

/** 在给定日期的任务里找标题匹配的任务（用于自动关联记录 → 任务） */
export function matchTaskByTitle(title: string, date: string, tasks: Task[]): Task | undefined {
  const t = title.trim();
  if (!t) return undefined;
  const sameDay = tasks.filter((task) => task.date === date);
  return (
    sameDay.find((task) => task.title === t) ??
    sameDay.find((task) => task.title.includes(t) || t.includes(task.title))
  );
}
