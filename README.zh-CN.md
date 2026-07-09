<div align="center">

# SetupLens

**一条命令，告诉你这个仓库该怎么启动，以及哪里会卡住。**

[English](README.md) | [版本路线](ROADMAP.zh-CN.md) | [产品方向](docs/PRODUCT_DIRECTION.md) | [为什么做这个项目](ARCHITECTURE.md) | [插件 API](docs/PLUGIN_API.md) | [示例报告](docs/demo-report.html) | [alpha.3 能力报告](docs/failure-dataset/alpha3-capability-report.html)

</div>

SetupLens 是我持续维护的本地优先 CLI 工具。它不上传代码，也不要求注册账号。它关注一个很具体的问题：

> 我刚拿到一个仓库，现在应该运行什么命令？如果跑不起来，最可能卡在哪里？

从 `0.2.0-alpha.2` 开始，SetupLens 的产品重心从“仓库清单式检查”转向“启动诊断”。README、License、CI、测试文件这些仓库规范检查仍然保留，但默认终端输出会优先展示启动结论、准备命令、运行命令、阻塞项和安全风险。

## 快速体验

```bash
npx --yes github:Milankunderzzz/SetupLens doctor .
```

执行可选 probe，让 SetupLens 运行有超时保护的本地诊断命令并分类真实失败：

```bash
npx --yes github:Milankunderzzz/SetupLens doctor . --probe
```

查看修复计划，包括可安全自动执行的修复和需要人工处理的步骤：

```bash
npx --yes github:Milankunderzzz/SetupLens doctor . --fix-plan
```

只应用白名单内的安全本地修复：

```bash
npx --yes github:Milankunderzzz/SetupLens doctor . --apply safe
```

运行静态 readiness scan：

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
- Next.js、Vite、React、TypeScript、Prisma 等 JavaScript/TypeScript 项目信号
- Python 项目，包括 Flask、FastAPI、Django 入口、设置文件和迁移检查
- Docker 和 Docker Compose
- Laravel、Rails、Spring Boot、.NET Web、Go service、Rust binary
- Turbo、Nx、pnpm workspace 等 monorepo 工具
- `.env.example` 与本地环境文件
- npm、pnpm、Yarn、Bun、Python、Git、Docker、Docker Compose 运行时
- Dockerfile、Compose volume、本地路径、Makefile 中的包脚本引用
- 高置信度凭证泄露风险
- fix-plan 修复计划，以及 `doctor --apply safe` 白名单安全修复

`doctor --apply safe` 只会执行低风险、本地、可解释的修复，例如从 `.env.example` 复制缺失的 `.env`、补充本地 env 的 `.gitignore` 规则、创建缺失的 Compose env 占位文件、创建保守的 `tsconfig.json` 或 Vite `index.html`。它不会覆盖已有文件，也不会写出仓库目录。package scripts 和 env template patch 仍然只作为人工 review 建议。主技术栈仍不受支持时，SetupLens 会显示 `Unsupported / Not scored`，不会给出容易误导用户的高分。

## 输出格式

