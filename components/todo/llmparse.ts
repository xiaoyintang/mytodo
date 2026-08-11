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

const STRUCTURE_RESULTS_PROMPT = `你是个人目标的“结果结构教练”。用户会给你一个较大的目标，以及已经想出的候选行为。

你的任务不是继续拆行为，而是找回这些行为共同服务的中间结果，把扁平行为整理成 2-5 条“关键结果/结果路径”。

【结果路径的定义】
- 回答“什么变化发生了，才说明我更接近目标”
- 它不是一个当天能做完的动作，也不是“学习、准备、提升、优化”这种活动名称
- 同一结果下面的行为应该可以在同一张焦点地图里比较影响力
- evidence 是可验证的达成证据；没有基线时不要编造“从 X 提升到 Y”，可用次数、质量标准、外部反馈或可观察状态

【分组规则】
1. 按行为的因果目的分组，不要只按动词或表面关键词分组
2. 每个行为最多归属一个主要结果；拿不准或明显无关的可以不分组，留在未归属
3. 相互重叠的结果要合并，最终通常 3-5 条；目标简单时可以只有 2 条
4. title 不超过 20 个字，写结果而不是行动
5. evidence 不超过 45 个字，写“怎样算有进展/达成”
6. behaviorIds 只能使用输入中真实存在的 id，不要改写 id

【输出】必须是合法 JSON，不要输出其他内容：
{"results":[{"title":"获得更多匹配的面试机会","evidence":"连续四周获得稳定的目标岗位面试邀请","behaviorIds":["b-1","b-2"]}]}`;

const COACH_GOAL_RESULTS_PROMPT = `你是个人目标的“关键结果教练”。关键结果位于目标和行为之间，必须先把“什么变化算推进”说对，后面才值得拆行为。

用户会给出 goal、mode 和 existingResults。mode 有两种：
- ideate：还没有关键结果，请从目标出发提出 2-5 条互不重叠的结果路径
- review：审查已有关键结果，只提出真正必要的新增或替换；没有必要改就返回空数组

【好关键结果的标准】
1. 是可观察的状态、能力、质量、外部反馈或阶段成果，不是“学习、准备、优化、完善、练习”等活动
2. 与目标存在清楚的因果关系；达成后确实更接近目标
3. 同组结果粒度相近、尽量不重叠，并覆盖目标的主要成功条件
4. evidence 写怎样确认有进展。没有基线时不虚构“从 X 到 Y”，可以使用次数、质量标准、外部反馈或可观察状态
5. title 不超过 24 个字，evidence 不超过 50 个字

【绝对禁止替用户发明标准】
- 如果输入里没有用户亲自给出的数字、期限或量表，title 和 evidence 里也不许出现你自行添加的分钟、小时、天数、周数、次数、百分比、分数或医学阈值
- 不要引入焦虑量表、模拟压力测试、睡眠障碍诊断等用户没有提到的专业测量
- 对主观目标，用“多数时候能观察到什么变化”“来自本人或他人的什么反馈”表达证据，不替用户武断定义达标线

【变更规则】
- 新增使用 operation="add"
- 改写已有结果使用 operation="replace"，replaceId 必须原样引用 existingResults 中真实存在的 id
- 不直接删除结果；发现重复时在 summary 里指出，变更建议优先改写其中一条
- reason 用一句话说明为什么建议这项变更，不超过 30 个字

【输出】必须是合法 JSON，不要输出其他内容：
{"summary":"对整组结果的一句判断","results":[{"operation":"add","title":"获得更多匹配岗位的面试机会","evidence":"目标岗位的面试邀请持续出现","reason":"覆盖求职漏斗入口"},{"operation":"replace","replaceId":"gr-1","title":"项目挑战点能够被证据支撑","evidence":"能用数据、决策依据和复盘回应追问","reason":"原结果写成了准备活动"}]}`;

