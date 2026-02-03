### 项目说明（Pencil → Claude Code → 可运行 Next.js）

这个仓库记录了我今天把 Pencil 里的 Todo 设计（`.pen`）落成可运行代码的全过程，目标是让 **Claude Code** 或 **新的 Cursor Agent** 未来可以“按节奏接力继续做”，不需要从头摸索。

---

### 开发历程（按时间顺序复盘）

#### 第一阶段：项目初始化与基础搭建

- **1）了解 Pencil 在 Cursor 里的用法**
  - 结论：`.pen` 是加密格式，不能用普通文件读取/搜索方式理解，必须通过 Pencil MCP 来读（节点树、变量、截图等）。

- **2）用 Pencil 生成了 Todo 中保真界面（在 `.pen` 里）**
  - 生成了 **日视图** + **周视图** 两张画板，并截图验证。

- **3）打开用户已有的设计文件**
  - 文件：`/Users/tangyin/Downloads/代办事项.pen`
  - 该文件内含 shadcn 设计系统与多个 Todo 版本。

- **4）走通 Pencil MCP → Claude Code 的官方"选中 frame 生成代码"流程**
  - 在 Claude Code 里执行 `Generate React/Tailwind/NextJS code from the selected frame`
  - 一度报错：`WebSocket not connected`（MCP 没连上 Pencil）
  - 后续通过重新 `/ide` 连接、保持 Pencil 打开解决
  - 成功识别到选中的两个 frame：
    - `Todo - Day View (798gn)`
    - `Todo - Week View (eRlva)`
  - **Claude Code 在本仓库实际执行/生成的内容（可追溯）**：
    - 本项目是由 Claude Code 调用 `create-next-app` 初始化出来的（见 `.claude/settings.local.json` 里的允许命令）
    - 初始化命令（原样记录）：

```bash
npx create-next-app@latest . --typescript --tailwind --app --no-src-dir --import-alias "@/*" --use-npm
```

    - 随后执行了依赖安装（同样可在 `.claude/settings.local.json` 看到授权）：

```bash
npm install
```

    - 产出：Next.js App Router 骨架（`app/`、`next.config.ts`、`tsconfig.json`、`package.json`、`package-lock.json`）、以及 `.claude/` 目录用于 Claude Code 会话/权限记录。

- **5）Claude Code 触发 session limit + 终端"抽搐"问题**
  - 出现提示：`You've used 97% ...` / `You've hit your limit ...`
  - 终端刷屏：`Unknown skill: rate-limit-options`
  - 原因：队列里误触了 `/rate-limit-options`（当前版本不支持），导致重复报错
  - 处理：`Esc` / `Ctrl+C` 中断刷屏，避免再次触发该命令
  - 最终：Claude Code 到上限，无法继续生成，但 **已生成 Next.js 骨架**

- **6）在现有 Next.js 项目里补齐可运行实现（不依赖 Claude Code）**
  - 增加 Week View + Day/Week 切换 + localStorage 持久化
  - 修复 build 因离线拉 Google Fonts 失败的问题
  - 修复 Tailwind 没生效导致页面"纯文字"的问题

- **7）补齐"提示词落库 + 接力文档"**
  - 新增 `AGENTS.md`：给 Cursor 新 Agent 的接力说明
  - 新增 `prompts/` 下多份增量提示词，便于 Claude Code/新 Agent 继续做

---

#### 第二阶段：功能完善与 UI 对齐（Claude Code 完成）

- **8）修复图标显示问题**
  - 问题：Cursor 生成的代码使用 `<span className="lucide lucide-xxx">` 方式，但 Lucide 图标需要作为 React 组件使用
  - 解决：安装 `lucide-react`，将所有图标替换为正确的 React 组件导入（如 `<Plus />`, `<Check />`, `<Flag />` 等）

- **9）实现新增任务弹窗（AddTaskModal）**
  - 对应 Pencil frame：`Add Task Modal - Day View (SkTJf)` / `Add Task Modal - Week View (dwBmt)`
  - 功能：
    - 支持 Day/Week 两种模式
    - Day 模式：自动选择当前日视图日期，显示蓝色确认状态
    - Week 模式：需要手动选择日期，未选择时显示黄色警告提示
    - 表单字段：任务标题（必填）、时间范围（可选）、优先级/标签（可选）
  - 新增文件：`components/AddTaskModal.tsx`