```bash
setuplens doctor .
setuplens doctor . --probe
setuplens doctor . --probe --probe-startup
setuplens doctor . --fix-plan
setuplens doctor . --apply safe
setuplens doctor . --format html --output setuplens-doctor.html
setuplens doctor . --format json --output setuplens-doctor.json
setuplens doctor-suite ./repos --format json
setuplens failure-dataset collect --limit 50 --format json
setuplens failure-dataset collect --limit 50 --clone --scan
setuplens failure-dataset review --input .setuplens/failure-dataset/sources.json
setuplens failure-dataset promote --input .setuplens/failure-dataset/sources.json
setuplens failure-dataset clean
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

## 真实失败数据集闭环

README 演示不应该只停留在一次 benchmark。现在 SetupLens 有一条更可复现的证据闭环：自动收集公开候选项目、记录来源证据、可选克隆和扫描、再把扫描结果变成 corpus 候选与 classifier backlog。

先拉取 50 个公开候选项目的来源清单：

```bash
setuplens failure-dataset collect --limit 50 --format json --output docs/failure-dataset/sources.json
```

再把第三方仓库克隆到 `.setuplens/` 并运行 doctor 扫描：

```bash
setuplens failure-dataset collect --limit 50 --clone --scan --format json --output .setuplens/failure-dataset/sources.json
```

最后生成审核反馈：

```bash
setuplens failure-dataset review --input .setuplens/failure-dataset/sources.json
```

把高价值候选项生成 corpus 草稿与人工审核清单：

```bash
setuplens failure-dataset promote --input .setuplens/failure-dataset/sources.json
setuplens failure-dataset promote --input .setuplens/failure-dataset/sources.json --format json --output .setuplens/failure-dataset/corpus-drafts.json
```

把审核后的公开扫描模式转成去敏的本地 corpus fixture：

```bash
npm run corpus:promote-public
```

生成 alpha.3 版本前后能力对比报告：

```bash
npm run report:capability
```

审核完证据后清理本地克隆缓存：

```bash
setuplens failure-dataset clean
setuplens failure-dataset clean --include-reports
```

manifest 会保留仓库 URL、clone URL、默认分支、license、topics、GitHub Search query、采集时间、可选 commit、脱敏后的扫描摘要、root cause 排名、safe fix 数量、未分类日志和 unknowns。promotion 输出会让 `fixture.files` 保持为空，直到人工完成最小化和脱敏，避免直接复制第三方源码。第三方源码默认只放在 `.setuplens/`，不提交进本仓库。详细流程见 [docs/failure-dataset/README.md](docs/failure-dataset/README.md)。

## 当前状态

详细的版本进入条件和暂缓方向记录在[版本路线](ROADMAP.zh-CN.md)中。当前 `0.2.0-alpha.3` 方向会继续把 `doctor` 做成更强的仓库启动医生：adapter、启动计划、probe、日志分类、评分回归、corpus promotion 和下一步行动会优先于单纯的速度承诺。

SetupLens 仍然是早期产品预览版，不是成熟稳定工具。当前已经具备：

- 77 项自动化测试
- Windows、Linux、macOS CI
- setup 与 hygiene 分离
- 不支持技术栈不打分
- 启动诊断、准备命令、运行命令和阻塞项展示
- 面向 Next/Vite/Prisma、Django/FastAPI、Laravel、Rails、Spring、.NET Web、Go service、Rust binary、Turbo/Nx 的深度 doctor 规则
- failure corpus：把真实坏项目和提炼后的失败模式沉淀成可复现 fixture 与回归测试
- failure dataset intake：自动拉取 50 个公开候选项目、备案来源证据、可选扫描，并产出 corpus/classifier 审核反馈
- failure dataset promotion：从公开扫描证据生成 corpus 草稿和人工审核清单，并支持清理本地克隆缓存
- alpha.3 证据刷新：50 个公开来源、47 个静态 doctor 扫描、39 个 promotion candidates，并把 corpus 扩展到 56 个通过用例
- corpus metrics：诊断命中率、首因命中率、safe-fix 命中率、误报 blocker、生态覆盖
- 默认安全 probe、显式 `--probe-startup`、probe trace、ready output 识别
- terminal、JSON、HTML action panel 报告
- fix-plan 修复计划，以及只执行白名单低风险修改和安全配方的 `doctor --apply safe`
- 终端、JSON、HTML、GitHub Action 输出

接下来会继续优先提升真实使用价值，而不是盲目扩展更多语言。

## 本地开发

```bash
git clone https://github.com/Milankunderzzz/SetupLens.git
cd SetupLens
npm ci
npm run check
npm test
npm run corpus
npm run corpus:promote-public
npm run dataset:collect -- --limit 50 --format json
npm run dataset:review -- --input .setuplens/failure-dataset/sources.json
npm run dataset:promote -- --input .setuplens/failure-dataset/sources.json
npm run dataset:clean
npm run report:capability
node ./bin/setuplens.js scan .
node ./bin/setuplens.js doctor . --probe
node ./bin/setuplens.js doctor-suite ./repos --format json
node ./bin/setuplens.js failure-dataset collect --limit 50 --clone --scan
```

## License

[MIT](LICENSE)
