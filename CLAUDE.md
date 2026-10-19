# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> 产品背景（为什么这样设计、哪些只是讨论过没实现）见 `给Claude的App介绍-2026-09-11.md`。
> 本文件只记**代码现状和踩过的坑**。文档与代码冲突时以代码为准，并顺手更新本文件。
> `README.md`、`prompts/`、`notes/` 里多是早期设计，可能已过时。

## 常用命令

```bash
npm run dev      # 启动开发服务器 (http://localhost:3000)
npm run build    # 生产构建
npm run lint     # ESLint（eslint.config.mjs，tests/ 不参与）
npm test         # node --test 跑 tests/*.test.cjs
```

- 测试是 `node:test` + 运行时用 `typescript.transpileModule` 加载源文件，不需要额外测试框架。
  新逻辑优先抽成 `components/todo/*.ts` 的纯函数再配测试——这是目前唯一有覆盖的部分，
  大组件（FocusMapView / TodoApp / TaskBottomSheet）没有测试，改动后要在浏览器里实际点一遍。
- 改完提交前跑：`npm test && npm run lint && npx tsc --noEmit`。

## 技术栈与入口

Next.js 15 App Router + React 19 + TypeScript + Tailwind v4 + lucide-react。只增量修改，不重建项目，不引入新 UI 框架。

入口：`app/page.tsx` → `components/TodoApp.tsx`（状态中心，所有集合都在这里用 `useLocalStorageState` 持有并往下传）。

## 模块地图

| 区域 | 组件 | 逻辑（components/todo/） |
|---|---|---|
| 日视图 | `TodoDayView`、`TaskQuickActions`、`TaskScheduleDialog`、`TaskTitleEditor`、`DailyFocusSection`、`QuickAddTask` | `dailyFocus.ts`、`taskCopy.ts` |
| 周视图 | `TodoWeekView`、`MainlinePlanner` | `weekOverview.ts` |
| 任务详情 | `TaskBottomSheet`、`StartActionEditor`、`TaskNotes`、`TaskCopyDialog` | `taskNotes.ts`、`taskGoal.ts` |
| 目标 / KR / 焦点地图 | `GoalsView`、`GoalResultsPanel`、`FocusMapView`、`BehaviorStepsEditor` | `goal.ts`、`behavior.ts`、`blocker.ts`、`behaviorApi.ts`、`aiBridge.ts` |
| 习惯 | `HabitLabView`、`HabitTracker` | — |
| 日计划模板 | `DayTemplateModal`、`TemplateBatchNotice` | `taskTemplate.ts`、`templateHistory.ts` |
| 时间记录 | `TimeLogView`、`TimerPanel`、`TimerStartEditor`、`TimerRewardPanel`、`EntryNameInput`、`EntryTaskPicker`、`CategoryDonut`、`GoalInvestChart` | `useTimer.ts`、`timerStart.ts`、`timerReward.ts`、`entryHistory.ts`、`time.ts`、`category.ts`、`nlparse.ts` |
| 常驻条 / 导航 | `MainlineBar`、`ViewChrome`、`EdgeSwipeBack` | — |
| 同步 | `SyncModal` | `sync.ts`、`syncMerge.ts`、`kv.ts` |

API 路由（`app/api/`）：`parse`（时间记录）、`parse-task`（任务）、`classify`（正事/娱乐/休息）、
`behavior`（判定/魔法棒/拆解/澄清等多 mode）、`sync`、`quick-log`（给 iOS 快捷指令一步记账）。
LLM 走 OpenAI 兼容接口（默认 DeepSeek），环境变量 `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL`；
未配 key 返回 501，前端降级（时间记录走 `nlparse.ts` 规则解析，分类显示"未分类"）。

## 概念层次

```
目标 Aspiration
 ├─ KR GoalResult（可选，可排序/归档，带"达成证据"）
 │   └─ 推进项 BehaviorCard（独立行为，或带 steps 的任务包）
 └─ 直接挂目标的推进项
推进项 → 焦点地图比两轴 → 排到某天（Task）或 加入习惯（Habit）
已知要做的事 → 直接建 Task / 套日计划模板，不必经过焦点地图
```

- **步骤**（`Task.subtasks` / `BehaviorCard.steps`）是 AND 关系，共同完成父项；**下一步** = 第一条未完成步骤，不另存字段。
- **最小启动**（`startAction`）只负责跨过启动门槛：任务和每个步骤可各自设，完成它不等于完成任务/步骤。
  但**启动本身算一次赢**（福格：做了最小版本就是成功）：点完当场弹庆祝提示「今天第 N 次启动」，
  卡片上留绿色「已启动」，任务 todo → in_progress（`startWin.ts`，判定集中在 `TodoApp.updateTask`）。
  曾经点完只改状态、没有任何反馈，用户觉得"没有成就感，不像福格"。
