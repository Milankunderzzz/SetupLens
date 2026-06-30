<div align="center">

# SetupLens

**一条命令，告诉你这个仓库该怎么启动，以及哪里会卡住。**

[English](README.md) | [为什么做这个项目](ARCHITECTURE.md) | [产品方向](docs/PRODUCT_DIRECTION.md) | [插件 API](docs/PLUGIN_API.md) | [示例报告](docs/demo-report.html)

</div>

SetupLens 是我持续维护的本地优先 CLI 工具。它不上传代码，也不要求注册账号。它关注一个很具体的问题：

> 我刚拿到一个仓库，现在应该运行什么命令？如果跑不起来，最可能卡在哪里？

从 `0.2.0-alpha.1` 开始，SetupLens 的产品重心从“仓库清单式检查”转向“启动诊断”。README、License、CI、测试文件这些仓库规范检查仍然保留，但默认终端输出会优先展示启动结论、准备命令、运行命令、阻塞项和安全风险。

## 快速体验

```bash
npx --yes github:Milankunderzzz/SetupLens scan .
```

生成离线 HTML 报告：

```bash
npx --yes github:Milankunderzzz/SetupLens scan . --format html --output setuplens-report.html
```

查看完整审计清单：

```bash
npx --yes github:Milankunderzzz/SetupLens scan . --show-all
```

## 现在默认会先回答什么

终端输出会优先展示：

```text
Verdict BLOCKED

Prepare
  npm install
  python -m venv .venv

Run
  npm run dev

Startup blockers
  Docker Compose references missing local paths
  Makefile calls an npm script that does not exist
```

也就是说，它不只是告诉你“缺 README”或者“没有 License”，而是先告诉你这个项目启动前最需要处理什么。

## 当前支持范围

当前规则主要覆盖：

- Node.js 项目和 monorepo workspace
- Python 项目，包括常见 Flask、FastAPI、Django 入口
- Docker 和 Docker Compose
- `.env.example` 与本地环境文件
- npm、pnpm、Yarn、Bun、Python、Git、Docker、Docker Compose 运行时
- Dockerfile、Compose volume、本地路径、Makefile 中的包脚本引用
- 高置信度凭证泄露风险

C++、Java、Go、Rust 等生态目前不是深度支持范围。如果主技术栈不受支持，SetupLens 会显示 `Unsupported / Not scored`，不会给出容易误导用户的高分。

## 输出格式

```bash
setuplens scan .
setuplens scan . --show-all
setuplens scan . --format json --output setuplens-report.json
setuplens scan . --format html --output setuplens-report.html
setuplens scan . --threshold 80
setuplens scan . --plugin ./examples/custom-plugin.mjs
```

JSON 输出包含 `startup` 字段，其中包括：

- `status`: `ready`、`needs_setup`、`blocked` 或 `unsupported`
- `setupCommands`: 建议先执行的准备命令
- `runCommands`: 可能的启动命令
- `blockers`: 会阻止启动的确定性问题
- `warnings`: 可能影响启动的准备项
- `risks`: 安全风险

## 和普通检查工具有什么不同

SetupLens 不想替代 IDE、Docker、包管理器或漏洞扫描器。它的定位更窄：

**在正式运行项目之前，先把启动路径和高影响阻塞项集中展示出来。**

仓库规范检查依然有用，但它们不应该压过真正影响启动的问题。所以默认输出会隐藏大量 PASS 和低影响 hygiene 项，只在 `--show-all` 中完整展示。

## 当前状态

SetupLens 仍然是早期产品预览版，不是成熟稳定工具。当前已经具备：

- 46 项自动化测试
- Windows、Linux、macOS CI
- setup 与 hygiene 分离
- 不支持技术栈不打分
- 启动诊断、准备命令、运行命令和阻塞项展示
- 终端、JSON、HTML、GitHub Action 输出

接下来会继续优先提升真实使用价值，而不是盲目扩展更多语言。

## 本地开发

```bash
git clone https://github.com/Milankunderzzz/SetupLens.git
cd SetupLens
npm ci
npm run check
npm test
node ./bin/setuplens.js scan .
```

## License

[MIT](LICENSE)