const CLARIFY_GOAL_RESULT_PROMPT = `你是个人目标的“关键结果编辑”。用户会给出 goal、title 和 evidence。

请检查这条内容是不是“发生什么变化，才说明目标被推进”，而不是任务、行为、愿望复述或空泛能力词。

规则：
- 与目标直接相关、已经是可观察结果且 evidence 足够清楚 → kind="ready"
- 仍是活动/行为、过于抽象或达成证据不清楚 → kind="rewrite"
- 改写要保留用户原意，不虚构数字和基线
- suggestionTitle 不超过 24 个字，suggestionEvidence 不超过 50 个字
- issue 只说最关键的问题，不超过 24 个字

输出只能是以下合法 JSON 之一：
{"kind":"ready","issue":"这是一条可观察的结果"}
{"kind":"rewrite","issue":"现在写的是准备活动，不是结果","suggestionTitle":"项目挑战点能够被证据支撑","suggestionEvidence":"能用数据、决策依据和复盘回应追问"}`;

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

【先判断：它到底需不需要拆】
只有当完成任务需要经过多个可以独立完成的阶段或产出物时，才拆解。
如果标题本身就是一个动作，并且动作有天然终点，就原样返回一条：
  「给小王发送合同确认邮件」→ ["给小王发送合同确认邮件"]
  「买一个遮光窗帘」→ ["买一个遮光窗帘"]
  「打电话确认会议时间」→ ["打电话确认会议时间"]

**绝对不要**把原子动作拆成操作界面的点击或肢体动作：
  ✗ 打开邮箱 → 填收件人 → 填主题 → 点击发送
  ✗ 打开购物软件 → 搜索商品 → 点击购买
这些只是完成一个自然动作时顺手发生的操作，不是值得管理的行动步骤。

【铁律一：穷尽，不筛选】
拆出来的步骤合起来必须**覆盖这个任务的全部**。
**绝对不要**判断哪一步更重要、更值得做，也不要因为某步麻烦就省掉——
少一步这个任务就完不成。只按实际依赖关系排序，不做重要性取舍。

【铁律二：每一步都要过照片测试】
能拍一张照片，照片里有人正在做它。
  ✗ 梳理简历结构     ✓ 重写简历里最近一段工作经历
  ✗ 熟悉一下岗位     ✓ 标出 JD 里的 3 条核心要求
  ✗ 准备自我介绍     ✓ 写出 200 字自我介绍稿

【铁律三：第一条必须是现在就能开始的下一步行动】
第一条不能依赖前面尚未完成的步骤，必须同时说清：
- 做什么动作
- 对什么对象做
- 做到哪里算完成

它要足够小，但也要形成一次**有意义的推进**。不要把动作拆成无意义的肢体步骤：
  ✗ 打开电脑 / 打开软件 / 拿出纸笔
  ✓ 在备忘录列出视频的 3 个要点
只有当「打开并定位到某个内容」本身就能解除阻塞时，才可以把“打开”作为一步。

【铁律四：一步只承担一个主要动作】
如果一句里出现“然后 / 再 / 并且 / 完成后”，优先拆开；但不要把一个自然动作机械地切碎。
工具和界面操作只是动作的执行方式，不单独成步；每一步应带来一个看得见的推进或产出。

【其他】
- 需要拆时给 2-6 条，按实际执行顺序排；不需要拆时只返回原任务一条
- 每条不超过 20 字
- 每条都要有终点：说得出做到哪算完（限定数量/范围，或要求留下痕迹）
- 如果这个任务本身已经足够具体、一步就能做完，就只返回它自己一条

【输出】必须是合法 JSON，不要输出其他内容：
{"subtasks":["第一步","第二步"]}`;

const CLARIFY_NEXT_ACTION_PROMPT = `你是一个“下一步行动”教练。用户会给你一个父任务和它当前排在最前面的行动步骤。

你的目标不是打分，也不是重新拆完整个任务，而是判断：这句话能不能让人读完后直接开始，并且做完时知道自己已经完成。