- 推进项的 steps 是模板，排成任务时复制成 SubTask；之后改模板**不追改**已排任务。日计划模板同理。
- 目标/KR/推进项的**归档**只是退出当前关注，不删任何关联数据。默认只突出前三项，也不是数量上限。

## 日视图（TodoDayView）

- 有 `startTime` 的任务进「日程」按时间排；没有的进「待办」**按目标分组**（主线目标排前），不再分上午/下午/晚间。
- **非主线目标的任务默认折叠**（可展开）。两条边界：没归属目标的任务不折；那天没排主线时一条都不折。
- 任务卡交互（已定稿，别把讨论过但没采用的方案当现状）：
  - 点**标题** → 打开 TaskBottomSheet（**不是**原位改名）
  - 点**状态圆圈** → todo → in_progress → done → todo
  - 点**步骤数/箭头** → 独立展开步骤（**必须自己一个 hit target**）；下一步可直接点完成
  - 点**时间/日历** → TaskScheduleDialog（今天/明天/下周一快捷 + 具体日期时间，可撤销）
  - **⋯ 菜单**（TaskQuickActions）：设为/取消当天关键任务、改名（原位，回车/失焦保存、Esc 放弃、兼容输入法）、复制到…、删除（二次确认）
- **今日关键任务**（`DayPlan.mustDoTaskId`，`DailyFocusSection`）：可选，最多一件，只做强调，不把任务从日程/待办里挪走。
  历史：曾经撤掉过（理由是和"非主线折叠"重复、违反日常零决策），2026-09-13 作为**可选**项恢复，不选也行。
  改期/删除任务会清掉它的关键任务标记（`dailyFocus.ts`），撤销时只在当天还没选别的才恢复。
- 输入框回车 → AI 解析建任务（`/api/parse-task`）；「＋」按钮 → 手动建。另有「模板」入口。
- 日期条支持回到今天、直接跳日期。手机上左右滑切 tab，`EdgeSwipeBack` 处理边缘返回。

## 周视图（TodoWeekView + weekOverview.ts）

- 默认只露**重要任务**：关键任务、主线任务、非例行任务优先；来自习惯/模板/可重复行为、或同一来源本周出现多天的算例行，往后排。每天先显示 3 条，可展开当天全部。
- 例行判定按**来源身份**（`weekTaskSourceKey`），不按标题——同名手动任务互不合并。
- 有状态圆圈可直接切换状态；点任务主体 → TaskBottomSheet。
- 周规划（`MainlinePlanner`）在这里编辑每天主线。

## 任务详情（TaskBottomSheet）

- 标题编辑、日期/时间编辑（复用 TimePicker）、三态状态按钮（标记为进行中 / 标记为已完成 / 取消完成）、删除二次确认。
- 归属（目标 + KR）、AI 辅助、进度与时长目标、随记（`TaskNotes`）按需展开。
- 「行动步骤」：手动加/编辑/打勾/删除/拖动排序（鼠标、触摸、键盘方向键）；
  AI「拆成步骤/重新拆解」生成新一套建议；「检查整体」结合目标、KR、父任务和全部步骤找问题；
  「帮我说清楚」只看当前下一步，不打分，只给一个问题和一个可选改写。AI 建议都可关闭，由用户决定是否采纳。
- `fixed` 定位 + z-index 100+，`max-h-[85vh]` 内容可滚动，Footer sticky。

## 目标与焦点地图

- 目标管理页（`GoalsView`）从常驻条「我的目标」进入，不是 tab。目标、KR 都可拖动排序。
- 焦点地图（`FocusMapView`）一个目标/KR 一页：KR 切换导航滚动时吸顶；条目默认紧凑（标题、类型、分数、步骤数），展开才出滑块和编辑；
  多选批量排期/删除/归档；排日程可多选日期，可撤回。
- 综合分 `impact × 60% + feasibility × 40%`（`behavior.ts`），两轴都评完才参与排序；
  "黄金/优先推进"门槛仍是两轴都 ≥ 50——**用户明确质疑过这个阈值，别当成定论**。分数只由用户给，AI 不代填。
- 收集口回车即存为 `unsorted`；**收集与整理必须分离**——收集时不调 AI、不问类型、不要求决定。
  自动判定：新条目 700ms 后攒成一次 `/api/behavior (mode:sort)`；判定中显示"判定中…"，失败显示"未判定"。
  **去重 key 必须是 `id + 文字`**——改完文字要能重判，只按 id 记会永远停在未判定。
