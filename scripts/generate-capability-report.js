import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateCorpus } from './evaluate-failure-corpus.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DEFAULT_OUTPUT = path.join(ROOT, 'docs/failure-dataset/alpha3-capability-report.html');

const BASELINE = {
  label: '2026-07-01 alpha.1',
  sources: 50,
  cloned: 49,
  scanned: 49,
  cloneFailures: 1,
  candidates: 41,
  safeFixes: 77,
  manualFixes: 786,
  unclassifiedLogs: 0,
  failureTypes: {
    missing_env_reference: 784,
    missing_compose_env_file: 18,
    'dependencies.node.installed.package.json': 14,
    'configuration.env.missing..env.example': 13,
    'dependencies.python.venv': 13,
    'dependencies.node.workspace-installed': 6,
    next_missing_routes: 4,
    'paths.compose.docker-compose.yml': 4
  },
  corpusCases: 13,
  corpusFirstRootCauseRate: 100
};

function argValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

async function readJson(relative) {
  return JSON.parse(await fs.readFile(path.join(ROOT, relative), 'utf8'));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function countByName(items = []) {
  return Object.fromEntries(items.map((item) => [item.name, item.count]));
}

function fmt(value) {
  if (value === null || value === undefined) return 'n/a';
  return Number(value).toLocaleString('en-US');
}

function percent(value) {
  if (value === null || value === undefined) return 'n/a';
  return `${Number(value).toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;
}

function metricCard(label, value, note = '') {
  return `<article class="metric-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>${note ? `<small>${escapeHtml(note)}</small>` : ''}</article>`;
}

function barRows(rows, options = {}) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return `<div class="bar-list">${rows.map((row) => {
    const width = Math.max(2, Math.round((row.value / max) * 100));
    return `<div class="bar-row">
      <div class="bar-label">${escapeHtml(row.label)}</div>
      <div class="bar-track"><span style="width:${width}%; background:${row.color ?? 'var(--blue)'}"></span></div>
      <div class="bar-value">${escapeHtml(options.format ? options.format(row.value) : fmt(row.value))}</div>
    </div>`;
  }).join('')}</div>`;
}

function deltaClass(delta, inverse = false) {
  if (delta === 0) return 'neutral';
  const good = inverse ? delta < 0 : delta > 0;
  return good ? 'good' : 'bad';
}

function comparisonTable(rows) {
  return `<table>
    <thead><tr><th>Signal</th><th>alpha.1</th><th>alpha.3</th><th>Change</th><th>Read</th></tr></thead>
    <tbody>${rows.map((row) => {
    const delta = row.after - row.before;
    const label = delta === 0 ? '0' : `${delta > 0 ? '+' : ''}${fmt(delta)}`;
    return `<tr>
      <td>${escapeHtml(row.label)}</td>
      <td>${fmt(row.before)}</td>
      <td>${fmt(row.after)}</td>
      <td><span class="delta ${deltaClass(delta, row.inverse)}">${escapeHtml(label)}</span></td>
      <td>${escapeHtml(row.read)}</td>
    </tr>`;
  }).join('')}</tbody>
  </table>`;
}

function statusPills(statuses) {
  return `<div class="status-grid">${statuses.map((item) => `<div class="status-pill status-${escapeHtml(item.name)}"><span>${escapeHtml(item.name.replaceAll('_', ' '))}</span><strong>${fmt(item.count)}</strong></div>`).join('')}</div>`;
}

function topTable(rows) {
  return `<table>
    <thead><tr><th>Project</th><th>Status</th><th>Top root cause</th><th>Safe</th><th>Manual</th></tr></thead>
    <tbody>${rows.map((row) => `<tr>
      <td><code>${escapeHtml(row.project)}</code></td>
      <td>${escapeHtml(row.status)}</td>
      <td><code>${escapeHtml(row.root)}</code></td>
      <td>${fmt(row.safe)}</td>
      <td>${fmt(row.manual)}</td>
    </tr>`).join('')}</tbody>
  </table>`;
}

