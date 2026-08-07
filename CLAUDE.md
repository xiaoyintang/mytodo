# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 常用命令

```bash
npm run dev      # 启动开发服务器 (http://localhost:3000)
npm run build    # 生产构建
npm run lint     # 运行 ESLint
```

## 架构说明

这是一个 Todo 应用，技术栈：Next.js 15 App Router + React 19 + TypeScript + Tailwind v4。

### 核心数据流

```
TodoApp.tsx（状态管理中心）
├── tasks 状态通过 useLocalStorageState 管理（key: "mytodo.tasks.v1"）
├── entries 时间记录状态（key: "mytodo.entries.v1"，柳比歇夫时间台账）
├── cycleTaskStatus(taskId) - 状态循环：todo → in_progress → done → todo
├── createTask(taskData) - 创建任务
├── deleteTask(taskId) - 删除任务
├── updateTask(taskId, updates) - 更新任务（标题、日期等）
├── addEntry / addEntries / deleteEntry - 时间记录增删
│
├── TodoDayView.tsx - 日视图，按时间分组
│   ├── 分组规则：上午 (00:00-11:59)、下午 (12:00-17:59)、晚间 (18:00+)
│   ├── 简单任务点击主体 → 状态循环；有子步骤的任务点击主体 → 展开步骤
│   ├── 有子步骤时，第一条未完成步骤直接露出为「下一步」，点它即可完成并推进到下一条
│   ├── 点击「2/6」小按钮 → 展开完整步骤（**必须自己一个 hit target**）
│   └── 点击编辑按钮 → 打开 TaskBottomSheet
│
├── TodoWeekView.tsx - 周视图，每日一行列表
│   ├── 任务按开始时间排序
│   ├── 默认显示 3 个任务 + "+N" 折叠
│   └── 点击任务 → 打开 TaskBottomSheet
│
├── TaskBottomSheet.tsx - 任务详情弹窗（日视图/周视图共用）
│   ├── 标题编辑（点击标题进入编辑，失焦保存）
│   ├── 日期编辑（点击日期展开周选择器）
│   ├── 时间编辑（点击时间展开 TimePicker，带确认/取消）
│   ├── 「行动步骤」区：第一条未完成步骤突出为「当前下一步」，其余分成后续/已完成
│   ├── 支持 AI 拆成步骤 / 手动加一步 / 编辑 / 打勾 / 删除
│   ├── 未完成步骤支持鼠标/触摸拖动排序（键盘方向键可操作），也可直接在当前下一步前插入
│   ├── 「帮我说清楚」只检查当前下一步：不打分，只给一个问题和一个可选改写
│   ├── 三态状态按钮（待办→进行中→已完成）
│   ├── 删除按钮（二次确认）
│   └── 内容可滚动（max-h-[85vh]）+ Footer sticky
│
├── AddTaskModal.tsx - 新增任务弹窗（支持 Day/Week 模式）
│   ├── 内容区可滚动（max-h-[90vh]）
│   ├── Footer sticky 底部 + 安全区适配
│   ├── 时间安排模式切换：固定时间段 / 时长目标（targetMinutes）
│   └── TimePicker.tsx - 自定义时间选择器（小时/分钟滚动）
│
├── HabitLabView.tsx - 「习惯」视图 = 习惯实验室（福格行为设计）
│   ├── 子 tab：我的习惯（HabitTracker，按目标分组、可折叠、直接加）/ 我的目标
│   ├── 我的目标 → 愿望列表 → 点进去就是 FocusMapView（**只有一页，没有子 tab**）
│   └── 自动判定：新条目 700ms 后攒成一次 /api/behavior (mode:sort)，
│       判定中的 id 传给地图显示"判定中…"，判失败显示"未判定"（不假装还在判）。
│       **去重 key 必须是 `id + 文字`**——改完文字会退回未判定等重判，但 id 没变，
│       只按 id 记会被当成"问过了"跳过，那就永远停在未判定
│
├── FocusMapView.tsx - 焦点地图，一个愿望下的全部条目都在这一页
│   ├── 散点图（实时）+ 排序（默认/影响力/最该先做）+ 多选批量栏
│   ├── 加一条（回车，自动判定）/ 魔法棒（发散 8-10 条，勾选后收进来）
│   ├── 每行：文字可改、类型可改判、两根滑块、删除
│   ├── 未判定 → "判定中…"，先不给滑块；愿望/成果 → 行内「拆成行为」
│   ├── hasDecision → 行内橙色警告「这条不好执行」+ AI 给的原因
│   ├── 已通过基础检查的行为 → 可选「帮我说清楚」；只检查表达，不替用户判断两轴
│   ├── 影响力高但做不到 → 「改小」（AI 拆成不需要意志力的版本）
│   └── 出口：可重复→加入习惯表（可撤回）；一次性→排到某天（可撤回排期）
│
└── TimeLogView.tsx - 「记录」视图（柳比歇夫时间记录法）
    ├── 计时指令（`handleTimerCommand`，在正常解析之前拦截）
    │   ├── 开始：「现在 X」/「现在开始 X」/「开始 X」/「马上 X」/「这就 X」
    │   │   省掉"开始"两个字是口语常态，必须支持；但省略式**必须有"现在/这就/马上"打头**，
    │   │   否则「复盘面试」这种纯补记会被误当成开始计时
    │   ├── 停止：「停」「停止」「结束」…
    │   └── X 里带时长/时刻的一律不触发计时，交给正常解析当补记
    ├── 自然语言快速记录框（配合手机键盘语音输入即可"口述记账"）
    ├── 解析优先走 /api/parse（AI），失败/未配 key 降级 nlparse.ts 规则解析
    ├── 解析结果先预览（可逐条删除），确认后写入 entries
    ├── 记录标题与当日任务标题匹配时自动关联 taskId（计入任务进度）
    ├── 今日台账：按时间排序的流水 + 当日总时长
    ├── 今日汇总：正事/娱乐/休息环形图（CategoryDonut）+ 按事项聚合的条形图（按类别上色）
    │   └── 每行的分类标签可点开改（「归为 正事/娱乐/休息」），改完记为用户判定
    └── 本周汇总：同上，默认收起
```

