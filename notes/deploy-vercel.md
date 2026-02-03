### 部署到 Vercel（A 方案：变成可访问的网站）

目标：把 `/Users/tangyin/Desktop/mytodo_1` 这个 Next.js 项目部署成一个**不需要本地开终端**的线上网站（`xxx.vercel.app` 或你的自定义域名）。

---

### 你当前的项目状态（重要）

- 已经是 Next.js 项目（App Router），本地可 `npm run dev`
- 数据持久化使用 `localStorage`（所以**不会跨设备同步**；每个浏览器各自保存）
- Claude Code 已经在本地做过：
  - `git init`
  - 首次 `git commit`
  - 更新 `.gitignore`（忽略 `.claude/`、`*.pen` 等）
- 你的机器上**未安装 GitHub CLI `gh`**（终端里出现过 `command not found: gh`），所以按本文走“网页创建仓库”的方式

---

### 第 1 步：在 GitHub 创建仓库（网页）

1. 打开 `https://github.com/new`
2. Repository name 填一个名字（例如 `mytodo`）
3. **不要勾选** “Add a README file”（我们项目里已有 README）
4. 点击 Create repository

创建成功后，GitHub 会显示仓库地址，形如：
- `https://github.com/<你的用户名>/<仓库名>.git`

---

### 第 2 步：把本地代码 push 到 GitHub

在项目根目录执行（把 `<...>` 换成你的真实信息）：

```bash
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

如果你本地分支名不是 main，先执行：

```bash
git branch -M main
```

---

### 第 3 步：Vercel 一键部署

1. 打开 `https://vercel.com`
2. 使用 GitHub 登录
3. 点击 **Add New → Project**
4. 选择你刚 push 的仓库
5. 框架通常会自动识别为 Next.js，保持默认
6. 点击 **Deploy**

部署完成后会给你一个地址：
- `https://<项目名>.vercel.app`

---

### 第 4 步：后续更新发布（最省心）

以后每次更新代码：

```bash
git add .
git commit -m "update"
git push
```

Vercel 会自动重新构建并发布。

---

### 第 5 步：绑定自定义域名（可选）

Vercel 项目 → **Settings → Domains**：
- 添加你的域名
- 按 Vercel 提示配置 DNS（通常是 CNAME 或 A 记录）

---

### 常见问题

- **Q：为什么必须 GitHub？**
  - 不是必须，但这是 Vercel 最稳定的自动部署方式（push 即发布）。

- **Q：部署后数据会不会同步？**
  - 目前使用 `localStorage`，**不会跨设备/跨浏览器同步**。想同步需要后端（数据库/鉴权）或第三方存储。

- **Q：我看到 `.pen` 文件、`.claude/` 要不要上传？**
  - 不建议。`.pen` 大、且对线上运行无用；`.claude/` 是本地工具配置。项目已在 `.gitignore` 里忽略。

- **Q：如果我误提交了大文件怎么办？**
  - 先从仓库里移除，再提交：

```bash
git rm --cached -f "*.pen"
git rm --cached -rf .claude
git commit -m "chore: remove large/local files from repo"
git push
```

---

### 最小验收清单

- GitHub 仓库能看到代码
- Vercel 部署成功并能打开页面
- 页面交互可用（创建/切换视图等）