- 外部聊天桥接（`aiBridge.ts`）：「带去聊」导出目标/KR/推进项/步骤给 Claude、ChatGPT；
  「带回来」粘贴结构化变更 → 匹配 → 预览 → 用户勾选应用，可批次撤回。替换必须引用原文匹配，不让 AI 猜 id；
  省略 steps = 保留，明确 clear 才清空。

### 焦点地图踩过的坑，别退回去

1. 「一次一张卡两个按钮」的向导 → 像做问卷、看不到全局。改成列表。
2. 二选一（大/小）→ 给不出"哪个最优"。改成 0-100 滑块；横向滑块不和页面上下滚动打架。
3. 分三个 tab（影响力/可行性/结果）→ 忘了前面打的分、结果"像魔术一样出现"。现在一页：
   一行两根滑块、散点图实时更新、**排序是一个动作不是实时绑定**（实时的话拖滑块时行会在手底下乱跳）。

### 判定只剩两条：是不是行为 / 有没有边界（`blocker.ts`）

```
action    这还不是行为   「我想变自信」——没有动作可做     → 拆成行为（魔法棒）
endpoint  这行为没边界   「研究一下竞品」——不知道做到哪算完 → 给它一个边界
```

曾经有五条（还有 timing / decision / effort），因为**误报太多、一直跳感叹号**砍掉了：
timing 改成看 `Habit.anchor` 字段；decision 去任务详情的「拆解」；effort 只有用户自己知道。
类型里 `blocker` 仍保留三种取值和 `hasDecision` 只为兼容老数据。

**endpoint 第一问是「这件事能不能多做一会儿？」**——不能（放手机、买窗帘、发邮件）→ 放过；
能（改简历可以改 10 分钟也可以改 3 小时）→ 必须有边界（数量/范围/时长/痕迹，有一种就算）。

> 🔴 **"有明确的宾语"不等于"有终点"。**用动词表当判据时，AI 把「改简历」以"改完即止"放过，实测 5/12；
> 换成"能不能多做一会儿"后 11/12，误报没回来。也别让判定词表和改写规则互相打脸
> （AI 自己改写出的「研究一个竞品的官网」被自己拦下，理由却是"研究完一个竞品就结束"）。

### 三种"化整为零"，别混

| | 输入 → 输出 | 关系 | 在哪 |
|---|---|---|---|
| 魔法棒 | 愿望 → N 条行为 | **OR**，挑几个 | 焦点地图 |
| 拆解 | 任务 → N 步 | **AND**，缺一不可 | 任务详情 / 推进项 steps |
| 给边界 | 一句话 → 同一件事的清楚版 | 1→1 | 焦点地图 |

拿焦点地图去筛任务步骤 = 帮用户把项目做失败。焦点地图是排序工具，不是筛人工具，一次性任务照样上地图。
成果类条目可以在原位手动或 AI 拆成**任务包**（保留父项和归属），不该被打散成一堆独立习惯。

## 主线（方案 A，规格见 `09-app重构规格.md`）

- 「主线」不是新实体，就是 `DayPlan.primaryAspirationIds`，最多三个目标；目标可设 `weeklyLimit`（每周投入天数），超了只提示不拦。
- 底部 tab 一个不动（日/周/记录/习惯）。目标是这些东西的来源，是正交维度，所以放常驻条 `MainlineBar`，不做 tab。
- `MainlineBar` 在标题下、tab 栏上，四个 tab 通用：显示当天主线，可直接选当天主线，「我的目标」进目标管理页。周规划在周视图。
- **习惯不受主线过滤**（硬约束）：任务靠日程触发、习惯靠锚点触发，两套机制不能混。
- 任务卡第二行带**写着目标名字**的浅色标签，点它直达对应 KR 的焦点地图（没 KR 进目标地图）。
- **任务的 `aspirationId` / `resultId` 只有这几个来源**：从推进项/习惯排期时继承；模板带过来；详情页自己指。
  **手动/AI 建的任务不自动归属**——曾默认落到当天主线第一条，「扔垃圾」也被算进主线，污染投入统计。

## 习惯

- 按目标 → KR 两层分组、可折叠，组内参考对应推进项综合分排序。**分组不能为了扁平化删掉。**展开与跳转入口分开防误触。
- 锚点「在 ___ 之后」可先不填。`measure`：count 计次；duration 时长型从时间记录同名匹配读出，不用打第二次卡。
- 显示今天情况、累计次数、最近 30 天做了几天；可选记一句正向影响。**不做 streak**——断掉是概率事件，越长崩得越惨。
- 可多选日期排成任务（主要覆盖本周，周日开放下周）；从习惯排出的任务完成后回写 HabitLog（`taskId` 防重复计次）。