### 时间记录（柳比歇夫模式）

- 任务可设 `targetMinutes`（时长目标），代替固定时间段：不限几点做，累计投入满目标即达成
- 日视图卡片和 TaskBottomSheet 显示进度条（`taskLoggedMinutes` 聚合关联 entries）
- TaskBottomSheet 提供"记一笔"：快捷时长按钮 + 自定义分钟数
- AI 解析：`app/api/parse/route.ts`，OpenAI 兼容接口（DeepSeek / 硅基流动）
  - 环境变量：`LLM_API_KEY`（必填）、`LLM_BASE_URL`、`LLM_MODEL`，见 `.env.local.example`
  - 未配置 key 时返回 501，前端自动降级为 `components/todo/nlparse.ts` 规则解析
- 工具函数：`components/todo/time.ts`（formatMinutes、taskLoggedMinutes、matchTaskByTitle）

### 记录分类（正事/娱乐/休息）

判定优先级（`components/todo/category.ts`）：

1. 用户手动改过的同名记录（`categorySource: "user"`）——一次纠正对所有同名记录永久生效
2. 任意一条已分类的同名记录
3. 关键词规则 `ruleClassify()`：先看工作强信号词（运营/养号/复盘…压过平台名），再"命中最长关键词胜出"
4. 都认不出来 → `/api/classify` 问 AI，结果写回 entries（`categorySource: "ai"`），每个名字一次会话只问一次

分类存在 `TimeEntry` 上，跟着现有云同步走，多设备一致。AI 不可用（501/断网）时显示"未分类"，不影响其他功能。

### 习惯实验室（福格行为设计）

分三期做，目前**一期已完成**：

