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
├── HabitLabView.tsx - 「习惯」视图 = 习惯实验室（福格行为设计，一期）
│   ├── 一级页：我的愿望列表（愿望 aspiration / 结果 outcome，都不是行为）
│   ├── 二级页：某个愿望的行为集群
│   │   ├── 收集口：回车即存为 unsorted，**AI 完全不参与**（收集与整理必须分离）
│   │   ├── 魔法棒 → /api/behavior (mode: wand)，发散 8-10 个候选，先勾选再入库
│   │   ├── 「一次判定这 N 条」→ /api/behavior (mode: sort)，一次调用判完所有未判定条目
│   │   ├── 每条的类型标签可点开改判 → typeSource="user"，AI 不再覆盖（同记录页分类）
│   │   ├── 判成愿望/成果的条目有「拆成行为」按钮 → 对该条挥魔法棒
│   │   └── hasDecision 标记：行为里藏着"要当场判断"的成分时高亮提醒
│   └── 数据只存本地（mytodo.aspirations.v1 / mytodo.behaviors.v1），暂未接云同步
│
└── TimeLogView.tsx - 「记录」视图（柳比歇夫时间记录法）
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
| 二 | 焦点地图：纵轴影响力、横轴能不能做到 → 右上角=黄金行为 | 待做 |
| 三 | 黄金行为 → 微习惯，锚点从时间台账里推荐，打卡回流校正横轴 | 待做 |

**铁律：收集与整理必须分离。**收集口回车即存,不调 AI、不问类型、不要求任何决定——
用户的瓶颈是决策成本,任何在"倒想法"时插入的判断都会让他不用这个功能。
判定是独立动作,他自己决定什么时候点。

二期设计要点（别做成手指自由拖拽的二维画布）：福格的方法是**分两轮排**，一轮只判断一个维度，
所以输入用一次一张卡的引导式打分（影响力 大/中/小 → 可行性 能/勉强/不能），**二维图作为结果呈现**。

三期设计要点：微习惯分两种记法，由行为本身决定，不是每次让用户选——
**计时型**（看书）照旧在「记录」里记一笔，习惯完成状态靠同名匹配自动推出，不要求打两次卡；
**打卡型**（俯卧撑）只记 `habitId + date`，不算时长、不进时间台账，免得污染柳比歇夫统计。

### 关键类型（components/todo/types.ts）

- `Task`：id, title, date (ISODate), startTime?, endTime?, status, priority?, tag?, targetMinutes?
- `TimeEntry`：id, date, title, minutes, startTime?, endTime?, taskId?, category?, categorySource?
- `EntryCategory`："正事" | "娱乐" | "休息"
- `Aspiration`：id, title, kind（"aspiration" 愿望 | "outcome" 结果）, createdAt
- `BehaviorCard`：id, aspirationId, text, type（"habit" | "onetime" | "stop"）, createdAt, impact?, feasibility?
- `TaskStatus`："todo" | "in_progress" | "done"
- `ViewMode`："day" | "week" | "log" | "habit"
- `ISODate`："YYYY-MM-DD" 格式字符串

### 样式系统

- CSS 变量定义在 `app/globals.css`，使用 `var(--color-xxx)` 引用
- Tailwind v4 + PostCSS（配置在 `postcss.config.mjs`）
- 图标使用 `lucide-react`

## 硬性约束

- localStorage key 必须保持 `mytodo.tasks.v1`（任务）和 `mytodo.entries.v1`（时间记录）
- 云同步（`sync.ts`）目前只同步 tasks + entries；习惯实验室的两个 key 还没接进去，
  接的时候要单独改、单独验——那是用户数据的命根子
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
