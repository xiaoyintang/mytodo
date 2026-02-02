### 给 Cursor 新 Agent 的接力说明

你接手的是一个已跑通的 Next.js Todo 项目，来源于 Pencil 设计（`.pen`）→ Claude Code 生成骨架 → 手工补齐。

---

### 快速开始

- **启动**：

```bash
npm install
npm run dev
```

- **入口**：`app/page.tsx` → `components/TodoApp.tsx`

---

### 当前已完成

- **两张主界面已落地**（日/周切换、日期选择、任务渲染、localStorage）：
  - `components/TodoDayView.tsx`
  - `components/TodoWeekView.tsx`
  - `components/TodoApp.tsx`

- **基础模块**：
  - `components/todo/types.ts`（Task 模型：`status: "todo" | "in_progress" | "done"`，含 `startTime/endTime`）
  - `components/todo/storage.ts`（localStorage hook，key=`mytodo.tasks.v1`）
  - `components/todo/date.ts`（日期工具）

- **Tailwind v4 已接通**：
  - `postcss.config.mjs`
  - `app/globals.css`（含 `@source` 扫描声明 + CSS tokens）

---

### 设计来源（Pencil）

设计文件：`/Users/tangyin/Downloads/代办事项.pen`

关键 frame（历史）：
- Day/Week 主界面：`Todo - Day View (798gn)` / `Todo - Week View (eRlva)`
- 新增任务 modal：`Add Task Modal - Day View (SkTJf)` / `Add Task Modal - Week View (dwBmt)`
- 带时间选择器的新增任务 modal：`Add Task Modal - With Time Picker (Ch6bo)`

---

### 继续开发时的硬约束（非常重要）

- **不要重建项目/不要推倒重来**：只做增量修改与新增少量组件。
- **不要改坏 Task 模型兼容性**：
  - `status` 不要从 `done` 改成 `completed`
  - localStorage key 保持 `mytodo.tasks.v1`（如要升级 schema，用版本化 key 并做迁移）
- **样式必须沿用现有 tokens**：使用 Tailwind + `app/globals.css` 的 CSS 变量（`var(--color-xxx)`）。

---

### Claude Code / 提示词（直接复用）

- 完整功能补全（含 SkTJf/dwBmt）：`prompts/todo-implementation.md`
- 时间选择器 + 分组逻辑 + 进行中样式（对齐 Ch6bo）：`prompts/todo-timepicker.md`
- Week View 可读性优化 + 任务删除：`prompts/todo-week-delete.md`

如果使用 Claude Code 从选中 frame 生成/改代码：
- 避免让它重建项目；若出现 1/2 选项，**必须选 2**（只集成到现有项目）。

---

### 排错速记

- **页面变成“纯文字”**：Tailwind 没编译 → 检查 `postcss.config.mjs` 与 `@tailwindcss/postcss` 是否安装、`app/globals.css` 是否包含 `@source`。
- **`next build` 拉 Google Fonts 失败**：不要用 `next/font/google` 在线拉字体（本项目已移除）。
- **Pencil MCP 读不到 selection**：确保 Pencil 打开、`.pen` 已打开并选中 frame，再在 Claude Code 里 `/ide` 重连。

---

### 上下文快满时怎么接力（重要）

当你看到类似 “Context left …% / auto-compact” 的提示时，不要依赖聊天历史记忆。按下面顺序让新 Agent/Claude Code 从文件接力：

- 先读：`AGENTS.md`
- 再读：`README.md`
- 再读对应任务的提示词：
  - `prompts/todo-implementation.md`
  - `prompts/todo-timepicker.md`
  - `prompts/todo-week-delete.md`

这样即使对话被压缩，也不会丢关键约束（不重建项目、status=done、localStorage key 等）。

---

### 详细复盘与上下文

更完整的“今天做了什么/坑位记录”见：
- `README.md`

