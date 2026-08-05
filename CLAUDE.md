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
│   ├── 点击任务主体 → 状态循环
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

**一次性任务也上焦点地图**（`isActionable` = habit + stop + onetime）。福格原版就是所有行为
一起排；"又好做又有效"的该安排，"又难又没用"的就别做了，筛选逻辑完全一样。
只有**出口**不同：可重复 → 加入习惯表；一次性 → 排到某天（建一个 Task 进日视图，可撤回）。
愿望/成果执行不了，不上图。

微习惯两种记法，由行为本身决定（`guessMeasure` 猜，用户可一键改）：
- **duration 时长型**（看书）：照旧在「记录」里记一笔，习惯表按同名匹配自动读出今天的次数和分钟数，
  **不要求打第二次卡**。别把"分钟/小时"当判断信号——"睡前1小时调暗灯光"里的"1小时"说的是什么时候做。
- **count 发生型**（俯卧撑）：点一下存一条 `HabitLog{habitId,date,at}`。
  必须是**累加**不是打钩——福格式锚点一天可能触发好几次（"上完厕所就做两个俯卧撑"）。
  不算时长、不进时间台账，免得污染柳比歇夫统计。

两条入口，深浅都要有：
- **浅**：「我的习惯」顶上一个输入框，回车直接加，不归属任何目标 → 进「没有归属的目标」组。
  临时想到一个习惯不该逼你先建愿望、再倒行为、再排地图
- **深**：愿望 → 行为集群 → 焦点地图 → 黄金行为 → 加入习惯表。这条是"该养哪几个"的正经答案

习惯按目标分组，分组可折叠（收起状态存 `mytodo.habitgroups.collapsed.v1`），
收起时表头仍显示"今天 N 次"，不展开也知道动没动过。

**点击本身就是奖励**（用户原话）——这正是福格的「庆祝」：习惯固化靠的是做完那一瞬间的正反馈。
所以 +1 按钮要大、按下去要有即时回应（变绿 + 打勾 + 缩放）。**不做连续天数、不做完成率**，
断了就是断了，不制造"破戒"感。

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
- 任务卡标题前带所属目标的色点
- **任务的 `aspirationId` 有三条来源**（少了任何一条，折叠就永远不触发）：
  ①从行为卡「排到某天」→ 继承那条行为的目标；
  ②手动/AI 建任务 → 默认落到那天主线的第一条；
  ③任务详情页「属于哪个目标」可改可清空

### 关键类型（components/todo/types.ts）

- `Task`：id, title, date, aspirationId?, startTime?, endTime?, status, priority?, tag?, targetMinutes?
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