| 期 | 内容 | 状态 |
|---|---|---|
| 一 | 愿望 + 收集口 + 批量判定 + 改判 + 魔法棒 | ✅ |
| 二 | 焦点地图（两根滑块）→ 黄金行为按 impact×feasibility 排序 | ✅ |
| 三 | 黄金行为 → 微习惯 + 锚点 + 打卡计数 | ✅ |
| 四 | 锚点从时间台账里推荐；打卡数据回流校正横轴 | 待做 |

一条行为判定完之后各有各的出口，别让任何一类变成死路：
- **可重复行为(habit/stop)** → 焦点地图 → 黄金行为 → 加入习惯表
- **一次性任务(onetime)** → 「排到某天」直接建一个 Task 进日视图，
  行为卡上记 `taskId`，之后显示"已排到 X月X日"，不会重复排
- **愿望/成果** → 「拆成行为」（对这一条挥魔法棒）

**铁律：收集与整理必须分离。**收集口回车即存,不调 AI、不问类型、不要求任何决定——
用户的瓶颈是决策成本,任何在"倒想法"时插入的判断都会让他不用这个功能。
判定是独立动作,他自己决定什么时候点。

焦点地图的交互踩过三次坑，别退回去：
1. 做成过「一次一张卡两个按钮」的向导 → "跟做问卷一样"，看不到全局、不能跳着来。改成列表。
2. 用过二选一（大/小）→ 只能给出"够不够格"，给不出"哪个最优"。改成 0-100 滑块。
   横向滑块顺带绕开了二维自由拖拽绕不开的问题：**横向手势不和页面上下滚动打架**。
3. 分过三个 tab（影响力 / 可行性 / 结果）→ 排可行性时忘了刚才影响力打了多少；
   结果页"像魔术一样出现"；想比较第 9 和第 4 还得来回滚。**现在合成一页**：
   - 一行两根滑块，两个维度同时看得见
   - 散点图在顶上实时更新，拖一下就动，不是最后才变出来
   - **排序是关键**：想比较两条谁影响力高？点「按影响力」排一下它俩就挨着了，不用记数字。
     排序是一个动作不是实时绑定——实时的话拖滑块时行会在手底下乱跳
   - 多选 + 底部固定操作栏批量处理，不给每条都塞一个大按钮

黄金行为排序用 `impact × feasibility` 而不是求和——乘积会惩罚任何一轴的短板。

### 判定只剩两条：是不是行为 / 有没有边界

```
action    这还不是行为   「我想变自信」——没有动作可做   → 拆成行为（魔法棒）
endpoint  这行为没边界   「研究一下竞品」——不知道做到哪算完 → 给它一个边界
```

**曾经有五条**（还判过缺时机 timing、要判断 decision、太费力 effort），砍到两条。
直接原因是**误报太多，一直跳感叹号**，另外三条各有各的去处：

| 撤掉的 | 为什么 | 去哪了 |
|---|---|---|
| timing 缺锚点 | 一条行为还没成为习惯时问"什么时候做"没意义 | 习惯表看 `Habit.anchor` 有没有值——**字段判定，不用 AI，不会误报** |
| decision 要判断 | **一句话改不掉它**。中途要停下来想，是因为这句话里裹着好几个动作 | 任务详情页的「拆解」 |
| effort 太费力 | 费不费力只有你自己知道 | 你自己往简单了设计，或者拆开做 |

**endpoint 判据的第一问是「这件事能不能多做一会儿？」**——不能（放手机、买窗帘、
发邮件，做完那一下就结束）→ 直接放过；能（改简历可以改 10 分钟也可以改 3 小时）
→ 必须有边界。

> 🔴 **"有明确的宾语"不等于"有终点"。**曾经用动词表（放/关/买/删/写出/做完）当判据，
> AI 把它推广成"只要有明确宾语就算有终点"，于是「改简历」以"改完即止"为由被放过。
> 实测欠触发到 5/12。换成"能不能多做一会儿"这一问之后 11/12，且误报没回来（12/12）。