## 日计划模板

- 从任务整理出模板，按需套到某天；可直接编辑模板和条目。保存时间、目标/KR、步骤、时长目标、最小启动等结构，不存日期和完成状态。
- 套用后生成独立任务，按 `sourceTemplateId + sourceTemplateItemId` 去重；套用批次可撤销/恢复（`templateHistory.ts`，key `mytodo.template-batches.v1`）。
- 修改模板只影响以后套用。它不是自动重复规则引擎。

## 时间记录（柳比歇夫模式）

- 任务可设 `targetMinutes`（时长目标），不限几点做，累计满即达成；日视图和详情显示进度（`taskLoggedMinutes`）。
- 计时器（`useTimer.ts`）：计时中可改名（不重置开始时间，候选只给今天的活动和今天的任务，选中既有活动会继承名字、目标、计入任务）；
  可调整开始时间（`timerStart.ts`）；可选专注奖励（`timerReward.ts`）。
- 计时指令（`handleTimerCommand`，在正常解析前拦截）：
  - 开始：「现在 X」「现在开始 X」「开始 X」「马上 X」「这就 X」。省略"开始"的口语式**必须有"现在/这就/马上"打头**，
    否则「复盘面试」这种补记会被误当成开始计时
  - 停止：「停」「停止」「结束」…；X 里带时长/时刻的一律不触发计时，按补记解析
- 补记：优先 `/api/parse`，失败降级 `nlparse.ts`；结果先预览，可逐条删、可改时间，确认后写入。
  解析尊重显式的相对日期（"昨天"），可由时长 + 结束时间倒推开始；跨午夜用 `dateAnchor` 区分记在开始日还是结束日，台账按实际开始顺序排。
- 计入任务：自动按标题匹配（`taskLinkMode: "auto"`），也可手动指定（`manual`，名字不必和任务相同）或明确不计入（`none`）。
  自动匹配只是标题匹配，别夸大成语义匹配。台账有撤销/重做（`entryHistory.ts`）。
- 有计时在跑时，`MainlineBar` 上方多一条计时带，**任何 tab 都能停**。

### 记录分类（正事/娱乐/休息，`category.ts`）

优先级：①用户改过的同名记录（`categorySource: "user"`，一次纠正永久生效）②任意已分类的同名记录
③关键词规则 `ruleClassify()`（工作强信号词压过平台名，再"最长关键词胜出"）④`/api/classify` 问 AI，每个名字一次会话只问一次。

### 目标投入的归属

- **TimeEntry 的目标归属只从 task/habit 复制（快照），不做任何推导。**
  ❌ 不默认填今日主线（会把杂事算进主线）；❌ **绝不在开始计时前弹窗问归属**——计时是进入工作状态的扳机。
  归属事后在台账里点标签改。明确关联的任务改目标时同步更新，独立记录保留自身归属。
- 记录 tab「本周投入」：计划与实际并排，不做达标率/百分比。目标列表显示 `任务 N · 习惯 N · 本周 Xh`，为 0 标灰橙，不弹提示不打分。

## 关键类型（`components/todo/types.ts`）

- `Task`：id, title, date, status, aspirationId?, resultId?, sourceHabitId?, sourceBehaviorId?, sourceTemplateId?, sourceTemplateItemId?,
  startTime?, endTime?, priority?, tag?, targetMinutes?, subtasks?, startAction?, progress?, notes?
- `SubTask`：id, title, done, sourceBehaviorStepId?, startAction? —— **内嵌在 Task 里，不单开表**（跟着任务删，白捡同步）
- `StartAction`：kind ("minimum"；"next" 仅老数据), title, targetStepId?, done?
- `TaskNote`：追加式随记，带现场快照 context；只属于本次任务，不进模板
- `TaskTemplate` / `TaskTemplateItem`：模板结构，不含日期/状态
- `Aspiration`：id, title, kind, createdAt, archived?, color?, weeklyLimit?
- `GoalResult`（KR）：id, aspirationId, title, evidence?, order?, archived?, createdAt
- `DayPlan`：date, primaryAspirationIds, mustDoTaskId?
- `BehaviorCard`：id, aspirationId, resultId?, text, type, typeSource?, reason?, blocker?, impact?, feasibility?, steps?, startAction?, taskId?, archived?
  - type: "unsorted" | "aspiration" | "outcome" | "onetime" | "habit" | "stop"
