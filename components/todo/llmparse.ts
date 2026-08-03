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

const BEHAVIOR_TYPES = `【五类】
- aspiration 愿望：抽象的方向或状态，无法直接执行。例："想生活有秩序""变得健康"
- outcome 成果：具体、可衡量的结果，但仍然无法直接执行。例："每天2点前睡""每周剪一个视频"
- onetime 一次性任务：具体动作，做完就不需要再做。例："买个遮光窗帘""简历定稿""换个枕头"
- habit 可重复行为：具体动作，做完之后还会一次次再做。例："12点前喝杯热牛奶""看完一集读2分钟书"
- stop 要戒掉：要减少或停掉的旧习惯。例："睡前不刷短视频""下午4点后不喝咖啡"`;

const SORT_PROMPT = `你是行为设计助手，依据 BJ Fogg 的定义给条目分类。

${BEHAVIOR_TYPES}

【三个测试，按顺序做】
1. 立刻测试：现在这一秒能不能开始做它？不能 → aspiration 或 outcome
2. 照片测试：能不能拍一张照片，照片里有人正在做它？拍不到 → aspiration 或 outcome
   （"减肥"拍不到；"吃一根胡萝卜"拍得到）
3. 重复测试：做完之后它还会再出现吗？不会 → onetime；会 → habit；如果内容是"不做/少做某事" → stop

【aspiration 与 outcome 的区分】
不可衡量、只是个方向 → aspiration；可衡量、是个具体结果 → outcome

【注意】"做完X就做Y"这种自带触发时机的说法是很好的可重复行为，别误判成愿望。

【额外标记 hasDecision】
如果一条行为内部含有"需要当场判断/挑选/评估"的成分，返回 hasDecision: true，
并在 reason 里点出是哪个词带来了判断。
例："挑出有问题的一句话去改写" → hasDecision: true（"有问题的"需要当场判断）

【输出】必须是合法 JSON，不要输出其他内容：
{"results":[{"id":"原样返回输入的id","type":"habit","reason":"不超过20字","hasDecision":false}]}
输入几条就输出几条，一条都不能少，id 必须原样返回。`;

const WAND_PROMPT = `你是福格行为设计（BJ Fogg, Tiny Habits）的教练。用户会给出一个愿望或成果。
用"魔法棒"发散：假设有根魔法棒，他毫不费力就能做到任何事，列出能实现它的具体行为。

${BEHAVIOR_TYPES}

输出格式（必须是合法 JSON，不要输出其他内容）：
{"behaviors":[{"text":"行为描述","type":"habit"}]}

规则：
1. 给 8-10 个，尽量不同角度，onetime / habit / stop 三种都要有（不要输出 aspiration 和 outcome）
2. 每条都必须过"照片测试"：能拍到一张照片，照片里有人正在做它
3. 描述里带上什么时候/在哪做更好；小到几乎不需要意志力
4. 别重复用户已经收集过的（会告诉你他已有哪些）`;

const SHRINK_PROMPT = `你是福格行为设计（BJ Fogg, Tiny Habits）的教练。

用户有一条行为：影响力很大，但他自己做不到。福格的解法不是放弃，是**把它改小**——
小到不需要动用任何意志力，最好 30 秒内能做完，小到"就算今天状态最差也能做"。

例：
- "每天跑步30分钟" → "换上跑鞋"、"跑到小区门口就算完成"、"做2个开合跳"
- "读30分钟书" → "读2分钟书"、"读一页"、"打开书读一段"
- "睡前做5分钟拉伸" → "睡前拉伸一次腿"、"上床前做1个前屈"

输出格式（必须是合法 JSON，不要输出其他内容）：
{"behaviors":[{"text":"改小后的行为","type":"habit"}]}

规则：
1. 给 3 个，从小到更小，都保留原来的方向
2. 每个都必须小到"不需要意志力"——这是唯一标准，不要给"稍微少一点"的版本
3. type 用 habit；如果原行为是"不做某事"，用 stop`;

const VALID_TYPE = new Set<string>(["aspiration", "outcome", "onetime", "habit", "stop"]);
const WAND_TYPE = new Set<string>(["onetime", "habit", "stop"]);

export type LLMBehavior = { text: string; type: BehaviorType };
export type LLMJudgement = {
  id: string;
  type: BehaviorType;
  reason: string;
  hasDecision: boolean;
};

// 从模型输出里挑出合法的行为条目（魔法棒用，只收可执行的三类）
function pickBehaviors(raw: unknown): LLMBehavior[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((b): LLMBehavior | null => {
      const o = b as Record<string, unknown>;
      const text = String(o?.text ?? "").trim();
      const type = String(o?.type ?? "habit").trim();
      if (!text || text.length > 60) return null;
      return { text, type: (WAND_TYPE.has(type) ? type : "habit") as BehaviorType };
    })
    .filter((x): x is LLMBehavior => x !== null)
    .slice(0, 12);
}

/** 批量判定：一次给一堆条目分类，返回 {id, type, reason, hasDecision} */
export async function sortBehaviorsWithLLM(
  items: Array<{ id: string; text: string }>,
  goal?: string,
): Promise<LLMJudgement[] | null> {
  const payload = JSON.stringify({ goal: goal ?? "", items });
  const parsed = await callLLMJson(SORT_PROMPT, payload);
  if (parsed === null) return null;

  const raw = (parsed as { results?: unknown })?.results;
  if (!Array.isArray(raw)) return null;

  const known = new Set(items.map((i) => i.id));
  return raw
    .map((r): LLMJudgement | null => {
      const o = r as Record<string, unknown>;
      const id = String(o?.id ?? "").trim();
      const type = String(o?.type ?? "").trim();
      if (!known.has(id) || !VALID_TYPE.has(type)) return null;
      return {
        id,
        type: type as BehaviorType,
        reason: String(o?.reason ?? "").trim().slice(0, 40),
        hasDecision: o?.hasDecision === true,
      };
    })
    .filter((x): x is LLMJudgement => x !== null);
}

/** 改小：把"影响力大但做不到"的行为拆成不需要意志力的版本 */
export async function shrinkWithLLM(text: string, goal?: string): Promise<LLMBehavior[] | null> {
  const user = goal ? `我的目标：${goal}\n做不到的这条行为：${text}` : `做不到的这条行为：${text}`;
  const parsed = await callLLMJson(SHRINK_PROMPT, user);
  if (parsed === null) return null;
  return pickBehaviors((parsed as { behaviors?: unknown })?.behaviors);
}

/** 魔法棒：从愿望/成果发散一批候选行为 */
export async function magicWandWithLLM(
  aspiration: string,
  existing: string[],
  context?: string,
): Promise<LLMBehavior[] | null> {
  const lines = [`愿望/成果：${aspiration}`];
  if (context && context !== aspiration) lines.push(`它属于我的大目标：${context}`);
  if (existing.length) lines.push(`已经收集过的（别重复）：${existing.join("、")}`);
  const parsed = await callLLMJson(WAND_PROMPT, lines.join("\n"));
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