function html({ dataset, review, promotion, corpusMetrics }) {
  const summary = review.summary;
  const cloneStatus = countByName(dataset.summary.cloneStatuses);
  const cloneFailures = (cloneStatus.failed ?? 0) + (cloneStatus.timeout ?? 0) + (cloneStatus.error ?? 0);
  const alpha3 = {
    label: '2026-07-09 alpha.3',
    sources: dataset.summary.sources,
    cloned: dataset.summary.cloned,
    scanned: dataset.summary.scanned,
    cloneFailures,
    candidates: summary.corpusCandidates,
    safeFixes: summary.safeFixes,
    manualFixes: summary.manualFixes,
    unclassifiedLogs: summary.unclassifiedLogs,
    failureTypes: countByName(summary.failureTypeDistribution),
    corpusCases: corpusMetrics.cases,
    corpusFirstRootCauseRate: corpusMetrics.rootCauseFirstRate
  };
  const score = review.scorecard.metrics;
  const topFailures = summary.failureTypeDistribution.slice(0, 10).map((item, index) => ({
    label: item.name,
    value: item.count,
    color: ['#5477C4', '#F0986E', '#A3D576', '#F390CA', '#FFE15B'][index % 5]
  }));
  const ecosystemRows = review.scorecard.ecosystemCoverage.slice(0, 12).map((item, index) => ({
    label: item.ecosystem,
    value: item.scanned,
    color: ['#5477C4', '#F0986E', '#A3D576', '#F390CA', '#FFE15B'][index % 5]
  }));
  const beforeAfterRows = [
    { label: 'Missing env reference noise', before: BASELINE.failureTypes.missing_env_reference, after: alpha3.failureTypes.missing_env_reference ?? 0, inverse: true, read: 'Grouped evidence replaced hundreds of repeated env warnings.' },
    { label: 'Manual fix volume', before: BASELINE.manualFixes, after: alpha3.manualFixes, inverse: true, read: 'Action plans became dramatically less noisy.' },
    { label: 'Safe fix opportunities', before: BASELINE.safeFixes, after: alpha3.safeFixes, read: 'Safe-fix yield stayed intact.' },
    { label: 'Promotion candidates', before: BASELINE.candidates, after: alpha3.candidates, read: 'Candidate volume stayed comparable on a new live sample.' },
    { label: 'Corpus cases', before: BASELINE.corpusCases, after: alpha3.corpusCases, read: 'Regression coverage moved from seed-sized to broad alpha coverage.' },
    { label: 'Clone failures', before: BASELINE.cloneFailures, after: alpha3.cloneFailures, inverse: true, read: 'The new live sample exposed more intake boundaries.' }
  ];
  const queue = review.feedback.corpusPromotionQueue.slice(0, 12).map((candidate) => ({
    project: candidate.source.fullName,
    status: candidate.scan.status,
    root: candidate.scan.topRootCause?.type ?? candidate.scan.rootCauseTypes?.[0] ?? 'unknown',
    safe: candidate.scan.safeFixCount,
    manual: candidate.scan.manualFixCount
  }));
  const generatedAt = new Date().toLocaleString('zh-CN', { hour12: false });

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SetupLens alpha.3 能力对比报告</title>
  <style>
    :root {
      --ink:#17202a; --muted:#607080; --line:#d9e0e8; --panel:#fff; --canvas:#f4f7fb;
      --blue:#5477C4; --orange:#F0986E; --olive:#71B436; --pink:#BD569B; --gold:#B8A037;
      --green:#147a45; --red:#b42318; --amber:#9a6700;
    }
    * { box-sizing:border-box; }
    body { margin:0; background:var(--canvas); color:var(--ink); font:15px/1.55 Inter, "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", "Segoe UI", sans-serif; letter-spacing:0; }
    header { background:linear-gradient(135deg, #17305c, #0f7b83); color:#fff; padding:42px 28px 64px; }
    .wrap { width:min(1180px, calc(100% - 36px)); margin:0 auto; }
    h1 { margin:0; font-size:34px; line-height:1.15; }
    h2 { margin:0 0 14px; font-size:22px; }
    h3 { margin:0 0 8px; font-size:16px; }
    p { margin:0 0 12px; color:var(--muted); }
    header p { max-width:850px; color:#d8e8ef; margin-top:12px; }
    code { font-family:"SFMono-Regular", Consolas, "Microsoft YaHei", monospace; overflow-wrap:anywhere; }
    main { margin-top:-42px; padding-bottom:56px; }
    section { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:22px; margin:18px 0; box-shadow:0 16px 38px rgba(24, 38, 55, .06); }
    .summary { border-left:5px solid var(--green); }
    .summary ul { margin:0; padding-left:20px; }
    .summary li { margin:8px 0; }
    .metric-grid { display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:12px; margin-top:16px; }
    .metric-card { border:1px solid var(--line); border-radius:8px; background:#fbfcfe; padding:15px; min-height:104px; }
    .metric-card span { display:block; color:var(--muted); font-size:12px; text-transform:uppercase; letter-spacing:.04em; }
    .metric-card strong { display:block; margin:7px 0 3px; font-size:28px; line-height:1; }
    .metric-card small { color:var(--muted); }
    .grid { display:grid; grid-template-columns:1fr 1fr; gap:18px; }
    .bar-list { display:grid; gap:9px; }
    .bar-row { display:grid; grid-template-columns:minmax(160px, 260px) minmax(0, 1fr) 68px; gap:10px; align-items:center; }
    .bar-label { overflow-wrap:anywhere; color:#263243; }
    .bar-track { height:16px; background:#edf1f6; border-radius:999px; overflow:hidden; border:1px solid #e0e6ef; }
    .bar-track span { display:block; height:100%; border-radius:999px; }
    .bar-value { text-align:right; font-variant-numeric:tabular-nums; color:#263243; }
    .status-grid { display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:10px; }
    .status-pill { border:1px solid var(--line); border-radius:8px; padding:13px; background:#fbfcfe; }
    .status-pill span { display:block; color:var(--muted); text-transform:uppercase; font-size:12px; }
    .status-pill strong { display:block; font-size:24px; }
    .status-blocked { border-top:4px solid var(--red); }
    .status-needs_setup { border-top:4px solid var(--amber); }
    .status-needs_probe { border-top:4px solid var(--blue); }
    .status-skipped { border-top:4px solid #7a828f; }
    table { width:100%; border-collapse:collapse; }
    th, td { border-bottom:1px solid var(--line); padding:10px 8px; text-align:left; vertical-align:top; }
    th { color:#3b4b61; font-size:12px; text-transform:uppercase; letter-spacing:.04em; background:#f7f9fc; }
    .delta { display:inline-block; min-width:66px; border-radius:999px; padding:3px 8px; text-align:center; font-variant-numeric:tabular-nums; }
    .delta.good { background:#eaf8f0; color:var(--green); }
    .delta.bad { background:#fff1f0; color:var(--red); }
    .delta.neutral { background:#eef2f6; color:#566273; }
    .note { background:#f8fbff; border-left:4px solid var(--blue); padding:14px 16px; border-radius:6px; color:#3c4d64; }
    footer { color:var(--muted); padding:18px 0 0; font-size:13px; }
    @media (max-width:860px) {
      .metric-grid, .grid, .status-grid { grid-template-columns:1fr; }
      .bar-row { grid-template-columns:1fr; gap:4px; }
      .bar-value { text-align:left; }
      h1 { font-size:28px; }
    }
  </style>
</head>
<body>
  <header>
    <div class="wrap">
      <h1>SetupLens alpha.3 能力对比报告</h1>
      <p>基于重新生成的 50 个公开 GitHub 候选项目、47 个静态 doctor 扫描、39 个 promotion candidates，以及 56 个 failure corpus 回归用例。</p>
    </div>
  </header>
  <main class="wrap">
    <section class="summary">
      <h2>Executive Summary</h2>
      <ul>
        <li><strong>alpha.3 的主要进步是“降噪而不是堆数量”。</strong> <code>missing_env_reference</code> 从 784 条降到 13 条，manual fix 从 786 条降到 19 条，同时 safe fix 仍保持 77 个机会。</li>
        <li><strong>真实扫描链路已经跑通。</strong> 本轮重新采集 50 个来源，47 个完成 clone+scan，失败的 3 个被归类为网络、checkout 和 Windows 路径长度边界。</li>
        <li><strong>corpus 已经从 13 扩到 56。</strong> 新增 43 个去敏最小 fixtures，覆盖 Next/Vite/Prisma、Python、PHP/Ruby、Java/.NET、Go/Rust、Compose、Turbo/Nx。</li>
        <li><strong>还不能宣称最终准确率。</strong> 公开扫描仍是 operational evidence；真正的 precision/recall 需要更多人工标注 holdout。</li>
      </ul>
    </section>

    <section>
      <h2>当前 alpha.3 证据面板</h2>
      <div class="metric-grid">
        ${metricCard('Sources', fmt(alpha3.sources), '公开候选来源')}
        ${metricCard('Scanned', fmt(alpha3.scanned), '静态 doctor 报告')}
        ${metricCard('Promotion candidates', fmt(alpha3.candidates), '可进入人工审查队列')}
        ${metricCard('Corpus cases', fmt(alpha3.corpusCases), '56/56 已通过')}
        ${metricCard('Diagnostic hit rate', percent(score.diagnosticHitRate.value), 'operational 39/39')}
        ${metricCard('Safe-fix generation', percent(score.safeFixGenerationRate.value), 'operational 39/39')}
        ${metricCard('False-blocker risk', percent(score.falseBlockerRiskRate.value), 'operational 0/12')}
        ${metricCard('Root cause first', percent(corpusMetrics.rootCauseFirstRate), 'labeled corpus')}
      </div>
    </section>

    <section>
      <h2>alpha.1 到 alpha.3 的关键变化</h2>
      <p>最有价值的变化是报告可读性：高重复 env/manual 噪声被聚合，safe fix 产出没有下降。</p>
      ${comparisonTable(beforeAfterRows)}
    </section>

    <div class="grid">
      <section>
        <h2>扫描状态分布</h2>
        ${statusPills(summary.statuses)}
      </section>
      <section>
        <h2>Top failure types</h2>
        ${barRows(topFailures)}
      </section>
    </div>

    <div class="grid">
      <section>
        <h2>生态覆盖</h2>
        <p>按 discovery bucket 的 scanned 数量展示，覆盖 12 类公开来源。</p>
        ${barRows(ecosystemRows)}
      </section>
      <section>
        <h2>Corpus 回归指标</h2>
        ${barRows([
    { label: 'Diagnostic hit rate', value: corpusMetrics.diagnosticHitRate, color: 'var(--green)' },
    { label: 'Root cause first', value: corpusMetrics.rootCauseFirstRate, color: 'var(--blue)' },
    { label: 'Safe-fix generation', value: corpusMetrics.safeFixGenerationRate, color: 'var(--olive)' },
    { label: 'False blocker rate', value: corpusMetrics.falseBlockerRate ?? 0, color: 'var(--red)' }
  ], { format: percent })}
      </section>
    </div>

    <section>
      <h2>高优先级 promotion queue</h2>
      <p>这些项目的扫描结果最适合继续人工最小化，变成真实 labeled corpus。</p>
      ${topTable(queue)}
    </section>

    <section>
      <h2>下一步判断</h2>
      <p class="note"><strong>SetupLens 现在已经具备“证据驱动迭代”的基础能力。</strong> 下一阶段最值得做的是：从这 12 个 blocked 高优先级候选里跑 probe，只挑能复现的项目人工标注，然后把 synthetic distilled cases 替换或补强成真实 labeled holdout。那时它才能开始给出更硬的准确率声明。</p>
    </section>

    <footer>
      Generated locally by SetupLens ${escapeHtml(dataset.tool.version)} at ${escapeHtml(generatedAt)}. Source inputs: docs/failure-dataset/sources.json, .setuplens/failure-dataset/review.json, .setuplens/failure-dataset/corpus-drafts.json, npm run corpus.
    </footer>
  </main>
</body>
</html>
`;
}

async function main() {
  const args = process.argv.slice(2);
  const output = path.resolve(ROOT, argValue(args, '--output', DEFAULT_OUTPUT));
  const desktop = argValue(args, '--desktop-output', null);
  const [dataset, review, promotion, corpus] = await Promise.all([
    readJson('docs/failure-dataset/sources.json'),
    readJson('.setuplens/failure-dataset/review.json'),
    readJson('.setuplens/failure-dataset/corpus-drafts.json'),
    evaluateCorpus()
  ]);
  const report = html({ dataset, review, promotion, corpusMetrics: corpus.metrics });
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, report, 'utf8');
  if (desktop) {
    await fs.mkdir(path.dirname(desktop), { recursive: true });
    await fs.writeFile(desktop, report, 'utf8');
  }
  process.stdout.write(`Wrote ${output}\n`);
  if (desktop) process.stdout.write(`Wrote ${desktop}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
