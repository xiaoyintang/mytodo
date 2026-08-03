import type { ParsedEntry } from "./nlparse";
import type { BehaviorType, EntryCategory } from "./types";

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

// ===== 习惯实验室：行为集群 =====

const BEHAVIOR_RULES = `你是福格行为设计（BJ Fogg, Tiny Habits）的教练。

先分清三样东西：
- 愿望(aspiration)：抽象的期望，如"想更健康""早点睡"。执行不了。
- 结果(outcome)：可衡量的目标，如"一个月瘦5斤""考上研"。也执行不了。
- 行为(behavior)：具体动作，能通过"掐一把测试"——我现在戳你一下，你能不能立刻做出来。如"晚上9点把手机放到客厅充电""做两个俯卧撑"。

行为分三型：
- habit：要重复做的新习惯
- onetime：只做一次的事（买跑步机、卸载抖音、把零食送人）
- stop：要戒掉/减少的旧习惯

好行为的标准：具体到能立刻执行；小到几乎不需要意志力；描述里带上什么时候/在哪做更好；别写成"多运动""少玩手机"这种没法执行的。`;

const JUDGE_PROMPT = `${BEHAVIOR_RULES}

用户会给你两样东西：一个「背景愿望」和一句「待判定」的话。
**你只判断「待判定」那句话**，背景愿望只是上下文，绝对不要去判定背景愿望本身。

输出格式（必须是合法 JSON，不要输出其他内容）：
{"kind":"behavior","reason":"一句话说明为什么","behaviors":[{"text":"行为描述","type":"habit"}]}

规则：
1. kind 只能是 "aspiration"、"outcome"、"behavior" 之一，指的是「待判定」那句话属于哪种
2. 如果是行为：behaviors 只放这一条（可以帮他润色得更具体，但别改变原意）。
   注意"做完X就做Y"这种带触发时机的说法是**很好的行为**，别误判成愿望
3. 如果是愿望或结果：用"魔法棒"发散——假设他毫不费力就能做到，列出 5-6 个能实现它的具体行为，三种型都可以有
4. reason 用中文，一句话，说人话别说教，引用的是「待判定」那句话`;

const WAND_PROMPT = `${BEHAVIOR_RULES}

用户会给出一个愿望或结果。用"魔法棒"发散：假设有根魔法棒，他毫不费力就能做到任何事，列出能实现它的具体行为。

输出格式（必须是合法 JSON，不要输出其他内容）：
{"behaviors":[{"text":"行为描述","type":"habit"}]}

规则：
1. 给 8-10 个，尽量不同角度，三种型（habit / onetime / stop）都要有
2. 每条都必须过"掐一把测试"：现在马上就能做
3. 别重复用户已经收集过的行为（会告诉你他已有哪些）`;

const VALID_KIND = new Set(["aspiration", "outcome", "behavior"]);
const VALID_TYPE = new Set<string>(["habit", "onetime", "stop"]);

export type LLMBehavior = { text: string; type: BehaviorType };
export type BehaviorJudgement = {
  kind: "aspiration" | "outcome" | "behavior";
  reason: string;
  behaviors: LLMBehavior[];
};

// 从模型输出里挑出合法的行为条目
function pickBehaviors(raw: unknown): LLMBehavior[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((b): LLMBehavior | null => {
      const o = b as Record<string, unknown>;
      const text = String(o?.text ?? "").trim();
      const type = String(o?.type ?? "habit").trim();
      if (!text || text.length > 60) return null;
      return { text, type: (VALID_TYPE.has(type) ? type : "habit") as BehaviorType };
    })
    .filter((x): x is LLMBehavior => x !== null)
    .slice(0, 12);
}

/** 判断一句话是愿望/结果/行为；不是行为就顺手发散成候选行为 */
export async function judgeBehaviorWithLLM(
  text: string,
  aspiration?: string,
): Promise<BehaviorJudgement | null> {
  const user = aspiration
    ? `背景愿望（不要判定它）：${aspiration}\n待判定：${text}`
    : `待判定：${text}`;
  const parsed = await callLLMJson(JUDGE_PROMPT, user);
  if (parsed === null) return null;

  const o = parsed as Record<string, unknown>;
  const kind = String(o.kind ?? "").trim();
  if (!VALID_KIND.has(kind)) return null;
  return {
    kind: kind as BehaviorJudgement["kind"],
    reason: String(o.reason ?? "").trim(),
    behaviors: pickBehaviors(o.behaviors),
  };
}

/** 魔法棒：从愿望直接发散一批候选行为 */
export async function magicWandWithLLM(
  aspiration: string,
  existing: string[],
): Promise<LLMBehavior[] | null> {
  const user = existing.length
    ? `愿望：${aspiration}\n已经收集过的行为（别重复）：${existing.join("、")}`
    : `愿望：${aspiration}`;
  const parsed = await callLLMJson(WAND_PROMPT, user);
  if (parsed === null) return null;
  return pickBehaviors((parsed as { behaviors?: unknown })?.behaviors);
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