**判据是「有没有边界」，不是「动词是什么」。**这里踩过一个自相矛盾的坑：
判定那边把「研究/查/了解」列成典型词抓人，改写那边的铁律又要求「动作不许换」，
于是 AI 自己改写出来的「研究一个竞品的官网」被 AI 自己拦下来，
**理由还写着"研究完一个竞品就结束"——判决和理由互相打脸**。现在的判法：

1. 动作有**天然终点**吗（放、关、买、删、发、写出、做完）→ 有就直接放过
2. 持续性动作（看、查、研究、学、练、背、复习）才看有没有边界：
   数量 / 范围 / 时长 / 痕迹，**四种有一种就算有**

实测 11/12（唯一漏的是「准备面试」，边界本来就模糊）。

### 三种"化整为零"，别混

| | 输入 → 输出 | 关系 | 在哪 |
|---|---|---|---|
| 魔法棒 | 愿望 → N 条行为 | **OR**，可替代，挑几个 | 焦点地图 |
| 拆解 | 任务 → N 步 | **AND**，缺一不可，全做 | 任务详情页 |
| 给边界 | 一句话 → 同一件事的清楚版 | 1→1 | 焦点地图 |

**两个 1→N 是反的**——魔法棒发散出来的是"十条路挑三条"，拆解出来的是"六步一步不能少"。
把它俩当成一回事，就会拿焦点地图去筛项目步骤，等于帮用户把项目做失败。

**焦点地图是排序工具，不是筛人工具。**所以一次性任务照样上地图
（「先改简历还是先刷真题」就是 ROI）。

### 主线 / 目标作用域（方案 A，规格见 09-app重构规格.md）

**「主线」不是新实体**——就是"某天主推哪几个目标"，底层是 `DayPlan.primaryAspirationIds`
挂 Aspiration id，不建 MainLine 表。

- **底部 tab 一个不动**（日/周/记录/习惯）。目标不是它们的同级——
  日/周/记录是"受日期约束的东西"，习惯是"不受日期约束的东西"，
  **目标是这些东西的来源**，是正交维度，所以放作用域条，不放并列项
- **常驻条**（`MainlineBar`）：标题下方、tab 栏上方，四个 tab 通用。
  两重身份：今日主线的只读展示 + 目标管理页入口
- **今日主线只读**，改只能去周视图——决策集中在周规划，日常执行零决策
- **习惯不受主线过滤**，每天照常全部出现（硬约束）。
  任务靠日程触发、习惯靠锚点触发，两套机制不能混
- 目标管理页（`GoalsView`）从常驻条进，不是 tab；「我的目标」子 tab 已从习惯 tab 搬走

日视图的两个主线落地（规格 §5 §8）：
- **非主线目标的任务默认折叠**（可展开，不阻止）。两条边界：
  ①**没归属目标的任务不折**——零必填，不填目标不该被惩罚；
  ②那天没排主线时一条都不折（没有"主次"这回事）
- **「今天那 1 件必做」（规格 §8）做过又撤了。**用户没提过这个需求，而且它
  和折叠重复解决"分主次"：折叠是自动的零决策，必做要你每天现选一件——
  这跟规格自己的原则三（日常执行零决策）打架。`DayPlan.mustDoTaskId` 字段保留，
  UI 全撤，以后想要能接回来
- 任务卡第二行带一个**写着目标名字**的浅色标签（光一个色点认不出是哪个目标）
- **任务的 `aspirationId` 只有两条来源**：
  ①从行为卡「排到某天」→ 继承那条行为的目标（它本来就是从那个目标拆出来的）；
  ②任务详情页「属于哪个目标」自己指
  **手动/AI 建的任务不自动归属**——曾经默认落到"那天主线的第一条"，
  结果「扔垃圾」这种杂事也被算进主线，既莫名其妙，又会污染以后"本周实际投入"的统计