- **10）实现自定义时间选择器（TimePicker）**
  - 对应 Pencil frame：`Add Task Modal - With Time Picker (Ch6bo)`
  - 功能：
    - 替代原生 HTML time input，提供更好的 UX
    - 小时（00-23）和分钟（00-59）滚动选择
    - 点击外部或确认按钮关闭
  - 新增文件：`components/TimePicker.tsx`

- **11）修复任务分组逻辑与状态样式**
  - 分组规则修正：`00:00-11:59` 上午，`12:00-17:59` 下午，`18:00+` 晚间
  - 状态圆圈样式对齐设计：
    - `todo`：空心圆（灰色边框）
    - `in_progress`：空心圆 + 内部实心小圆点（蓝色）
    - `done`：实心圆 + 白色勾（蓝色背景）
  - 任务状态循环：`todo → in_progress → done → todo`

- **12）优化 Day View 任务布局**
  - 改为单行布局：标题 → 时间 → 状态标签
  - 标题支持 truncate，时间和标签靠右对齐

- **13）优化 Week View 可读性**
  - 任务条目改为两行：第一行（图标 + 标题），第二行（时间）
  - 每天最多显示 4 条任务，超出显示 `+N 更多`
  - 标题支持 truncate + hover 显示完整内容（title 属性）

- **14）实现任务删除功能**
  - Day View：任务行右侧，hover 时显示红色删除按钮
  - Week View：任务卡片右上角，hover 时显示删除按钮
  - 删除前使用 `window.confirm` 确认
  - localStorage 同步更新，两个视图即时反映

---

#### 第三阶段：周视图完善与交互优化（Claude Code 完成）

- **15）修复 Hydration Error**
  - 问题：`<button>` 嵌套 `<button>` 导致 React hydration 错误
  - 解决：将周视图日期列的外层 `<button>` 改为 `<div>`，保留点击功能和键盘无障碍支持

- **16）周视图日期列头部优化**
  - 对应 Pencil frame：`Todo - Week View (eRlva)`
  - 新增任务统计展示：`✔ X / Y`（已完成数 / 总数）
  - 选中日期时头部背景变为主题蓝色
  - 今天的日期显示"今天"标签

- **17）周视图任务卡片优化**
  - 标题改为单行 truncate（不再多行换行）
  - **移除时间显示**（时间仅在悬浮卡中展示）
  - 启用纵向滚动（移除 MAX_VISIBLE_TASKS 限制，超出时可滚动）
  - 任务按开始时间排序，无时间的排最后

- **18）实现任务悬浮卡（Hover Card）**
  - 对应 Pencil frame：`Component/Task Hover Card/Completed (5EZCH)`、`InProgress (dblKK)`、`Pending (XHxPZ)`
  - 功能：
    - 鼠标 hover 任务卡片 200ms 后显示悬浮卡
    - 使用 `fixed` 定位，避免被父容器 overflow 裁剪
    - 自动计算位置（优先显示在右侧，空间不够时显示在左侧）
  - 悬浮卡内容（按顺序）：
    - 任务标题（完整显示）
    - 任务状态（待办 / 进行中 / 已完成）
    - 标签 / 优先级
    - 日期（如：2月1日 周日）
    - 时间范围（如：10:30 - 11:30，无时间则不显示）

- **19）状态切换逻辑优化**
  - 恢复简单点击循环：`todo → in_progress → done → todo`
  - 每点击一次切换一个状态

---

#### 第四阶段：部署上线（Claude Code 完成）

- **20）初始化 Git 仓库**
  - 创建 `.gitignore` 排除 `.claude/` 和 `*.pen` 文件
  - 首次提交所有源代码

- **21）推送到 GitHub**
  - 仓库地址：https://github.com/xiaoyintang/mytodo

- **22）部署到 Vercel**
  - 在线访问：https://mytodo-brown.vercel.app
  - 自动 CI/CD：推送代码后 Vercel 自动重新部署

---

### 当前代码状态（你现在有什么）

- **技术栈**：Next.js 15 + React 19 + TypeScript + Tailwind v4 + lucide-react
- **入口页面**：`app/page.tsx` → 渲染 `components/TodoApp.tsx`
- **核心组件**
  - `components/TodoApp.tsx`：应用壳（日/周模式、选中日期、localStorage、任务 CRUD）
  - `components/TodoDayView.tsx`：日视图（日期条、任务分组、状态切换、删除）
  - `components/TodoWeekView.tsx`：周视图（7列网格、任务卡片、状态切换、删除）
  - `components/AddTaskModal.tsx`：新增任务弹窗（支持 Day/Week 模式）
  - `components/TimePicker.tsx`：自定义时间选择器（小时/分钟滚动选择）
