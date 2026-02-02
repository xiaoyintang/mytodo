# Todo App 增量补全：时间选择器 + 分组逻辑 + 进行中样式（对齐 Pencil）

你在一个已存在的 Next.js App Router 项目中增量开发：
- 项目路径：`/Users/tangyin/Desktop/mytodo_1`
- 技术栈：Next.js 15 + React 19 + TypeScript + Tailwind v4

## 硬约束（必须遵守）

- 不要重建项目、不要重写目录结构
- 不要大重构现有逻辑；只做“增量修改 + 新增少量组件”
- 保持现有 UI/样式 tokens（`app/globals.css` 的 CSS 变量）一致
- 保持现有 Task 模型兼容：`status` 使用 `"todo" | "in_progress" | "done"`，并支持 `startTime/endTime`（不要改名成 `completed`）
- `localStorage` key 不变：`mytodo.tasks.v1`；若扩展字段需兼容旧数据

## Pencil 设计输入（当前选中的新 Frame）

- `Add Task Modal - With Time Picker`（id: `Ch6bo`）

目标：把这个“可选时间选择器”的 UI/交互接入现有新增任务流程，并把选择结果显示在任务清单里正确位置。

---

## 任务 1：时间选择器（必须能选时间，风格与 UI 一致）

新增一个“时间选择组件/插件”（优先不引入重依赖；若引入第三方库，必须轻量、无样式冲突，并保持与现有 UI 一致）。

组件能力：
- 选择开始时间 `startTime`（`HH:mm`）
- 选择结束时间 `endTime`（`HH:mm`）
- 支持清空（可选）
- 视觉与交互尽量贴合 `Ch6bo`（输入框样式、icon、focus 边框、popover/下拉的圆角/阴影/间距）

接入位置：
- 新增任务 modal 里“时间范围（可选）”区域，用该组件实现“开始时间/结束时间”可点击选择

---

## 任务 2：创建任务后在清单展示时间（精确位置要求）

创建任务成功后，在 Day View / Week View 的任务项里显示时间范围。

布局位置必须是：
- “Todo 任务标题文本”的右侧
- “标签/优先级（tag/priority chip）”的左侧

也就是同一行从左到右：
- 标题（自适应/可截断） → 时间文本 → 标签

规则：
- 如果没有时间范围，就不占位（保持对齐不乱）
- 标题过长必须 `truncate/ellipsis`，不能挤爆时间/标签

---

## 任务 3：日视图上午/下午/晚间分组必须按时间逻辑

分组规则：
- `00:00–11:59` => 上午
- `12:00–17:59` => 下午
- `18:00` 及以后 => 晚间（六点以后就是晚间）

以 `startTime` 为准；没有 `startTime` 的任务：
- 允许放到“晚间”（最小改动），或单独“未定时间”组（如果不破坏现有布局）

---

## 任务 4：状态交互与“进行中”样式（对齐第一张设计图）

交互规则（点击的是左侧圆圈，不是整行）：
- 第一次点击圆圈：`todo -> in_progress`
- 第二次点击圆圈：`in_progress -> done`
- 第三次点击圆圈：`done -> todo`（循环）

视觉规则（只改圆圈指示器，不要改动整体布局）：
- `todo`：空心圆（仅描边）
- `in_progress`：空心圆里有一个实心小圆点（居中）
- `done`：完成态（可用实心圆 + 对勾；或保持你现有完成样式，但需与上面两种协调统一）

`done` 的文字弱化/划线规则保持现有逻辑（若已有）。

---

## 实现建议（尽量少改现有代码）

- 若项目里已有新增任务 modal：保留其对外 API，只替换内部“时间输入”为 TimePicker
- 若还没有 modal：新增组件（例如 `components/AddTaskModal.tsx` + `components/TimePicker.tsx`），并在 `TodoApp` 里以 state 控制打开/关闭与提交
- 所有新增样式用 Tailwind + `app/globals.css` tokens（`var(--color-xxx)`），不要引入新设计系统

---

## 交付要求

- 明确列出你新增/修改了哪些文件
- 保证 `npm run dev` 可运行
- 说明：时间选择如何写入 Task（`startTime/endTime`）以及如何在列表正确位置显示

