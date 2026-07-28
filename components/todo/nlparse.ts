// 规则版自然语言时间记录解析（AI 解析不可用时的兜底）
// 支持："数学 9:00-10:30"、"上午9点到10点半做了数学"、"背单词40分钟"、"英语一个半小时"、
//       "下午3点背单词40分钟"（时间点+时长）、"2点50开始看书"（只有开始→记到现在）

import { timeToMinutes, minutesToTime } from "./time";

export interface ParsedEntry {
  title: string;
  startTime?: string; // "HH:mm"
  endTime?: string; // "HH:mm"
  minutes: number;
}

const CN_DIGITS: Record<string, number> = {
  零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
};

// 中文数字 → 整数（支持到 99），"12" 这种阿拉伯数字直接转
function cnToInt(s: string): number {
  if (/^\d+$/.test(s)) return Number(s);
  let result = 0;
  const tenIdx = s.indexOf("十");
  if (tenIdx >= 0) {
    const before = s.slice(0, tenIdx);
    const after = s.slice(tenIdx + 1);
    result = (before ? CN_DIGITS[before] ?? 1 : 1) * 10;
    if (after) result += CN_DIGITS[after] ?? 0;
  } else {
    for (const ch of s) {
      const d = CN_DIGITS[ch];
      if (d == null) return NaN;
      result = result * 10 + d;
    }
  }
  return result;
}

const NUM = "\\d+|[零一二两三四五六七八九十]+";
const PERIOD = "凌晨|清晨|早上|早晨|上午|中午|下午|傍晚|晚上|晚间|夜里|夜晚";
// 一个时间点："9:30" / "9点半" / "下午3点20" / "十点"
const TIME_POINT = `(?:(${PERIOD})\\s*)?(${NUM})\\s*(?:[点时]|[:：])\\s*(半|\\d{1,2}|[零一二两三四五六七八九十]+)?\\s*分?`;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toHour24(hRaw: number, period: string | undefined): number {
  let h = hRaw;
  if (period && /下午|傍晚|晚上|晚间|夜里|夜晚/.test(period) && h < 12) h += 12;
  if (period && /中午/.test(period) && h < 3) h = h === 12 ? 12 : h + 12;
  if (period && /凌晨|清晨/.test(period) && h === 12) h = 0;
  return h;
}

function parseTimePoint(period: string | undefined, hStr: string, mStr: string | undefined) {
  const h = cnToInt(hStr);
  if (isNaN(h) || h > 24) return null;
  let m = 0;
  if (mStr === "半") m = 30;
  else if (mStr) {
    m = cnToInt(mStr);
    if (isNaN(m) || m > 59) m = 0;
  }
  return { hour: toHour24(h, period), minute: m, hasPeriod: !!period };
}

// 解析时长表达，返回 [分钟数, 匹配到的原文]
function parseDuration(text: string): [number, string] | null {
  // 先匹配"X个半小时"，避免"一个半小时"被下面的"半小时"抢先匹配成 30 分钟
  let m = text.match(new RegExp(`(${NUM})\\s*个半\\s*(?:小时|钟头)`));
  if (m) {
    const h = cnToInt(m[1]);
    if (!isNaN(h)) return [h * 60 + 30, m[0]];
  }

  m = text.match(/半\s*个?\s*(?:小时|钟头)/);
  if (m) return [30, m[0]];

  m = text.match(new RegExp(`(\\d+(?:\\.\\d+)?|[零一二两三四五六七八九十]+)\\s*个?\\s*(?:小时|钟头|h|hr)\\s*(?:零?\\s*(${NUM})\\s*分钟?)?`, "i"));
  if (m) {
    const h = /^[\d.]+$/.test(m[1]) ? Number(m[1]) : cnToInt(m[1]);
    if (!isNaN(h)) {
      const extra = m[2] ? cnToInt(m[2]) : 0;
      return [Math.round(h * 60) + (isNaN(extra) ? 0 : extra), m[0]];
    }
  }

  m = text.match(new RegExp(`(${NUM})\\s*(?:分钟|分|min|m)(?![a-z])`, "i"));
  if (m) {
    const v = cnToInt(m[1]);
    if (!isNaN(v)) return [v, m[0]];
  }

  return null;
}

