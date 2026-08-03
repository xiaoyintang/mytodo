import type { ParsedEntry } from "./nlparse";
import type { EntryCategory } from "./types";

// 服务端 LLM 调用（OpenAI 兼容接口：DeepSeek / 硅基流动）。
// 未配 LLM_API_KEY 或调用失败/超时返回 null，由调用方决定降级。

const SYSTEM_PROMPT = `你是一个时间记录解析器（柳比歇夫时间记录法）。用户会口述自己做了什么事、花了多少时间。你把它解析成结构化 JSON。

输出格式（必须是合法 JSON，不要输出其他内容）：
{"entries":[{"title":"事项名","startTime":"HH:mm","endTime":"HH:mm","minutes":90}]}

规则：
1. title：精简的事项名称，去掉"做了""学了"等动词和语气词，如"数学""背单词""开会"
2. 时间用 24 小时制 HH:mm；"下午3点"是 15:00，"晚上8点半"是 20:30
3. 如果说了起止时间，填 startTime/endTime，minutes 等于两者之差
4. 如果只说了时长（如"背单词40分钟"），只填 minutes，省略 startTime/endTime
5. "一个半小时"=90，"半小时"=30
6. 一段话可能包含多笔记录，全部解析出来
7. 如果只说了开始时间、没说结束时间或时长（如"2点50开始看书"），用「当前时间」作为结束时间计算 minutes；若当前时间早于开始时间，则该条只填 startTime 且 minutes 给 0
8. 如果说了"刚才/刚刚"+时长（如"刚才复盘面试30分钟"），说明这段时间刚结束：endTime 用「当前时间」，startTime＝当前时间减去时长，minutes 为该时长
9. 没有任何时间信息的内容忽略；解析不出任何记录时返回 {"entries":[]}`;

const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

export function hasLLM(): boolean {
  return !!process.env.LLM_API_KEY;
}

// 通用：给定 system + user，返回模型输出的 JSON（对象），失败/超时返回 null。
export async function callLLMJson(system: string, user: string): Promise<unknown | null> {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) return null;

  const baseUrl = (process.env.LLM_BASE_URL ?? "https://api.deepseek.com/v1").replace(/\/$/, "");
  const model = process.env.LLM_MODEL ?? "deepseek-chat";

  try {
    // 8 秒超时保护，避免卡死拖满函数时限
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
        // DeepSeek V4 默认开思考模式，简单抽取任务关掉能快 5 倍以上
        ...(baseUrl.includes("api.deepseek.com") ? { thinking: { type: "disabled" } } : {}),
        temperature: 0,
        max_tokens: 1024,
        stream: false,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content ?? "";
    return JSON.parse(content);
  } catch {
    return null;
  }
}

const CLASSIFY_PROMPT = `你给时间记录的事项名分类，判断每一项属于哪个大类。

三类的定义：
- 正事：工作、学习、副业、健身等有产出或自我提升的事（如"背单词""复盘面试""写代码""养号"（做自媒体账号运营）"健身"）
- 娱乐：消遣放松、刷着爽的事（如"刷抖音""斗罗大陆""打游戏""看小说"）
- 休息：维持生活必需的事（如"午饭""午睡""洗澡""通勤""打扫"）

输出格式（必须是合法 JSON，不要输出其他内容）：
{"categories":{"事项名":"正事","另一个事项名":"娱乐"}}

要求：
1. 键必须和输入的事项名一字不差，输入几项就输出几项，不要遗漏也不要新增
2. 值只能是"正事""娱乐""休息"三者之一
3. 拿不准时选最接近的那一类，不要留空
4. 只看事项名本身，别脑补额外信息`;

const VALID_CATEGORIES = new Set<string>(["正事", "娱乐", "休息"]);

/** 给一批事项名分类。返回 {事项名: 分类}，未配 key / 调用失败返回 null */
export async function classifyWithLLM(titles: string[]): Promise<Record<string, EntryCategory> | null> {
  const parsed = await callLLMJson(CLASSIFY_PROMPT, JSON.stringify({ titles }));
  if (parsed === null) return null;

  const raw = (parsed as { categories?: unknown })?.categories;
  if (!raw || typeof raw !== "object") return null;

  const known = new Set(titles);
  const out: Record<string, EntryCategory> = {};
  for (const [title, value] of Object.entries(raw as Record<string, unknown>)) {
    const v = String(value).trim();
    if (known.has(title) && VALID_CATEGORIES.has(v)) out[title] = v as EntryCategory;
  }
  return out;
}

export async function parseWithLLM(text: string, now?: string): Promise<ParsedEntry[] | null> {
  const parsed = await callLLMJson(now ? `${SYSTEM_PROMPT}\n\n当前时间：${now}` : SYSTEM_PROMPT, text);
  if (parsed === null) return null;

  const raw = Array.isArray((parsed as { entries?: unknown[] })?.entries)
    ? (parsed as { entries: unknown[] }).entries
    : [];

  return raw
    .map((e): ParsedEntry | null => {
      const o = e as Record<string, unknown>;
      const title = String(o.title ?? "").trim();
      const minutes = Math.round(Number(o.minutes));
      const startTime = typeof o.startTime === "string" && TIME_RE.test(o.startTime) ? o.startTime : undefined;
      const endTime = typeof o.endTime === "string" && TIME_RE.test(o.endTime) ? o.endTime : undefined;
      if (!title || !Number.isFinite(minutes) || minutes <= 0) return null;
      return { title, minutes, startTime, endTime };
    })
    .filter((x): x is ParsedEntry => x !== null);
}