- **基础模块**
  - `components/todo/types.ts`：类型（Task、ViewMode、ISODate、TaskStatus、TaskPriority）
  - `components/todo/date.ts`：日期工具（周起始、格式化、CN_WEEKDAY 等）
  - `components/todo/storage.ts`：`useLocalStorageState`（localStorage 持久化 hook）
- **样式与 tokens**
  - `app/globals.css`：CSS 变量（颜色 tokens）+ Tailwind v4 `@source` 扫描声明
  - 说明：UI 使用 `var(--color-xxx)` 变量，已基本对齐 Pencil 设计
- **已实现功能**
  - ✅ 日视图 / 周视图切换
  - ✅ 日期选择（日视图周内切换、周视图点击日期）
  - ✅ 新增任务（弹窗表单，支持标题、日期、时间、优先级、标签）
  - ✅ 任务状态切换（todo → in_progress → done → todo）
  - ✅ 任务删除（hover 显示删除按钮，confirm 确认）
  - ✅ localStorage 持久化（key: `mytodo.tasks.v1`）
  - ✅ 周视图悬浮卡（hover 显示任务完整信息：标题、状态、标签、日期、时间）
  - ✅ 周视图任务统计（每日显示 ✔ X/Y）
  - ✅ 周视图纵向滚动（任务超出时可滚动）
- **Claude Code 初始化生成痕迹**
  - `.claude/settings.local.json`：记录了 Claude Code 在本项目允许/执行的初始化命令

---

### 在线访问

**🌐 https://mytodo-brown.vercel.app**

无需安装，直接在浏览器打开即可使用。

---

### 本地开发

在项目根目录：

```bash
npm install
npm run dev
```

浏览器打开：`http://localhost:3000`

---

### 部署更新

修改代码后，推送到 GitHub 即可自动部署：

```bash
git add .
git commit -m "你的提交信息"
git push
```

Vercel 会自动检测并重新部署。

---

### 关键坑位与排错（以后照这个处理）

#### 1）Claude Code 生成设计代码时，提示 Pencil WebSocket 未连接

终端常见报错：
- `Error: WebSocket not connected on port: xxxxx`

处理顺序（非常重要）：
- **先启动并保持 Pencil 打开**
- 再在终端运行 `claude`
- Claude Code 里执行 `/ide`（或 `/mcp` 确认 Pencil MCP 工具可见）
- 回到 Pencil，确认已打开 `.pen` 并选中目标 frame
- 再发：`Generate React/Tailwind/NextJS code from the selected frame`

#### 2）Claude Code 终端“抽搐/刷屏”

表现：
- 反复输出 `Unknown skill: rate-limit-options`

原因：
- 队列误触 `/rate-limit-options`（当前 Claude Code 不支持）

处理：
- `Esc` 中断（必要时 `Ctrl+C`）
- 不要按“上箭头”去重复发送队列消息
- 回到 `❯` 后继续正常指令

#### 3）Claude Code session limit 到上限

表现：
- `You've hit your limit · resets 1am (Asia/Shanghai)`

含义：
- 生成任务会停止/拒绝，但本地项目仍可继续由你/Agent 手工迭代

策略：
- 能生成尽量让它生成“骨架/关键组件”
- 到上限后按本 README 的“代码结构”继续手动补齐

#### 4）页面打开像“纯文字”，布局/颜色全部没了

原因：
- Tailwind v4 没接入 PostCSS，utility class 没被编译

本仓库的修复已经做了：
- 添加 `postcss.config.mjs`
- 在 `app/globals.css` 增加 Tailwind v4 `@source` 扫描路径

你仍需确保依赖安装过：

```bash
npm i -D @tailwindcss/postcss
```

#### 5）`next build` 失败：`next/font` 拉取 Google Fonts 失败

原因：
- 离线/网络限制导致 `fonts.googleapis.com` 不可达

处理：
- 不用 `next/font/google`，改用系统字体或本地字体文件
- 本仓库已移除 `app/layout.tsx` 中的 `Inter` 在线拉取

---

### Pencil/设计侧（给未来继续对齐 UI 的人）