阶段三（闭环）已完成：
- **TimeEntry 的目标归属只从 task/habit 复制（快照），不做任何推导**。
  ❌ 不做"默认填今日主线"的兜底——那会把杂事算进主线，污染"本周实际投入"；
  ❌ **绝不在开始计时前弹窗问归属**——计时是进入工作状态的扳机，前面加一道门就毁了它。
  归属事后在台账里点标签改。用复制不用 join：任务删了记录不变孤儿，
  任务改了归属**已发生的记录不跟着变**（台账记的是当时的事实）
- 记录 tab「本周投入」：`排 5 天 · 40分钟` 计划与实际并排，不做达标率、不做百分比，
  让差值自己说话
- 目标列表「两条腿」：`任务 N · 习惯 N · 本周 Xh`。任务腿=推进、习惯腿=维持，
  缺一条都走不动；为 0 标灰橙色，**不弹提示、不打分**
- 习惯统计：累计次数 + 最近 30 天做了几天。**不做 streak**——
  streak 越长断掉代价越大，而断掉是概率事件，期望结局是"越成功崩得越惨"

### 关键类型（components/todo/types.ts）

- `Task`：id, title, date, aspirationId?, startTime?, endTime?, status, priority?, tag?, targetMinutes?, subtasks?
- `SubTask`：id, title, done —— **内嵌在 Task 里，不单开表**（没有独立生命、跟着任务删、
  不需要跨任务查询；内嵌还白捡云同步——`tasks` 本来就同步）
- `TimeEntry`：id, date, title, minutes, startTime?, endTime?, taskId?, category?, categorySource?
- `EntryCategory`："正事" | "娱乐" | "休息"
- `Aspiration`：id, title, kind, createdAt, color?, weeklyLimit?（每周投入天数上限，null=不限）
- `DayPlan`：date, primaryAspirationIds（今日主线，可多条）, mustDoTaskId?
- `BehaviorCard`：id, aspirationId, text, type, typeSource?, reason?, hasDecision?, impact?, feasibility?
  - type: "unsorted" | "aspiration" | "outcome" | "onetime" | "habit" | "stop"
- `Habit`：id, title, anchor?, measure（"count" | "duration"）, behaviorId?, aspirationId?, createdAt
- `HabitLog`：id, habitId, date, at（发生型的一次打卡，一天可以多条）
- `TaskStatus`："todo" | "in_progress" | "done"
- `ViewMode`："day" | "week" | "log" | "habit"
- `ISODate`："YYYY-MM-DD" 格式字符串

### 样式系统

- CSS 变量定义在 `app/globals.css`，使用 `var(--color-xxx)` 引用
- Tailwind v4 + PostCSS（配置在 `postcss.config.mjs`）
- 图标使用 `lucide-react`

## 硬性约束

- localStorage key 必须保持 `mytodo.tasks.v1`（任务）和 `mytodo.entries.v1`（时间记录）
- 习惯实验室的 key：`mytodo.aspirations.v1` / `mytodo.behaviors.v1` / `mytodo.habits.v1` / `mytodo.habitlogs.v1` / `mytodo.dayplans.v1`
- 云同步（`sync.ts`）覆盖 tasks + entries + aspirations + behaviors + habits + habitLogs + dayPlans
  - **拉取时云端缺某个集合 → 跳过，绝不能拿 `[]` 覆盖本地**。老版本客户端推上去的 payload
    没有那几个 key，把"云端没有"当成"云端是空的"会直接删掉用户数据
  - dayPlans 按日期 key 合并（`mergePlans`），其余按 id 合并（`mergeById`），冲突以本地为准
  - `hydrated` 必须等所有表都读完再置真，否则会拿初始空数组覆盖云端
  - **计时器也同步**：只传 `{running:{title,startedAt}, updatedAt}`，不传"跑到第几秒"——
    各设备用 `now - startedAt` 自己算。带 `updatedAt` 是因为光看 `running` 是不是 null
    分不清"我刚停了还没传"和"别的设备刚开始还没拉"，谁的时间戳新听谁的
  - 采纳远端的"已停止"**不记一笔**——那笔记录在按停止的那台设备上产生，会自己同步过来
  - **定时轮询**：只在"打开页面/切回页面"拉是不够的——页面一直开着就永远不去问云端，
    手机上开始的计时电脑上死活看不到。有计时在跑时 15 秒一次，平时 60 秒一次，
    后台标签页完全不轮询
