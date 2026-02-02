# Todo App 功能补全（增量集成版：对齐 Pencil + 不破坏现有代码）

你在一个**已存在**的 Next.js App Router 项目中工作：
- 项目路径：`/Users/tangyin/Desktop/mytodo_1`
- 技术栈：Next.js 15 + React 19 + TypeScript + Tailwind v4

**重要约束（必须遵守）**
- 不要重新创建 Next.js 项目
- 不要重写目录结构
- 不要“推倒重来”重写现有 Day/Week 视图
- 只允许：在现有代码基础上增量修改 + 新增少量组件/工具文件

---

## 0. 设计输入（Pencil 选中的 2 个新 Frame）

你必须以这两个选中 frame 的 UI 为准实现新增任务弹窗：
- `Add Task Modal - Day View`（id: `SkTJf`）
- `Add Task Modal - Week View`（id: `dwBmt`）

目标：把这两个 modal **真正接入现有 Day/Week**，实现“可创建任务、可查看任务、可持久化”的完整闭环。

---

## 1. 现有代码（必须兼容）

当前项目已存在（不要推倒）：
- `components/TodoApp.tsx`：全局状态 + localStorage（key=`mytodo.tasks.v1`）
- `components/TodoDayView.tsx`：日视图渲染与交互入口
- `components/TodoWeekView.tsx`：周视图渲染与交互入口
- `components/todo/types.ts`：`Task` 模型（重点：`status` 用 `done` 而不是 `completed`；支持 `startTime/endTime`）

如果需要扩展 `Task` 字段，必须：
- 与旧数据兼容（localStorage 里的历史数据不能崩）
- 不要把 `status: "done"` 改名成 `"completed"`

---

## 2. 任务数据模型（Task）

以现有模型为准（可扩展但需兼容）：
- `id: string`
- `title: string`（必填）
- `date: YYYY-MM-DD`（必填，按天维度）
- `status: "todo" | "in_progress" | "done"`
- `startTime?: "HH:mm"`（可选，对应设计里的“开始时间”）
- `endTime?: "HH:mm"`（可选，对应设计里的“结束时间”）
- `priority?: "high" | "normal"`（可选）
- `tag?: string`（可选；若你要做多标签，也要兼容现有单标签字段）

说明：
- 本应用是 Todo，但允许可选的时间范围（因为设计稿就有 start/end time 输入）

---

## 3. 新增任务（Add Task Modal，必须落地为真实功能）

### 3.1 触发入口
- Day View 顶部「新增任务」按钮 → 打开 `SkTJf` 风格 modal
- Week View 顶部「新增任务」按钮 → 打开 `dwBmt` 风格 modal

### 3.2 行为要求（必须真实写入）
- 新增任务必须写入应用状态，并持久化到 localStorage（非 mock）
- 创建完成后任务必须立即出现在：
  - 对应日期的 Day View
  - 对应日期的 Week View（对应列/对应日期详情）

### 3.3 日期规则（对齐设计）
- Day View Modal（`SkTJf`）：
  - `date` 默认使用当前 Day View 选中的日期（并显示“已自动选择…”那种提示文案/状态）
- Week View Modal（`dwBmt`）：
  - 必须显式选择一个具体日期后才能创建
  - 未选择日期时，展示黄色提示（“请先选择一个具体日期”）并禁止提交

### 3.4 表单字段（对齐 SkTJf/dwBmt）
- date（必填）
- title（必填）
- startTime/endTime（可选）
- priority/tag（可选，chip 形式）
- footer：取消 / 创建任务

---

## 4. 任务状态交互（非常重要）

点击任务的状态流转（循环）：
- `todo` → `in_progress` → `done` → `todo`

视觉优先级规则：
- `done` 覆盖一切显示（弱化：灰/划线/完成态）
- `in_progress` 覆盖 `priority/tag`
- `priority/tag` 仅在 `todo` 时突出展示

---

## 5. Day View 渲染规则

- 按时间排序显示（有 startTime 的优先；无 startTime 的放后面）
- 分组逻辑保持与现有实现一致（当前是按 startTime 推导上午/下午/晚间）
- 每个任务至少显示：
  - title
  - 时间范围（如果有）
  - 状态（done/in_progress）
  - priority/tag（当且仅当 status=todo 时突出）

---

## 6. Week View 渲染规则

- 每一列代表一天；保持“概览感”
- 文本过长：
  - 必须用 `truncate/ellipsis`，不能溢出破坏布局
  - 可选：hover 显示完整标题
- Week Modal（`dwBmt`）里内嵌的日期选择器，只需要满足“选择具体日期”的交互即可（不必做成完整日历产品）

---

## 7. 工程约束（再次强调）

- 使用 React 函数组件
- 使用 Next.js App Router
- 使用 Tailwind CSS（基于现有 `app/globals.css` 的 tokens）
- 尽量复用已有组件与类型
- 不添加设计稿中不存在的功能（除非为实现上述流程必要）
- 若 Claude Code 询问：
  - “1. Set up a complete Next.js project” vs “2. just create component files / integrate into existing”
  - 必须选择 **2**

---

## 8. 交付内容

- 完整可运行的功能实现（新增任务 + 查看 + 状态流转 + localStorage 持久化）
- 简要说明：
  - modal 的数据流（如何把表单写入 tasks）
  - 任务状态流转逻辑
  - Day / Week View 的职责区别