#### 目标 frame（来自 `代办事项.pen`）

- `Todo - Day View`（id: `798gn`）
- `Todo - Week View`（id: `eRlva`）
- `Add Task Modal - Day View`（id: `SkTJf`）
- `Add Task Modal - Week View`（id: `dwBmt`）
- `Add Task Modal - With Time Picker`（id: `Ch6bo`）

如果要继续做“更像设计稿”的像素级对齐：
- 用 Pencil MCP 对这两个 frame 做 `get_screenshot` 对照
- 或用 Pencil MCP 把 frame 节点树导出来（展开实例 + 解算变量）
- 然后按节点树逐块对齐：Header、ViewSwitcher、DatePicker/WeekGrid、TaskList、TaskItem、AddTask

---

### 下一步建议（继续完善）

- **任务编辑**
  - 已完成：新增、删除、状态切换
  - 建议补：点击任务打开编辑弹窗，修改标题/时间/优先级等
- **周视图导航**
  - 已完成：7 列网格展示、悬浮卡、任务统计
  - 建议补：上一周/下一周按钮真正切换周范围（目前按钮已有但未绑定逻辑）
- **任务拖拽**
  - 建议补：支持任务拖拽排序、跨日期移动
- **标签管理**
  - 建议补：自定义标签（目前只有预设的"高优"、"工作"、"学习"）
- **数据同步**
  - 建议补：接入后端 API 或云存储，支持多设备同步

---

### prompts（给 Claude Code / 新 Agent 的"任务说明书"）

- `prompts/todo-implementation.md`：增量补全（对齐 `SkTJf`/`dwBmt`，禁止推倒重来）
- `prompts/todo-timepicker.md`：时间选择器 + 分组逻辑 + in_progress 圆圈样式（对齐 `Ch6bo`）
- `prompts/todo-week-delete.md`：Week View 可读性优化 + 任务删除
- `prompts/WEEK_VIEW_REQUIREMENTS.md`：周视图完整实现规范（悬浮卡、任务统计、滚动等）
- **数据结构**
  - 统一用 `Task`（`components/todo/types.ts`）并确保 localStorage 迁移版本号
- **视觉对齐**
  - 用 Pencil 里的 tokens 替换 `globals.css` 的变量值
  - 把卡片/边框/圆角/间距对齐到 `.pen`

---

### Claude Code 没 token / 上下文不足时怎么办

- **优先策略**：不要依赖聊天历史，让模型从仓库文件“读上下文”继续干活。
- **推荐接力顺序**（无论是 Claude Code 还是新开的 Cursor Agent）：
  - 先读：`AGENTS.md`
  - 再读：`README.md`
  - 再按任务读对应提示词：
    - `prompts/todo-implementation.md`
    - `prompts/todo-timepicker.md`
    - `prompts/todo-week-delete.md`
- **避免重头开始**（Claude Code 特别容易踩坑）：
  - 明确告诉它：只做增量修改，不重建项目/不重写目录结构
  - 如果它问 “1/2”（重建项目 vs 集成到现有项目），**必须选 2**
- **如果 Claude Code 已经完全不可用（额度/Token 用尽）**：
  - 直接使用 Cursor 的新 Agent 按 `AGENTS.md` 接力即可（本仓库已把关键约束与 prompts 落盘）。

---

### 文件结构（快速定位）

```text
app/
  globals.css          # CSS 变量 tokens + Tailwind v4 配置
  layout.tsx           # 根布局
  page.tsx             # 入口页面 → TodoApp
components/
  TodoApp.tsx          # 应用主组件（状态管理、CRUD 逻辑）
  TodoDayView.tsx      # 日视图（任务分组、状态切换、删除）
  TodoWeekView.tsx     # 周视图（7列网格、任务卡片、悬浮卡、任务统计）
  AddTaskModal.tsx     # 新增任务弹窗（Day/Week 模式）
  TimePicker.tsx       # 自定义时间选择器
  todo/
    date.ts            # 日期工具函数
    storage.ts         # localStorage hook
    types.ts           # TypeScript 类型定义
prompts/
  todo-implementation.md   # 新增任务弹窗 prompt
  todo-timepicker.md       # 时间选择器 + 状态样式 prompt
  todo-week-delete.md      # Week View 优化 + 删除功能 prompt
postcss.config.mjs
package.json
AGENTS.md              # Cursor Agent 接力说明
```

