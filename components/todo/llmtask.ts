import { callLLMJson } from "./llmparse";

// 自然语言 → 待办任务解析（用于「新增任务」的 AI 填表）。
export type ParsedTask = {
  title: string;
  date: string; // YYYY-MM-DD
  startTime?: string;
  endTime?: string;
  priority?: "high";
  targetMinutes?: number;
};

const TASK_PROMPT = `你是一个待办任务解析器。用户用一句话描述要做的任务，你解析成结构化 JSON。

输出格式（必须是合法 JSON，不要输出其他内容）：
{"tasks":[{"title":"任务名","date":"YYYY-MM-DD","startTime":"HH:mm","endTime":"HH:mm","priority":"high","targetMinutes":180}]}

规则：
1. title：精简的任务名称，去掉语气词
2. date：解析相对日期为具体日期。"今天"=当前日期，"明天"=+1天，"后天"=+2天，"大后天"=+3天；"周X/星期X"取从今天起最近的那个（含本周未来和下周）；没提到日期就用当前日期
3. startTime/endTime：提到具体时间就填（24 小时制，"下午3点"=15:00）；没提就省略
4. priority：提到"高优/重要/紧急/急/务必"→ "high"，否则省略该字段
5. targetMinutes：如果是"学习3小时/看书2小时/背单词1小时"这种只要求投入时长、不限具体时间段的，填 targetMinutes（分钟），并省略 startTime/endTime
6. 一句话可能包含多个任务，全部解析出来
7. 只输出 JSON，解析不出任务时返回 {"tasks":[]}`;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

export async function parseTasksWithLLM(
  text: string,
  today: string,
  weekday: string,
): Promise<ParsedTask[] | null> {
  const parsed = await callLLMJson(`${TASK_PROMPT}\n\n当前日期：${today} ${weekday}`, text);
  if (parsed === null) return null;

  const raw = Array.isArray((parsed as { tasks?: unknown[] })?.tasks)
    ? (parsed as { tasks: unknown[] }).tasks
    : [];

  return raw
    .map((t): ParsedTask | null => {
      const o = t as Record<string, unknown>;
      const title = String(o.title ?? "").trim();
      if (!title) return null;
      const date = typeof o.date === "string" && DATE_RE.test(o.date) ? o.date : today;
      const startTime = typeof o.startTime === "string" && TIME_RE.test(o.startTime) ? o.startTime : undefined;
      const endTime = typeof o.endTime === "string" && TIME_RE.test(o.endTime) ? o.endTime : undefined;
      const priority = o.priority === "high" ? "high" : undefined;
      const tm = Math.round(Number(o.targetMinutes));
      const targetMinutes = Number.isFinite(tm) && tm > 0 ? tm : undefined;
      return { title, date, startTime, endTime, priority, targetMinutes };
    })
    .filter((x): x is ParsedTask => x !== null);
}
