<div align="center">

# SetupLens

**一条命令，在 30 秒内告诉你一个仓库为什么跑不起来。**

[English](README.md) | [为什么做这个项目](ARCHITECTURE.md) | [插件 API](docs/PLUGIN_API.md) | [示例报告](docs/demo-report.html)

</div>

**一次真实启动失败的定位过程：** Docker Compose 找不到构建路径后，SetupLens 在 810 ms 内定位到 4 个错误 Compose 路径和 1 个缺失 npm 脚本。

![Docker Compose 启动失败后，SetupLens 在 810 ms 内找到 5 个已确认的启动阻塞项](docs/assets/demo.gif)

SetupLens 是我正在持续维护的个人开源项目，起因是一个反复遇到的问题：仓库看起来很完整，克隆下来却跑不起来。它会检查当前电脑和仓库，找出缺失的运行时、依赖、环境文件、错误路径和其他常见的启动问题。

目前规则主要覆盖 Node.js、Python 和 Docker，我会先把这些常见场景做扎实，再扩大范围。项目范围与代码设计的理由记录在 [ARCHITECTURE.md](ARCHITECTURE.md)。

## 一条命令体验

无需克隆、注册或上传代码：

```bash
npx --yes github:Milankunderzzz/SetupLens scan .
```

生成完全离线、可分享的 HTML 报告：

```bash
npx --yes github:Milankunderzzz/SetupLens scan . --format html --output setuplens-report.html
```

SetupLens 只读取本地文件和命令，不上传仓库内容、环境变量值或扫描结果。

扫描器会区分主技术栈、支持技术栈和偶然出现的测试/示例文件；monorepo 依赖按 workspace 根目录汇总，文档与测试夹具也不会再被当作主流程中的环境文件或普通硬编码密钥。

## 真实量化结果

在 Windows 11、Intel i5-12500H、Node.js 24 环境下，对一个包含 Node.js、Python、Docker 和 261 个文件的真实 CMMS 项目执行 10 次扫描：

| 指标 | 结果 |
|---|---:|
| 10 次扫描中位数 | **764 ms** |
| 最快 / 最慢 | 721 ms / 869 ms |
| 检查项 | 27 |
| 结果 | 2 个失败、9 个警告、15 个通过 |
| 确认发现 | 4 个 Compose 错误路径、1 个缺失 npm 脚本 |
| 上传数据 | **0 字节** |

![SetupLens 真实 HTML 报告](docs/assets/report.png)

## 项目范围与同类工具

我不打算用 SetupLens 替代所有审计工具。它只聚焦一个时刻：**开发者已经拿到代码，但项目在他的电脑上跑不起来。**

| 产品 | 主要解决的问题 | 本地运行环境 | 仓库规范 | 维护者分析 | Web 性能 | 离线 |
|---|---|:---:|:---:|:---:|:---:|:---:|
| **SetupLens** | 为什么这个仓库在这里跑不起来？ | **强** | 基础 | 无 | 无 | **是** |
| [Repo Doctor](https://github.com/JaaasperLiu/repo-doctor) | 仓库是否符合开源规范？ | 无 | **强，支持自动修复** | 无 | 无 | 是 |
| [GitVital](https://github.com/bugsNburgers/GitVital) | GitHub 项目是否健康活跃？ | 无 | 基于元数据 | **强** | 无 | 否 |
| [Lighthouse](https://github.com/GoogleChrome/lighthouse) | 已部署网页是否快速、可访问？ | 仅浏览器 | 无 | 无 | **强** | 是 |

### 目前做得比较好的地方

- 能发现 GitHub 元数据看不到的本机环境和真实路径问题。
- 零运行时依赖、无需账号、无遥测、本地完成。
- 同一份扫描结果支持终端、JSON、HTML 和 GitHub Action。
- 核心功能聚焦，同时允许显式加载团队插件。

### 仍需改进的地方

- 仍处于早期阶段，规则数量少于成熟专项工具。
- 当前需要 Node.js 18.17 或更高版本启动。
- 目前提供修复建议，但不会自动修改项目文件。
- 不替代漏洞扫描、网页性能测试或长期维护者分析。

目前我只加入能够指向具体文件、命令或配置项的检查。以后可能增加可选的 AI 解释，但底层问题应该在没有模型时也能稳定复现。

## 输出与 CI

```bash
setuplens scan .
setuplens scan . --format json --output setuplens-report.json
setuplens scan . --format html --output setuplens-report.html
setuplens scan . --threshold 80
setuplens scan . --plugin ./examples/custom-plugin.mjs
```

## 评分方式

主分数只回答一个问题：**这个仓库在当前电脑上是否已经准备好运行？** 它由 `setup` 范围的检查计算，包括运行时、依赖、配置、路径、安全、扫描覆盖率，以及默认的插件检查。

README、许可证、`.gitignore`、CI 和测试覆盖属于独立的 `hygiene` 范围。它们仍会显示，并拥有单独的分数与摘要，但不会降低启动就绪分数。`--threshold` 和 GitHub Action 阈值均使用启动就绪分数。

当仓库为空、无法识别主技术栈，或主技术栈不在支持范围内时，SetupLens 会显示 `Unsupported / Not scored`，而不是给出可能误导用户的数字等级。通用的仓库规范和安全观察仍然显示，但不能据此证明该项目能够运行。无法计算就绪分数时，阈值检查会按未通过处理。

在 JSON 输出中，`summary` 表示启动就绪统计，`allSummary` 表示全部检查统计，`scopes` 则包含 setup 与 hygiene 各自的分数。`scorable`、`scoreStatus`、`notScoredReason` 和 `scoreMessage` 用于说明数字分数是否有效。`primaryStack`、`primaryStacks` 和 `stackEvidence` 会说明主技术栈、支持技术栈及其清单证据。

## 我正在做什么

- **现在：** 将研究范围锁定为 Node.js、Python 和 Docker，减少误报并扩充基于夹具的测试。
- **下一步：** 使用独立人工标注的仓库启动基准验证结果，重点处理 monorepo 和文件上下文。
- **以后：** 只有核心基准达到明确的精确率和召回率目标后，才重新评估 Java、Go、Rust 的深度支持。

现有 Java、Go、Rust 清单检测会保留为实验性边界行为，但暂停新增这些生态的规则。带有最小复现的 issue 对我最有帮助。

## 开发

```bash
git clone https://github.com/Milankunderzzz/SetupLens.git
cd SetupLens
npm ci
npm run check
npm test
node ./bin/setuplens.js scan .
```

扫描运行时只使用 Node.js 内置模块。开发依赖仅用于生成 README 演示 GIF。

## 参与项目

这是一个单人维护的早期项目。我尤其需要误报案例、跨平台测试和小而明确的规则改进，提交前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 与 [SECURITY.md](SECURITY.md)。

## 许可证

[MIT](LICENSE)
