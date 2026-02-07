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
├── cycleTaskStatus(taskId) - 状态循环：todo → in_progress → done → todo
├── createTask(taskData) - 创建任务
├── deleteTask(taskId) - 删除任务
├── updateTask(taskId, updates) - 更新任务（标题、日期等）
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
└── AddTaskModal.tsx - 新增任务弹窗（支持 Day/Week 模式）
    ├── 内容区可滚动（max-h-[90vh]）
    ├── Footer sticky 底部 + 安全区适配
    └── TimePicker.tsx - 自定义时间选择器（小时/分钟滚动）
```

### 关键类型（components/todo/types.ts）

- `Task`：id, title, date (ISODate), startTime?, endTime?, status, priority?, tag?
- `TaskStatus`："todo" | "in_progress" | "done"
- `ViewMode`："day" | "week"
- `ISODate`："YYYY-MM-DD" 格式字符串

### 样式系统

- CSS 变量定义在 `app/globals.css`，使用 `var(--color-xxx)` 引用
- Tailwind v4 + PostCSS（配置在 `postcss.config.mjs`）
- 图标使用 `lucide-react`

## 硬性约束

- localStorage key 必须保持 `mytodo.tasks.v1`
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
- Service Worker 缓存策略：优先缓存，网络回退

## Pencil 设计集成

设计源文件：`/Users/tangyin/Downloads/代办事项.pen`

关键 frame：
- `Todo - Day View` (798gn)
- `Todo - Week View` (eRlva)
- `Add Task Modal - Day View` (SkTJf)
- `Add Task Modal - Week View` (dwBmt)
- `Add Task Modal - With Time Picker` (Ch6bo)

访问 `.pen` 文件只能通过 Pencil MCP 工具（batch_get、batch_design、get_screenshot）。
