# AGENTS.md

给 Codex / Cursor 等其他编码助手的入口。**项目说明统一维护在 `CLAUDE.md`**，先读它；
产品背景见 `给Claude的App介绍-2026-09-11.md`。`README.md`、`prompts/`、`notes/` 多是早期设计，可能已过时。

最要紧的几条（详见 CLAUDE.md「硬性约束」）：

- 只做增量修改，不重建项目、不引入新 UI 框架；样式只用 Tailwind + `app/globals.css` 的 CSS 变量。
- localStorage key 不许改名；`TaskStatus` 只能是 `"todo" | "in_progress" | "done"`。
- 云同步里云端缺某个集合时跳过，绝不能用 `[]` 覆盖本地。
- 副作用不能写在 `setState` 的更新函数里。
- 改完跑 `npm test && npm run lint && npx tsc --noEmit`，并更新 `CLAUDE.md` 中过时的描述。

## 常见排错

- **页面变成"纯文字"**：Tailwind 没编译。检查 `postcss.config.mjs`、`@tailwindcss/postcss` 是否安装、`app/globals.css` 是否包含 `@source`。
- **`next build` 拉 Google Fonts 失败**：避免 `next/font/google` 在线拉字体（本项目已移除该依赖路径）。
- **本地改了没生效**：去 DevTools → Application 退掉 Service Worker。
- **手机打不开**：本地开发需同一 Wi‑Fi，用 `http://电脑局域网IP:3000`；线上 `vercel.app` 在部分网络下被拦，需要 VPN 或自定义域名。