按以下顺序检查：
1. 有具体动作：不是“推进、处理、准备、优化、想一下”这类抽象占位词
2. 有具体对象：知道要对什么东西做这个动作
3. 有完成边界：有数量、范围、时长、可见产出，或动作本身有天然终点（如发送、购买、发布），能回答“做完了吗”
4. 只有一个主要动作：不是把多个先后步骤塞在一句话里
5. 能推进父任务：不是“打开电脑、拿出纸笔”这种几乎没有独立价值的动作
6. 完成标准在自己控制内：如果需要别人回复，当前行动应结束在“发出询问”，不要结束在“拿到回复”

不要臆测用户是否有时间、文件、权限或动力；仅根据文字本身判断。也不要把自然动作拆成点击、移动鼠标等机械步骤。

如果已经能直接行动，输出：
{"ready":true}

如果还不够清楚，只指出**最影响开工的一个问题**，并给一个改写：
{"ready":false,"issue":"一个简短问题","suggestion":"改写后的下一步行动"}

改写规则：
- 原动作有实际意义时，必须保留核心动词和对象，不把“看/研究/联系”偷换成“写/收集/等待”
- 例如「研究面试技巧」应改成「研究 1 篇面试技巧文章」，不能改成「阅读文章并记要点」；后者同时换了动作又增加了第二步
- 只有“打开软件、处理、推进”这类动作本身没有独立推进价值时，才改成父任务里第一个有意义的动作
- 补上最小但明确的边界，一句话只保留一个主要动作
- 形成一次有意义的推进，而不是无意义地变小
- 优先采用能在一个短时段完成的小边界，例如 1 个来源/章节、3 个要点、10 分钟或 100-300 字
- “写初稿/做完初版”如果仍覆盖整个交付物，不算变小；应缩到第一个自然段、开头 30 秒或一个页面
- 不要把“下一步”扩成整个交付物，也不要一次要求研究多篇资料
- 尽量不超过 20 个字，像写给自己的待办
- 必须输出合法 JSON，不要输出解释或其他字段`;

const CLARIFY_BEHAVIOR_PROMPT = `你是福格行为设计里的“行为表达教练”。用户会给你一个目标和一条准备放进焦点地图比较的候选行为。

你只检查这条话是否已经表达成一个适合比较的行为，不替用户判断它影响力高不高、本人做不做得到，也不要求现在添加触发时机——这些分别由焦点地图滑块和后面的习惯表处理。

按顺序检查：
1. 它是行为，不是愿望、成果或状态；一般能通过照片测试
2. 有具体动作和对象，不是“提升、改善、坚持、准备、处理”这类抽象占位词
3. 一句话只有一个主要行为，不把“然后、并且、做完后”连接的多件事塞在一起
4. 有完成边界：数量、范围、时长、可见产出，或者动作本身有天然终点（如发送、购买、关闭）
5. stop 类是例外：“睡前不刷短视频”这类明确要停止什么、在什么范围内停止的说法，可以是合格行为，不要强行改成正向动作

【行为与成果最容易混淆的地方】
- “每周发布一期视频、完成一份报告、做出一个产品原型”虽然含有动词和数量，但交付它通常要经过多个阶段，仍然是成果，返回 expand
- “点击发布视频、给客户发送报告、画出首页线框”是一次现场能够发生的行为
- 如果输入的当前分类是 aspiration 或 outcome，原则上返回 expand；不要因为句子里恰好有一个动词就放行

输出只能是以下三种合法 JSON 之一：
- 已经适合比较：{"kind":"ready"}
- 仍是愿望或成果，需要发散出多条行为：{"kind":"expand","issue":"一个最关键的问题"}
- 已是行为但表达不够清楚：{"kind":"rewrite","issue":"一个最关键的问题","suggestion":"一个改写"}

