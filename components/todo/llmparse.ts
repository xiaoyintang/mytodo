import type { ParsedEntry } from "./nlparse";

// 服务端 LLM 解析（OpenAI 兼容接口：DeepSeek / 硅基流动）。
// 未配 LLM_API_KEY 或调用失败时返回 null，由调用方决定降级（规则解析）。

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
8. 没有任何时间信息的内容忽略；解析不出任何记录时返回 {"entries":[]}`;

const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

export function hasLLM(): boolean {
  return !!process.env.LLM_API_KEY;
}

export async function parseWithLLM(text: string, now?: string): Promise<ParsedEntry[] | null> {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) return null;

  const baseUrl = (process.env.LLM_BASE_URL ?? "https://api.deepseek.com/v1").replace(/\/$/, "");
  const model = process.env.LLM_MODEL ?? "deepseek-chat";

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: now ? `${SYSTEM_PROMPT}\n\n当前时间：${now}` : SYSTEM_PROMPT },
          { role: "user", content: text },
        ],
        response_format: { type: "json_object" },
        // DeepSeek V4 默认开思考模式，简单抽取任务关掉能快 5 倍以上
        ...(baseUrl.includes("api.deepseek.com") ? { thinking: { type: "disabled" } } : {}),
        temperature: 0,
        max_tokens: 1024,
        stream: false,
      }),
    });
    if (!res.ok) return null;

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(content);
    const raw = Array.isArray(parsed?.entries) ? parsed.entries : [];

    return raw
      .map((e: Record<string, unknown>): ParsedEntry | null => {
        const title = String(e.title ?? "").trim();
        const minutes = Math.round(Number(e.minutes));
        const startTime = typeof e.startTime === "string" && TIME_RE.test(e.startTime) ? e.startTime : undefined;
        const endTime = typeof e.endTime === "string" && TIME_RE.test(e.endTime) ? e.endTime : undefined;
        if (!title || !Number.isFinite(minutes) || minutes <= 0) return null;
        return { title, minutes, startTime, endTime };
      })
      .filter((x: ParsedEntry | null): x is ParsedEntry => x !== null);
  } catch {
    return null;
  }
}
