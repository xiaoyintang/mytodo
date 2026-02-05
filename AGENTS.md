### Cursor 新 Agent 接力说明（必读）

这是一个从 Pencil 设计落地的 Todo 项目，已经上线到 Vercel。请按本文接力，不要依赖聊天上下文。

---

### 线上与仓库

- **线上地址**：`https://mytodo-brown.vercel.app`
  - 备注：手机侧在某些网络下需要 VPN 才能访问 `vercel.app`（网络侧限制，非代码问题）。
- **GitHub**：`https://github.com/xiaoyintang/mytodo`

---

### 一句话说明项目

Next.js 15 + React 19 + TS + Tailwind v4 的 Todo Web App，支持 **日/周视图**、**新增任务弹窗（含时间选择器）**、**状态流转**、**删除**、**localStorage 持久化**。

---

### 快速运行（本地）

```bash
npm install
npm run dev
```

入口：`app/page.tsx` → `components/TodoApp.tsx`

---

### 关键硬约束（非常重要）

- **不要重建项目/不要推倒重来**：只做增量修改与新增少量组件。
- **不要破坏 Task 模型兼容性**（见 `components/todo/types.ts`）：
  - `status` 必须是 `"todo" | "in_progress" | "done"`（不要改成 `completed`）
  - 允许 `startTime/endTime`（`HH:mm`）
  - localStorage key：`mytodo.tasks.v1`（如需 schema 变更，用新 key + 迁移）
- **样式**：只用 Tailwind + `app/globals.css` 的 CSS 变量 tokens（`var(--color-xxx)`），不要引入新的 UI 框架/设计系统。

---

### 目录结构（定位用）

```text
app/
  globals.css        # tailwind v4 + tokens + @source
  layout.tsx
  page.tsx
components/
  TodoApp.tsx        # 顶层状态、切换、localStorage
  TodoDayView.tsx    # 日视图（分组/列表/交互）
  TodoWeekView.tsx   # 周视图（概览/更多/+N）
  AddTaskModal.tsx   # 新增任务弹窗（Day/Week/With time picker 逻辑）
  TimePicker.tsx     # 时间选择器
  todo/
    types.ts         # Task/状态/type
    date.ts          # 日期工具
    storage.ts       # useLocalStorageState
prompts/
  todo-implementation.md
  todo-timepicker.md
  todo-week-delete.md
notes/
  deploy-vercel.md
README.md
```

---

### 设计来源（Pencil）

设计文件（不提交到 GitHub）：`/Users/tangyin/Downloads/代办事项.pen`

关键 frame（ID 供对齐使用）：
- `Todo - Day View`（`798gn`）
- `Todo - Week View`（`eRlva`）
- `Add Task Modal - Day View`（`SkTJf`）
- `Add Task Modal - Week View`（`dwBmt`）
- `Add Task Modal - With Time Picker`（`Ch6bo`）

---

### Claude Code / Prompts（继续开发的入口）

按任务选择对应文件（直接读并执行）：
- `prompts/todo-implementation.md`：增量补全（对齐 `SkTJf/dwBmt`，禁止推倒重来）
- `prompts/todo-timepicker.md`：时间选择器 + 分组逻辑 + in_progress 圆点样式（对齐 `Ch6bo`）
- `prompts/todo-week-delete.md`：Week View 可读性优化 + 删除

---

### 常见排错

- **页面变成“纯文字”**：Tailwind 没编译
  - 检查：`postcss.config.mjs`、`@tailwindcss/postcss` 是否安装、`app/globals.css` 是否包含 `@source`
- **`next build` 拉 Google Fonts 失败**：避免 `next/font/google` 在线拉字体（本项目已移除该依赖路径）
- **手机打不开**
  - 本地开发：必须同一 Wi‑Fi，用 `http://电脑局域网IP:3000`；公司网/防火墙可能拦端口
  - 线上 Vercel：若蜂窝/换网络可用而当前 Wi‑Fi 不可用，多半是网络拦 `vercel.app`；可考虑绑定自定义域名 + Cloudflare 代理

---

### 上下文不足的接力策略（必须遵守）

如果你发现 chat/context 快满或已被压缩，接力时不要依赖聊天历史：

1. 先读：`AGENTS.md`
2. 再读：`README.md`
3. 再按任务读：`prompts/*.md`
4. 最后再开始改代码