改写规则：
- 只解决最关键的一个问题，不打分、不说教
- issue 不超过 20 个字，用陈述句只说问题，不提问，也不在 issue 里继续给建议
- 保留原来的核心动词和对象；若一句含多个行为，只保留第一个能独立推进的行为
- 用最小但有意义的边界；“看完一本书、写完初稿”仍然太大，应缩到一章、10 分钟或第一个段落
- 不要缩成打开软件、拿出纸笔等机械动作
- 不要擅自添加“每天、早上、饭后”等触发时机
- 尽量不超过 20 个字，像写给自己的行为卡
- 如果它还是愿望或成果，必须返回 expand，不能武断地改成唯一一条行为，因为同一个成果可能有很多实现路径`;

// 只剩「有没有边界」这一种。timing/decision/effort 都撤了——
// 缺锚点看习惯表里 anchor 字段有没有值就行（不会误判），费不费力只有你自己知道
const VALID_BLOCKER = new Set<string>(["endpoint"]);
const WAND_TYPE = new Set<string>(["onetime", "habit", "stop"]);

export type LLMBehavior = { text: string; type: BehaviorType };
export type LLMGoalResult = {
  title: string;
  evidence?: string;
  behaviorIds: string[];
};
export type LLMGoalResultChange = {
  operation: "add" | "replace";
  replaceId?: string;
  title: string;
  evidence?: string;
  reason?: string;
};
export type GoalResultClarification = {
  kind: "ready" | "rewrite";
  issue?: string;
  suggestionTitle?: string;
  suggestionEvidence?: string;
};
export type BehaviorBlocker = "timing" | "decision" | "endpoint";
export type NextActionClarification = {
  ready: boolean;
  issue?: string;
  suggestion?: string;
};
export type BehaviorClarification = {
  kind: "ready" | "expand" | "rewrite";
  issue?: string;
  suggestion?: string;
};

export type LLMJudgement = {
  id: string;
  type: BehaviorType;
  reason: string;
  blocker?: BehaviorBlocker;
};

/** 从一个大目标和现有行为中提议结果层；只返回建议，不在服务端改任何数据。 */
export async function structureGoalResultsWithLLM(
  goal: string,
  items: Array<{ id: string; text: string }>,
): Promise<LLMGoalResult[] | null> {
  const parsed = await callLLMJson(
    STRUCTURE_RESULTS_PROMPT,
    JSON.stringify({ goal, behaviors: items }),
    { think: true, temperature: 0.3 },
  );
  if (parsed === null) return null;
  const raw = (parsed as { results?: unknown })?.results;
  if (!Array.isArray(raw)) return null;

  const knownIds = new Set(items.map((item) => item.id));
  const usedIds = new Set<string>();
  return raw
    .map((entry): LLMGoalResult | null => {
      const result = entry as Record<string, unknown>;
      const title = String(result.title ?? "").trim().slice(0, 40);
      if (!title) return null;
      const evidence = String(result.evidence ?? "").trim().slice(0, 90);
      const behaviorIds = Array.isArray(result.behaviorIds)
        ? result.behaviorIds
            .map((id) => String(id ?? "").trim())
            .filter((id) => knownIds.has(id) && !usedIds.has(id))
        : [];
      behaviorIds.forEach((id) => usedIds.add(id));
      return { title, evidence: evidence || undefined, behaviorIds };
    })
    .filter((result): result is LLMGoalResult => result !== null)
    .slice(0, 5);
}

/** 从目标直接发散关键结果，或检查已有结果；只返回待确认的新增/替换建议。 */
export async function coachGoalResultsWithLLM(
  goal: string,
  existingResults: Array<{ id: string; title: string; evidence?: string }>,
  mode: "ideate" | "review",
): Promise<{ summary?: string; results: LLMGoalResultChange[] } | null> {
  const parsed = await callLLMJson(
    COACH_GOAL_RESULTS_PROMPT,
    JSON.stringify({ goal, mode, existingResults }),
    { think: true, temperature: 0.1 },
  );
  if (parsed === null) return null;
  const raw = (parsed as { results?: unknown })?.results;
  if (!Array.isArray(raw)) return null;
  const knownIds = new Set(existingResults.map((result) => result.id));
  const results = raw
    .map((entry): LLMGoalResultChange | null => {
      const item = entry as Record<string, unknown>;
      const operation = String(item.operation ?? "add") === "replace" ? "replace" : "add";
      const replaceId = String(item.replaceId ?? "").trim();
      if (operation === "replace" && !knownIds.has(replaceId)) return null;
      const title = String(item.title ?? "").trim().slice(0, 48);
      if (!title) return null;
      const evidence = String(item.evidence ?? "").trim().slice(0, 100);
      const reason = String(item.reason ?? "").trim().slice(0, 60);
      return {
        operation,
        ...(operation === "replace" ? { replaceId } : {}),
        title,
        ...(evidence ? { evidence } : {}),
        ...(reason ? { reason } : {}),
      };
    })
    .filter((result): result is LLMGoalResultChange => result !== null)
    .slice(0, 6);
  const summary = String((parsed as { summary?: unknown }).summary ?? "").trim().slice(0, 120);
  return { ...(summary ? { summary } : {}), results };
}

/** 检查单条关键结果，必要时给一个结果式改写。 */
export async function clarifyGoalResultWithLLM(
  goal: string,
  title: string,
  evidence?: string,
): Promise<GoalResultClarification | null> {
  const parsed = await callLLMJson(
    CLARIFY_GOAL_RESULT_PROMPT,
    JSON.stringify({ goal, title, evidence: evidence ?? "" }),
    { think: true, temperature: 0.2 },
  );
  if (parsed === null) return null;
  const item = parsed as Record<string, unknown>;
  const kind = item.kind === "ready" ? "ready" : "rewrite";
  const issue = String(item.issue ?? "").trim().slice(0, 60);
  const suggestionTitle = String(item.suggestionTitle ?? "").trim().slice(0, 48);
  const suggestionEvidence = String(item.suggestionEvidence ?? "").trim().slice(0, 100);
  return {
    kind,
    ...(issue ? { issue } : {}),
    ...(suggestionTitle ? { suggestionTitle } : {}),
    ...(suggestionEvidence ? { suggestionEvidence } : {}),
  };
}

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

/** 检查当前下一步是否足够清楚；不打分，只返回一个最重要的问题和一个改写建议 */
export async function clarifyNextActionWithLLM(
  text: string,
  parentTask: string,
): Promise<NextActionClarification | null> {
  const user = `父任务：${parentTask}\n当前下一步：${text}`;
  const parsed = await callLLMJson(CLARIFY_NEXT_ACTION_PROMPT, user, {
    think: true,
    temperature: 0.2,
  });
  if (parsed === null || typeof parsed !== "object") return null;

  const raw = parsed as Record<string, unknown>;
  if (raw.ready === true) return { ready: true };
  if (raw.ready !== false) return null;

  const issue = String(raw.issue ?? "").trim().slice(0, 40);
  const suggestion = String(raw.suggestion ?? "").trim().slice(0, 60);
  if (!issue || !suggestion) return null;
  return { ready: false, issue, suggestion };
}

/** 检查候选行为的表达质量；不碰焦点地图的影响力/可行性判断 */
export async function clarifyBehaviorWithLLM(
  text: string,
  goal: string,
  behaviorType?: string,
): Promise<BehaviorClarification | null> {
  const user = `目标：${goal}\n当前分类：${behaviorType || "未知"}\n候选行为：${text}`;
  const parsed = await callLLMJson(CLARIFY_BEHAVIOR_PROMPT, user, {
    think: true,
    temperature: 0.2,
  });
  if (parsed === null || typeof parsed !== "object") return null;

  const raw = parsed as Record<string, unknown>;
  const kind = String(raw.kind ?? "");
  if (kind === "ready") return { kind: "ready" };

  const issue = String(raw.issue ?? "").trim().slice(0, 50);
  if (!issue) return null;
  if (kind === "expand") return { kind: "expand", issue };
  if (kind !== "rewrite") return null;

  const suggestion = String(raw.suggestion ?? "").trim().slice(0, 60);
  if (!suggestion) return null;
  return { kind: "rewrite", issue, suggestion };
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