- 有计时在跑时，`MainlineBar` 上方多一条计时带（四个 tab 通用），**任何页面都能停**——
  出门吃饭随手停掉，不用先切回记录页

### useTimer 的一条硬规矩

**副作用绝不能写在 `setState` 的更新函数里。**严格模式会把更新函数跑两次，
`stop()` 里那句"记一笔"就会记两次（实测 dev 下记录数 12→14）。
状态用 `stateRef` 跟一份，副作用放在更新函数外面。
- 任务状态字段用 `"done"`（不是 `"completed"`）
- Task 类型的标签是单数 `tag?: TaskTag`（不是 `tags` 数组）
- 禁止 `<button>` 嵌套 `<button>`（会导致 React hydration 错误）
- Bottom Sheet 使用 `fixed` 定位 + z-index 100+
- Modal 内容需要 `overflow-y-auto` + `max-h-[90vh]` 确保移动端可滚动

## 交互规范

### 日视图（Mobile Day View）
- 点击任务主体区域 → 状态切换（todo → in_progress → done → todo）
- 点击编辑按钮（✏️）→ 打开 TaskBottomSheet
- 点击删除按钮（🗑️）→ 二次确认后删除

### 周视图（Mobile Week View）
- 点击任务 → 打开 TaskBottomSheet（不直接切换状态）
- 周视图列表中不提供行内编辑/状态切换

### TaskBottomSheet
- 点击标题文字 → 进入编辑态，失焦/回车保存
- 点击日期 → 展开日期选择器，支持周切换
- 点击时间 → 展开时间编辑器（复用 TimePicker），带确认/取消按钮
- 状态按钮三态循环：
  - 待办 → 「标记为进行中」（蓝色）
  - 进行中 → 「标记为已完成」（绿色）
  - 已完成 → 「取消完成」（灰色）
- 内容区可滚动，Footer 按钮始终可见

## PWA 配置

应用已支持 PWA（Progressive Web App），可添加到 iOS 主屏幕使用。

### 关键文件
- `public/manifest.json`：App 名称、图标、主题色配置
- `public/sw.js`：Service Worker，实现离线缓存
- `public/icons/`：App 图标（192x192, 512x512, apple-touch-icon）
- `app/layout.tsx`：PWA meta 标签 + Service Worker 注册

### iOS 添加到主屏幕
1. Safari 打开 https://mytodo-brown.vercel.app
2. 点击分享按钮 → 「添加到主屏幕」
3. 点击「添加」

### 注意事项
- `manifest.json` 中 `display: "standalone"` 实现全屏显示
- iOS 需要 `apple-mobile-web-app-capable` meta 标签
- Service Worker 缓存策略：页面导航网络优先；静态资源缓存优先（生产 chunk 带 hash 所以不会读到旧版）
- `sw.js` 对 localhost 直接放行不缓存——否则 dev 改完代码刷新还是旧 bundle（chunk 名不带 hash），
  排查半天以为是代码有 bug。真在本地遇到诡异的"改了没生效"，先去 DevTools → Application 里退掉 SW

## Pencil 设计集成

设计源文件：`/Users/tangyin/Downloads/代办事项.pen`

关键 frame：
- `Todo - Day View` (798gn)
- `Todo - Week View` (eRlva)
- `Add Task Modal - Day View` (SkTJf)
- `Add Task Modal - Week View` (dwBmt)
- `Add Task Modal - With Time Picker` (Ch6bo)

访问 `.pen` 文件只能通过 Pencil MCP 工具（batch_get、batch_design、get_screenshot）。