- `Habit`：id, title, anchor?, measure ("count" | "duration"), behaviorId?, aspirationId?, createdAt, archived?
- `HabitLog`：id, habitId, date, at, taskId?, impact?
- `TimeEntry`：id, date, dateAnchor?, title, minutes, startTime?, endTime?, taskId?, taskLinkMode?, aspirationId?, category?, categorySource?
- `TaskStatus`："todo" | "in_progress" | "done"（**不是 "completed"**）；`tag` 是单数 `TaskTag`，不是数组
- `ViewMode`："day" | "week" | "log" | "habit"；`ISODate`："YYYY-MM-DD"

## 硬性约束

### 存储

- localStorage key **不许改名**（schema 变更用新 key + 迁移）：
  `mytodo.tasks.v1`、`mytodo.entries.v1`、`mytodo.aspirations.v1`、`mytodo.goal-results.v1`、`mytodo.behaviors.v1`、
  `mytodo.habits.v1`、`mytodo.habitlogs.v1`、`mytodo.dayplans.v1`、`mytodo.task-templates.v1`、`mytodo.timer.v1`
- 其他本地 key：`mytodo.sync.code` / `.sync.dirty` / `.sync.base.v2`、`mytodo.template-batches.v1`、`mytodo.reward.preferences.v1`、
  `mytodo.habitgroups.collapsed.v1`、`mytodo.route.v1`（history state）
- `hydrated` 必须等所有表都读完再置真，否则会拿初始空数组/演示数据覆盖云端。

### 云同步（`sync.ts` + `syncMerge.ts` + `kv.ts`）

- 同步码当 key 存在 Upstash/Vercel KV（`KV_REST_API_URL` / `KV_REST_API_TOKEN`），未配置返回 501，不影响本地。
- 覆盖：tasks、entries、aspirations、goalResults、behaviors、habits、habitLogs、dayPlans、taskTemplates、timer。
- **三方合并**：以上次确认的快照（`mytodo.sync.base.v2`）为基准，只把相对基准的差异当编辑；集合按 id 逐条合并；
  task 的步骤等嵌套列表整体当原子值，两边都改了 → 弹冲突让用户选，**不再"以本地为准"**，未解决的合并绝不上传。
- 写入是 compare-and-set（Lua 脚本比 sha1 revision），被抢先返回 409 → 重新读、重新合并。`quick-log` 也走同一套 CAS。
- **云端缺某个集合 → 跳过，绝不能拿 `[]` 覆盖本地**（老客户端推上去的 payload 没有新集合）。
- 计时器只同步 `{running:{title,startedAt,…}, updatedAt}`，各设备用 `now - startedAt` 自己算；谁的 `updatedAt` 新听谁的。
  采纳远端的"已停止"**不记一笔**——那笔在按停止的设备上产生，会自己同步过来。
- 轮询：计时在跑 15 秒、平时 60 秒，后台标签页不轮询；切回页面、上线、获得焦点时立即同步。

### useTimer / React

- **副作用绝不能写在 `setState` 的更新函数里。**严格模式会跑两次，`stop()` 里"记一笔"会记两次（实测 12→14）。
  状态用 ref 跟一份，副作用放在更新函数外。
- 禁止 `<button>` 嵌套 `<button>`（hydration 错误）。
- Bottom Sheet `fixed` + z-index 100+；Modal 内容 `overflow-y-auto` + `max-h-[90vh]`。

### 样式

- 只用 Tailwind + `app/globals.css` 的 CSS 变量（`var(--color-xxx)`），图标用 lucide-react。
- 用户偏好紧凑、看得全：小字号、按需展开，长标题截断后要能看全文（`FastTooltip`，不用原生 title）。
  2026-09-09 试过整套"iOS 风"视觉统一，用户不满意已回退，别再往那个方向重写。

## PWA

- `public/manifest.json`（`display: "standalone"`）、`public/sw.js`、`public/icons/`、`app/layout.tsx`（meta + SW 注册）。
- SW：页面导航网络优先，静态资源缓存优先（生产 chunk 带 hash）。**对 localhost 直接放行不缓存**——
  否则 dev 改完刷新还是旧 bundle。本地遇到"改了没生效"，先去 DevTools → Application 退掉 SW。
- 线上 https://mytodo-brown.vercel.app ，GitHub main 分支自动部署到 Vercel。AI 和云同步需联网。

## Pencil 设计

设计源文件 `/Users/tangyin/Downloads/代办事项.pen`（只能通过 Pencil MCP 访问）。是早期设计稿，现在的界面已经走得比它远，不必强行对齐。
