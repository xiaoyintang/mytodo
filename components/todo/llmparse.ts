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
/**
 * 按任务性质分两档：
 * - **抽取类**（解析时间、分类、判定）：机械活，关思考 + temperature 0，图快图稳
 * - **改写类**（改具体、改小、魔法棒）：要判断也要语感，开思考 + 给一点温度，
 *   否则它只会"原文 + 补丁"地拼，写不出人话
 */
export type LLMOpts = { think?: boolean; temperature?: number };

export async function callLLMJson(
  system: string,
  user: string,
  opts: LLMOpts = {},
): Promise<unknown | null> {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) return null;

  const baseUrl = (process.env.LLM_BASE_URL ?? "https://api.deepseek.com/v1").replace(/\/$/, "");
  const model = process.env.LLM_MODEL ?? "deepseek-chat";

  try {
    // 8 秒超时保护，避免卡死拖满函数时限
    const controller = new AbortController();
    // 开了思考会慢不少，超时跟着放宽
    const timer = setTimeout(() => controller.abort(), opts.think ? 35000 : 8000);
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
        // DeepSeek V4 默认开思考模式；抽取类任务关掉能快 5 倍以上，改写类要留着
        ...(baseUrl.includes("api.deepseek.com") && !opts.think
          ? { thinking: { type: "disabled" } }
          : {}),
        temperature: opts.temperature ?? 0,
        // 开思考时**推理过程也算 completion_tokens**——6 条判定就烧掉 1900+，
      // 给 2048 的话正文只剩百来个 token，JSON 会被截断成 finish_reason:"length"。
      max_tokens: opts.think ? 8000 : 1024,
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

【额外标记 blocker：这条有没有边界】

只判**一件事**：做到什么程度算完，说得出来吗？说不出来 → "endpoint"，否则 → null。

**第一步：这件事能不能"多做一会儿"？**

这一问就能分开两类，别去背动词表：

**不能多做一会儿**——做完那一下就结束了，没有"做多做少"这回事 → 一律 null：
   "睡前把手机放客厅充电"（不能多放一会儿）
   "买个遮光窗帘"（不能多买一会儿）
   "卸载手机里的短视频APP"、"发出这封邮件"、"报名考试"

**能多做一会儿**——同一件事可以做 10 分钟，也可以做 3 小时 → 必须有边界，否则 endpoint：
   "改简历"（能改久一点 → 改到什么程度算改完？说不出来）→ endpoint
   "复盘上一次面试"（能复盘久一点）→ endpoint
   "写周报"、"整理房间"、"准备面试"、"练英语口语"、"背单词"、"研究一下竞品"

🔴 **"有明确的宾语"不等于"有终点"。**「改简历」宾语很明确，但改到什么程度算完
   说不出来，照样是 endpoint。别拿"改完即止""一次性的"当理由放过它。

**第二步：能多做一会儿的，看句子里有没有边界。**
   有下面**任意一种**就算有，判 null：
   · 数量：3篇 / 一个 / 10条 / 两页 / 5家
   · 范围：前3段 / 定价页 / 第二章 / 选择题
   · 时长：10分钟 / 半小时 / 2分钟
   · 痕迹：记下来 / 截图 / 写成笔记 / 划线 / 念三遍
   一种都没有 → "endpoint"

🔴 **不许看动词抓人。**"研究/查/了解"这些词本身没有任何问题，
   加了边界就是好行为，不要因为出现了这些词就判 endpoint：
   ✅ "研究一个竞品的官网"     有"一个" → null
   ✅ "查10分钟面试技巧视频"   有时长   → null
   ✅ "看完一集读2分钟书"      有时长   → null
   ❌ "研究一下竞品"           什么都没有 → endpoint
   ❌ "背单词"                 什么都没有 → endpoint

**判成 aspiration / outcome 的一律给 null**——它压根还不是行为，缺的是动作本身。

【输出】必须是合法 JSON，不要输出其他内容：
{"results":[{"id":"原样返回输入的id","type":"habit","reason":"不超过20字","blocker":null}]}
blocker 只能是 "endpoint" 或 null。
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

const CONCRETE_PROMPT = `你是福格行为设计（BJ Fogg, Tiny Habits）的教练。

用户有一条行为，问题是**执行时会卡住**：要么中间得当场判断，要么不知道做到哪算完。
你的任务：把它改写成**做完了自己一眼就知道**的版本。

## 铁律：动作不许换

原文写的是什么动作，改写后还得是什么动作。你只能给它**加边界**，不能换成另一件事。

- 原文"看/读" → 改写后还得是看/读，**不能变成"写"**
- 原文"查/搜" → 改写后还得是查/搜
- 原文"练/做" → 改写后还得是练/做

❌ 错误示范（把"看"调包成"写"，成了另一件事）：
   「看一下面试的技巧」→「写出3个最可能被问到的问题」
   用户想的是从外面获取信息，你让他从自己脑子里掏，货不对版。

✅ 正确示范（动作还是"看"，只是给了边界和产出）：
   「看一下面试的技巧」→「看一篇面试技巧文章，把其中3条记在备忘录里」
   「看一下面试的技巧」→「看10分钟面试技巧视频」
   「看一下面试的技巧」→「读完一篇面试技巧文章」

## 加边界的两个手法（选一个或都用）

1. **限定数量或范围**：一篇 / 3条 / 前3段 / 10分钟 / 一个视频
2. **要求留下痕迹**：记在备忘录 / 划线 / 截图 / 写一句话总结

数字用小的（1、2、3、5、10分钟），别用 10篇、30分钟——
这不是要他做完，是要他能开始、并且知道什么时候可以停。

## 中间要判断的怎么改

把"判断/评估"换成**数出来**，动作还是同一个：
   「判断这份文稿是否 work」→「挑出文稿里3个说不通的地方」
   （还是在评估文稿，只是给了个具体的数）

## 一句话塞了好几步的

只留**第一步**，后面的删掉：
   「读文稿→判断是否work→不work就和AI沟通调整」→「读完文稿，写下3个疑问」

输出格式（必须是合法 JSON，不要输出其他内容）：
{"behaviors":[{"text":"改写后的行为","type":"onetime"}]}

## 写法：一句顺口的话，不是"原文 + 补丁"

❌ 「在网上查产品经理都在看什么书，看1篇推荐书单文章」——把原句整个抄一遍再接一段，啰嗦
❌ 「看一篇面试技巧文章，读完即可」——"读完即可"不是人话
✅ 「查一篇产品经理书单文章」
✅ 「读完一篇面试技巧文章」

原句里多余的字该删就删，只要**动作**和**对象**留着就行。
每条尽量不超过 15 个字，像自己给自己写的备忘录。

规则：
1. 给 3 个，动作全都和原文一致，只是边界不同（数量 / 时长 / 产出形式）
2. 每一条都要能回答"做完了没有"，答案是明确的是或否
3. 写成一句顺口的短句，别把原文照抄一遍再打补丁
4. type 沿用原行为的类型（不确定就用 onetime）`;

const VALID_TYPE = new Set<string>(["aspiration", "outcome", "onetime", "habit", "stop"]);
const BREAKDOWN_PROMPT = `把一个任务拆成几个**能直接动手做**的步骤。

【铁律一：穷尽，不筛选】
拆出来的步骤合起来必须**覆盖这个任务的全部**。
**绝对不要**判断哪一步更重要、更值得做，也不要因为某步麻烦就省掉——
少一步这个任务就完不成。要不要做、先做哪个，不归你管。

【铁律二：每一步都要过照片测试】
能拍一张照片，照片里有人正在做它。
  ✗ 梳理简历结构     ✓ 打开简历文档，把最近一段工作经历删掉重写
  ✗ 熟悉一下岗位     ✓ 把 JD 里的任职要求抄到备忘录里
  ✗ 准备自我介绍     ✓ 把自我介绍写成逐字稿，念三遍

【铁律三：第一条必须是最容易起步的那一条】
第一条的作用是"让人动起来"，所以要小到几乎不需要下决心——
往往就是"打开某个东西"。后面的可以正常大小。

【其他】
- 给 3-6 条，按实际执行顺序排
- 每条不超过 20 字
- 每条都要有终点：说得出做到哪算完（限定数量/范围，或要求留下痕迹）
- 如果这个任务本身已经足够具体、一步就能做完，就只返回它自己一条

【输出】必须是合法 JSON，不要输出其他内容：
{"subtasks":["第一步","第二步"]}`;

// 只剩「有没有边界」这一种。timing/decision/effort 都撤了——
// 缺锚点看习惯表里 anchor 字段有没有值就行（不会误判），费不费力只有你自己知道
const VALID_BLOCKER = new Set<string>(["endpoint"]);
const WAND_TYPE = new Set<string>(["onetime", "habit", "stop"]);

export type LLMBehavior = { text: string; type: BehaviorType };
export type BehaviorBlocker = "timing" | "decision" | "endpoint";

export type LLMJudgement = {
  id: string;
  type: BehaviorType;
  reason: string;
  blocker?: BehaviorBlocker;
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
  think = false,
): Promise<LLMJudgement[] | null> {
  const payload = JSON.stringify({ goal: goal ?? "", items });
  const parsed = await callLLMJson(SORT_PROMPT, payload, think ? { think: true } : {});
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
        blocker: VALID_BLOCKER.has(String(o?.blocker)) ? (String(o?.blocker) as BehaviorBlocker) : undefined,
      };
    })
    .filter((x): x is LLMJudgement => x !== null);
}

