# 记录：疑问与解答

## npm run dev 是什么
`npm run dev` 是运行项目的“开发模式”命令。它会启动 Vite 的开发服务器，让你在浏览器里看到页面，并支持热更新（改代码后自动刷新）。

![npm run dev 截图式说明](./npm-run-dev-screenshot.png)

## 现在是什么情况
- Node.js 已安装（`node`/`npm` 可用）。
- 项目依赖已安装（`npm install` 已完成）。
- 现在可以运行：`npm run dev` 启动本地开发服务器。
- 安装时提示有 2 个中等风险漏洞，可选稍后处理。

## 常见疑问与解释

### shell 命令是什么
shell 命令是你在终端里输入的指令，比如 `ls`、`cd`、`npm install`。它们用于操作文件、运行程序、查看信息等。

### 终端里提示 “! for bash mode” 是啥
这是 Claude Code 的提示，表示按 `!` 可以进入 bash mode，在 Claude Code 里直接运行 shell 命令。

### 我按了 Ctrl+G 怎么办
- 在编辑器里：会打开“跳转到行”，按 `Esc` 退出。
- 在终端里：一般只是提示音或位置提示，不影响状态。
- 在 `less/man` 中：按 `q` 退出分页器。

### 进入 Vim 了怎么退出
先按 `Esc`，再输入 `:qa!` 回车即可退出（放弃所有改动）。

### Claude Code 为啥是 Option+Enter 换行
在终端里 `Shift+Enter` 往往无效或被终端吞掉，所以 Claude Code 默认用 `Option+Enter` 做“换行不发送”。

### Claude Code 的选项什么意思
当它问你是否继续时，选项含义是：
1. 清空上下文并自动接受修改
2. 保留上下文并自动接受修改
3. 每次修改都让你手动确认
4. 让我修改计划或执行方式

### npm not found 的错误是什么意思
说明系统没有安装 Node.js，所以 `npm` 不存在。安装 Node.js 后就可以正常使用。

### 如何让 Claude Code 记住上次做的事
最好在项目里写一个 `CLAUDE.md`（或 `PROJECT_NOTES.md`），记录目标、进度、关键文件和下一步。下次打开让它先读这个文件即可继续。