function cleanTitle(raw: string): string {
  let t = raw
    .replace(/[，,。.、;；:：~～\-—到至]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  t = t.replace(/^(我|今天|上午|下午|中午|晚上|晚间|早上|凌晨|然后|接着|之后|还|又|再|先|开始|刚才|刚刚|方才|刚)+/, "");
  // 只剥"动词+了"形式，不剥单字动词——"刷题""背单词"本身就是事项名
  t = t.replace(/^(做了|做完|学了|写了|看了|背了|复习了|练了|刷了|干了|搞了|进行了|花了|用了)/, "");
  t = t.replace(/(花了|用了|大概|左右|差不多|吧|了)$/, "");
  return t.trim();
}

/** 解析一整段口述/输入文字，返回多笔时间记录。now 为 "HH:mm"（默认取当前时间），用于"只说了开始时间"的场景 */
export function parseTimeEntries(input: string, now?: string): ParsedEntry[] {
  const d = new Date();
  const nowTime = now ?? `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const normalized = input
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/：/g, ":");

  const segments = normalized
    .split(/[,，;；。\n]|然后|接着|之后再/)
    .map((s) => s.trim())
    .filter(Boolean);

  const entries: ParsedEntry[] = [];

  for (const seg of segments) {
    const rangeRe = new RegExp(`${TIME_POINT}\\s*(?:到|至|[-—~～])\\s*${TIME_POINT}`);
    const rangeMatch = seg.match(rangeRe);

    let startTime: string | undefined;
    let endTime: string | undefined;
    let minutes = 0;
    let rest = seg;

    if (rangeMatch) {
      const start = parseTimePoint(rangeMatch[1], rangeMatch[2], rangeMatch[3]);
      const end = parseTimePoint(rangeMatch[4], rangeMatch[5], rangeMatch[6]);
      if (start && end) {
        // 结束时间没写上午/下午且小于开始时间 → 视为跨到下午（如"9点到2点"）
        if (!end.hasPeriod && (end.hour < start.hour || (end.hour === start.hour && end.minute <= start.minute))) {
          if (end.hour + 12 < 24) end.hour += 12;
        }
        // 开始时间没写时段但结束写了下午且开始更大 → 开始也在下午（如"2点到下午4点"少见,忽略）
        const startMin = start.hour * 60 + start.minute;
        const endMin = end.hour * 60 + end.minute;
        if (endMin > startMin) {
          startTime = `${pad2(start.hour)}:${pad2(start.minute)}`;
          endTime = `${pad2(end.hour)}:${pad2(end.minute)}`;
          minutes = endMin - startMin;
          rest = seg.replace(rangeMatch[0], " ");
        }
      }
    }

    // 没有时间段时，尝试单个时间点（"下午3点背单词40分钟"、"2点50开始看书"）
    if (!startTime) {
      const single = rest.match(new RegExp(TIME_POINT));
      if (single) {
        const p = parseTimePoint(single[1], single[2], single[3]);
        if (p && p.hour < 24) {
          startTime = `${pad2(p.hour)}:${pad2(p.minute)}`;
          rest = rest.replace(single[0], " ");
        }
      }
    }

    const duration = parseDuration(rest);
    if (duration) {
      if (!minutes) minutes = duration[0];
      rest = rest.replace(duration[1], " ");
    }

    // "刚才做了30分钟X"：说了"刚才/刚刚"但没写时刻 → 把这段时长贴到"现在"结束
    // （现在-时长 → 现在），而不是记成一段没有时刻的纯时长
    // "刚"默认按"刚才"处理；只排除真不表"刚才"的词（刚好=正好、刚性/刚强/刚毅）
    const justNow = /刚才|刚刚|方才|刚(?!好|性|强|毅|铁)/.test(seg);
    if (justNow && minutes > 0 && !startTime && !endTime) {
      const startMin = timeToMinutes(nowTime) - minutes;
      if (startMin >= 0) {
        startTime = minutesToTime(startMin) ?? undefined;
        endTime = nowTime;
      }
    }

    // 时间点 + 时长 → 推出结束时间
    if (startTime && !endTime && minutes > 0) {
      endTime = minutesToTime(timeToMinutes(startTime) + minutes) ?? undefined;
    }

    // 只有开始时间（"2点50开始看书"）→ 默认记到当前时间
    if (startTime && minutes <= 0) {
      const diff = timeToMinutes(nowTime) - timeToMinutes(startTime);
      if (diff > 0) {
        minutes = diff;
        endTime = nowTime;
      }
    }

    if (minutes <= 0) continue; // 没有任何时间信息的片段跳过

    const title = cleanTitle(rest) || "未命名事项";
    entries.push({ title, startTime, endTime, minutes });
  }

  return entries;
}
