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
│
├── TodoDayView.tsx - 日视图，按时间分组
│   └── 分组规则：上午 (00:00-11:59)、下午 (12:00-17:59)、晚间 (18:00+)
│
├── TodoWeekView.tsx - 周视图，7 列网格
│   ├── TaskHoverCard - 悬浮卡片（fixed 定位）
│   └── WeekTaskItem - 任务条目（点击切换状态）
│
└── AddTaskModal.tsx - 新增任务弹窗（支持 Day/Week 模式）
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
- 悬浮卡片在可滚动容器中必须用 `fixed` 定位 + 视口坐标计算

## Pencil 设计集成

设计源文件：`/Users/tangyin/Downloads/代办事项.pen`

关键 frame：
- `Todo - Day View` (798gn)
- `Todo - Week View` (eRlva)
- `Add Task Modal - Day View` (SkTJf)
- `Add Task Modal - Week View` (dwBmt)
- `Add Task Modal - With Time Picker` (Ch6bo)

访问 `.pen` 文件只能通过 Pencil MCP 工具（batch_get、batch_design、get_screenshot）。
