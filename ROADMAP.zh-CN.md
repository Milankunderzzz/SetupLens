# SetupLens 版本路线

最后更新：2026-07-04

SetupLens 正在从静态清单工具走向本地优先的仓库医生。目标不是宣称每个项目都能自动修好，而是让工具能更可靠地判断项目是什么、为什么大概率跑不起来、有哪些证据支持这个判断，以及哪些修复足够安全，可以建议或执行。

## 产品原则

1. 用证据证明能力，而不是堆功能数量。
2. 诊断必须确定性、本地优先、可解释。
3. 区分静态 readiness、命令 probe 和人工 ground truth。
4. 未标注的公开项目扫描只能算运营证据，不能当最终准确率。
5. 只自动执行低风险白名单修复，不覆盖用户已有文件。
6. 真实失败要先沉淀成最小 corpus case，再宣称覆盖。

## 当前路线

v0.2 线现在有两个用户入口：

- `scan`：面向 CI 的确定性 readiness 与仓库规范检查。
- `doctor`：基于 adapter 的仓库诊断，包含启动计划、可选 probe、失败分类、fix plan 和行动面板报告。

当前 `0.2.0-alpha.3` 分支补上了把公开扫描证据沉淀为 corpus 草稿所需的 promotion 层，同时让第三方克隆仓库继续留在 git 外并可被安全清理。

## 版本方向

### v0.2.0-alpha.2 - 评分回归与更安全 probe

目标：让公开 failure dataset 闭环可度量，同时避免把未标注扫描误说成最终准确率。

- 输出诊断命中率、有标注时的首因命中率、safe-fix 生成率、误报 blocker 指标、误报风险和生态覆盖。
- 明确区分 labeled accuracy 与 operational proxy metrics。
- 识别长时间启动命令中的 ready output，并安全停止 probe。
- 当前置条件缺失时跳过可选 probe，例如没有 `node_modules` 时不跑 Next/Vite 深 probe。
- 保持版本号、README、CHANGELOG、demo 报告和路线图一致。

状态：已在 alpha.2 release 分支完成。

### v0.2.0-alpha.3 - Corpus promotion 工作流

目标：把有价值的公开扫描结果变成可审核 corpus 草稿，而不是停留在一次性观察。

- 增加把 failure-dataset candidate 转成 reviewable corpus case 草稿的流程。
- 为每个 promoted case 保存期望 status、期望 root-cause type、期望 top cause、safe-fix 期望和 provenance 指针。
- 生成 review checklist，标出公开 candidate 进入 committed corpus 之前还缺哪些证据。
- 增加 `.setuplens/failure-dataset/repos` 清理工具，避免大量克隆项目长期留在用户电脑上。

进入下一阶段条件：promotion 草稿、本地缓存清理、语法检查、完整测试、corpus 回归和 failure-dataset review 都在 release 分支通过。

### v0.2.0-beta - 真实项目回归闭环

目标：让 SetupLens 随着更多坏项目扫描而可见地变强。

- 保存历史 scorecard snapshot，支持对比规则变更前后的回归。
- 生成可视化回归报告，展示生态覆盖、失败类型分布、unknown log、safe-fix yield 和 false-blocker risk。
- 只有当 corpus case 或公开扫描证明存在缺口时，才扩展框架专用 classifier。
- 将 doctor HTML 报告升级成更清晰的行动面板：root cause、evidence、next command、safe fixes、manual fixes、probe trace、unknowns 和 confidence explanation。

进入下一阶段条件：一套可重复运行的 suite 能说明某次规则更新到底改善还是破坏了真实诊断行为。

### v0.2.0 - 稳定 doctor 预览

目标：发布第一个产品方向清晰的预览版本。

- 稳定 `doctor`、`scan`、`doctor-suite` 和 `failure-dataset` 命令契约，足够早期用户使用。
- npm 与 GitHub Action 文档指向同一个 release tag。
- 如实标注支持生态，不支持的 primary stack 返回 `Unsupported / Not scored`。
- 公开局限性、safe-fix 边界和证据要求。

发布条件：命令契约已记录、demo 可复现，并且不存在会明显误导用户的评分或报告路径。

### v0.3.0 - 真实采用驱动的改进

目标：按实际失败频率和用户价值排优先级。

- 从已确认案例扩展生态深度，而不是堆猜测规则。
- 改进解释、下一步行动、报告对比和插件体验。
- 只有操作本地、可逆、可 review 时，才继续增加 safe recipe。
- 将 v0.2 证据集保留为回归套件。

### v1.0.0 - 稳定产品契约

目标：让 SetupLens 能可靠用于个人日常工作与 CI。

- 稳定 CLI 命令、退出码、JSON schema、Action 输出和插件 API。
- 发布兼容性、弃用、安全和支持政策。
- 保持 npm、GitHub Action 和 GitHub Release 可复现。
- 维护一份持续更新、明确局限性的 benchmark 与回归报告。

## 在证据支持之前暂缓

- 不受限制的自动修复。
- 默认运行长时间服务。
- 云账户、遥测或上传仓库内容。
- 未经测量就宣称准确率、节省时间或“覆盖所有项目”。
- 没有 corpus case 或公开扫描证据的大规模新生态扩展。

## 决策指标

路线图将根据以下指标复核：

- 诊断命中率；
- root cause 是否排第一；
- safe-fix 生成率；
- 误报 blocker 与误报风险；
- 生态覆盖数量；
- unclassified probe log 与 diagnostic unknown；
- 得到第一个可执行 next command 所需时间；
- 支持平台上的安装、扫描与报告生成成功率。