/** 改具体：把"执行时会卡住"的行为改写成有明确终点或产出物的版本 */
/** 把一个任务拆成子步骤。穷尽不筛选——和焦点地图的取舍逻辑正相反 */
export async function breakdownTaskWithLLM(
  title: string,
  goal?: string,
): Promise<string[] | null> {
  const user = goal ? `我的目标：${goal}\n要拆的任务：${title}` : `要拆的任务：${title}`;
  const parsed = await callLLMJson(BREAKDOWN_PROMPT, user, { think: true, temperature: 0.3 });
  if (parsed === null) return null;
  const raw = (parsed as { subtasks?: unknown })?.subtasks;
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  for (const it of raw) {
    const t = String(it ?? "").trim().slice(0, 60);
    if (t) out.push(t);
  }
  return out.slice(0, 8);
}

export async function concreteWithLLM(text: string, goal?: string): Promise<LLMBehavior[] | null> {
  const user = goal ? `我的目标：${goal}\n卡住的这条行为：${text}` : `卡住的这条行为：${text}`;
  const parsed = await callLLMJson(CONCRETE_PROMPT, user, { think: true, temperature: 0.4 });
  if (parsed === null) return null;
  return pickBehaviors((parsed as { behaviors?: unknown })?.behaviors);
}

/** 改小：把"影响力大但做不到"的行为拆成不需要意志力的版本 */
export async function shrinkWithLLM(text: string, goal?: string): Promise<LLMBehavior[] | null> {
  const user = goal ? `我的目标：${goal}\n做不到的这条行为：${text}` : `做不到的这条行为：${text}`;
  const parsed = await callLLMJson(SHRINK_PROMPT, user, { think: true, temperature: 0.4 });
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
  const parsed = await callLLMJson(WAND_PROMPT, lines.join("\n"), {
    think: true,
    temperature: 0.5,
  });
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
