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
1. title：只去掉语气词和已经提取的日期时间，必须保留动作、资料来源、地点、数量和完成边界。例如“下周每天都要在林木实干圈的飞书文档里学习一章工作技巧”，标题应为“在林木实干圈的飞书文档里学习一章工作技巧”，不能缩成“学习工作技巧”
2. date：解析相对日期为具体日期。"今天"=当前日期，"明天"=+1天，"后天"=+2天，"大后天"=+3天；"周X/星期X"取从今天起最近的那个（含本周未来和下周）；没提到日期就用当前日期
3. startTime/endTime：提到具体时间就填（24 小时制，"下午3点"=15:00）；没提就省略
4. priority：提到"高优/重要/紧急/急/务必"→ "high"，否则省略该字段
5. targetMinutes：如果是"学习3小时/看书2小时/背单词1小时"这种只要求投入时长、不限具体时间段的，填 targetMinutes（分钟），并省略 startTime/endTime
6. 一句话可能包含多个任务，全部解析出来
7. 同一任务在多个日期重复时，只输出一个对象，用 dates 数组代替 date，写全所有具体日期，程序负责逐日创建。例如当前日期为 2026-09-06 时，“下周每天学习”应返回 {"tasks":[{"title":"学习","dates":["2026-09-07","2026-09-08","2026-09-09","2026-09-10","2026-09-11","2026-09-12","2026-09-13"]}]}。多个不同任务分别使用自己的 dates/date，不能混用日期范围
8. "下周"指下一个周一到周日；"下周工作日"指下周一到周五；"下周末"指下周六和周日
9. 范围中的例外必须排除（如“除了周三”）；“本周每天”从今天到本周日；只有“每天”没有结束日期时先排从今天起 7 天，不要无限生成；单次最多展开 31 天
10. 只输出 JSON，解析不出任务时返回 {"tasks":[]}`;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toUtcISODate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * LLM 偶尔会把“下周每天”压成下周一的一条。这里对最常用的明确范围做兜底，
 * 避免模型是否听懂决定用户最终会不会漏掉六天。
 */
function requestedNextWeekDates(text: string, today: string): string[] | null {
  const compact = text.replace(/\s+/g, "");
  // 只为明确写在句首的简单重复范围兜底；有例外或其他日期时交给模型逐项解析。
  if (!/^(?:下周|下个周|下星期|下个星期)(?:每天|每日|天天|每个工作日|工作日|末)/.test(compact)) return null;
  if (/(?:除|不含|不包括|仅|只在|改到|取消|今天|明天|后天|本周|下下周|周[一二三四五六日天]|星期[一二三四五六日天]|\d+[月日号]|[;；\n])/.test(compact)) return null;

  const todayDate = new Date(`${today}T00:00:00Z`);
  if (Number.isNaN(todayDate.getTime())) return null;
  const weekday = todayDate.getUTCDay();
  const daysFromMonday = weekday === 0 ? 6 : weekday - 1;
  const nextMonday = addUtcDays(todayDate, 7 - daysFromMonday);

  let offsets: number[] | null = null;
  if (/(?:工作日|周一(?:到|至|—|–|-)周五)/.test(compact)) {
    offsets = [0, 1, 2, 3, 4];
  } else if (/(?:周末|星期六(?:和|及|、)星期日)/.test(compact)) {
    offsets = [5, 6];
  } else if (/(?:每天|每日|天天)/.test(compact)) {
    offsets = [0, 1, 2, 3, 4, 5, 6];
  }

  return offsets?.map((offset) => toUtcISODate(addUtcDays(nextMonday, offset))) ?? null;
}

export async function parseTasksWithLLM(
  text: string,
  today: string,
  weekday: string,
): Promise<ParsedTask[] | null> {
  const current = new Date(`${today}T00:00:00Z`);
  const monday = addUtcDays(current, -((current.getUTCDay() + 6) % 7));
  const calendarContext = `本周：${toUtcISODate(monday)} 至 ${toUtcISODate(addUtcDays(monday, 6))}；下周：${toUtcISODate(addUtcDays(monday, 7))} 至 ${toUtcISODate(addUtcDays(monday, 13))}。严格使用这个范围，不要把本周一当成下周一。`;
  const nextWeekCalendar = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
    .map((label, index) => `${label}=${toUtcISODate(addUtcDays(monday, 7 + index))}`).join("，");
  const parsed = await callLLMJson(`${TASK_PROMPT}\n\n当前日期：${today} ${weekday}\n${calendarContext}\n下周逐日对照（遇到排除某天必须按此表删除对应日期）：${nextWeekCalendar}`, text);
  if (parsed === null) return null;

  const raw = Array.isArray((parsed as { tasks?: unknown[] })?.tasks)
    ? (parsed as { tasks: unknown[] }).tasks
    : [];

  const tasks = raw
    .flatMap((t): ParsedTask[] => {
      if (!t || typeof t !== "object") return [];
      const o = t as Record<string, unknown>;
      const title = String(o.title ?? "").trim();
      if (!title) return [];
      const date = typeof o.date === "string" && DATE_RE.test(o.date) ? o.date : today;
      const startTime = typeof o.startTime === "string" && TIME_RE.test(o.startTime) ? o.startTime : undefined;
      const endTime = typeof o.endTime === "string" && TIME_RE.test(o.endTime) ? o.endTime : undefined;
      const priority = o.priority === "high" ? "high" : undefined;
      const tm = Math.round(Number(o.targetMinutes));
      const targetMinutes = Number.isFinite(tm) && tm > 0 ? tm : undefined;
      const dates = Array.isArray(o.dates)
        ? [...new Set(o.dates.filter((value): value is string => typeof value === "string" && DATE_RE.test(value)))].slice(0, 31)
        : [date];
      return dates.map((date) => ({ title, date, startTime, endTime, priority, targetMinutes }));
    });

  const requestedDates = requestedNextWeekDates(text, today);
  if (!requestedDates || tasks.length === 0) return tasks;

  // 只有模型给出的任务本质上是同一件事时才自动补齐，避免误复制一句话里的其他任务。
  const titles = new Set(tasks.map((task) => task.title));
  if (titles.size !== 1) return tasks;
  const template = tasks[0];
  const tasksByDate = new Map(tasks.map((task) => [task.date, task]));
  return requestedDates.map((date) => tasksByDate.get(date) ?? { ...template, date });
}
