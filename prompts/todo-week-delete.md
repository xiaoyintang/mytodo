# Todo App 增量补全：Week View 文字拥挤 + 任务删除

你在一个已存在的 Next.js 15 + React 19 + TypeScript + Tailwind v4 项目中增量开发：
- 项目路径：`/Users/tangyin/Desktop/mytodo_1`

## 硬约束（必须遵守）

- 不要重建项目、不要重写目录结构；只允许增量修改与新增小文件
- 样式必须沿用 `app/globals.css` 的 tokens（`var(--color-xxx)`）
- localStorage key 保持：`mytodo.tasks.v1`
- `Task` 模型要兼容现有实现：`status = "todo" | "in_progress" | "done"`（不要改名成 `completed`）

---

## 任务 A：Week View 文字太挤（可读性优化，不改变整体布局风格）

目标文件主要是：
- `components/TodoWeekView.tsx`（必要时可抽出小组件，但不要大重构）

问题：
- 周视图里每列的小任务条目文本太挤，标题展示不齐全，影响“概览感”

要求：
- Week Grid 每列任务条目标题必须可读，不允许挤到看不清或溢出破坏布局
- 允许的实现方式（任选组合）：
  1) 标题单行 `truncate` + hover/tooltip 显示完整标题（风格要克制，别花哨）
  2) 任务条目改为“两行”：第一行标题（truncate），第二行显示时间/标签（更小字）
  3) 当某天任务过多时，只显示前 N 条 + “+X” 计数入口（保持概览感）
- 不要改变 Week View 的总体结构（7列、选中态等）
- 最终效果：信息密度更舒适、标题至少能看出关键内容

---

## 任务 B：增加删除任务（真实删除 + UI 入口合理）

现状：
- 任务能创建，但不能删除

要求：
- 在 Day View 和 Week View 的任务项里提供删除入口，风格要和现有 UI 一致（轻量、不抢主信息）
- 删除交互建议（任选其一，保证一致）：
  - hover 才显示一个小的 trash/x 图标按钮
  - 或在右侧固定位置，但视觉权重很低
- 点击删除后：
  - 从 state 删除任务
  - localStorage 同步更新
  - 两个视图立即反映（列表/统计/周概览数量都更新）
- 删除前确认方式（二选一）：
  - `window.confirm`（最简单可靠）
  - 或极简确认 UI（不要引入新的设计系统/复杂弹窗）

建议的按钮位置（可按你判断微调，但要合理）：
- Day View：任务行最右侧，与状态/标签同一行，hover 才出现
- Week View：任务 chip 的右侧角落，小图标按钮，hover 才出现

实现提示（推荐最小改动路径）：
- 在 `components/TodoApp.tsx` 新增 `onDeleteTask(taskId)`，并传给 `TodoDayView` / `TodoWeekView`
- 在两视图里为每个任务渲染删除按钮并调用 `onDeleteTask`

---

## 交付要求

- 明确列出修改了哪些文件
- 保证 `npm run dev` 可运行

