import { escapeHtml } from '../lib/utils.js';

function findingRow(item) {
  return `<article class="finding finding-${item.status}">
    <div class="finding-main">
      <span class="status">${escapeHtml(item.status.toUpperCase())}</span>
      <div>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.message)}</p>
${item.evidence ? `        <p class="evidence">Evidence: ${escapeHtml(item.evidence)}</p>\n` : ''}      </div>
      <span class="category">${escapeHtml(item.scope)} / ${escapeHtml(item.category)}</span>
    </div>
${item.recommendation ? `    <p class="recommendation"><strong>Fix:</strong> ${escapeHtml(item.recommendation)}</p>\n` : ''}  </article>`;
}

export function renderHtml(report) {
  const actions = report.findings
    .filter((item) => item.recommendation && ['fail', 'warn'].includes(item.status))
    .sort((left, right) => Number(left.scope === 'hygiene') - Number(right.scope === 'hygiene'))
    .slice(0, 6);
  const stack = report.primaryStacks?.length > 0 ? report.primaryStacks.join(' / ') : 'Unknown';
  const hygieneActions = report.scopes.hygiene.summary.fail + report.scopes.hygiene.summary.warn;
  const scoreValue = report.scorable ? report.score : 'Not scored';
  const scoreCaption = report.scorable
    ? `Readiness grade ${report.grade} / 100`
    : report.notScoredReason === 'unsupported_primary_stack'
      ? `Unsupported primary stack: ${stack}`
      : report.scoreMessage;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SetupLens report for ${escapeHtml(report.target.name)}</title>
  <style>
    :root { color-scheme: light; --ink:#17202a; --muted:#607080; --line:#d9e0e6; --paper:#ffffff; --canvas:#f3f6f8; --red:#b42318; --red-bg:#fff1f0; --amber:#9a6700; --amber-bg:#fff8df; --green:#147a45; --green-bg:#eaf8f0; --blue:#1769aa; --blue-bg:#eaf4fb; }
    * { box-sizing:border-box; }
    body { margin:0; background:var(--canvas); color:var(--ink); font:15px/1.5 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; letter-spacing:0; }
    header { background:#15232f; color:white; padding:34px 24px 30px; border-bottom:5px solid #39b47a; }
    .wrap { width:min(1100px, calc(100% - 32px)); margin:0 auto; }
    .brand { display:flex; align-items:center; justify-content:space-between; gap:20px; }
    .brand h1 { margin:0; font-size:30px; letter-spacing:0; }
    .brand p { margin:5px 0 0; color:#c9d6df; }
    .score { min-width:150px; text-align:right; }
    .score strong { display:block; font-size:42px; line-height:1; }
    .score span { color:#c9d6df; }
    .meta { display:flex; flex-wrap:wrap; gap:18px; margin-top:24px; color:#dbe5eb; }
    main { padding:24px 0 56px; }
    .metrics { display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:12px; margin-bottom:24px; }
    .metric { background:var(--paper); border:1px solid var(--line); border-radius:6px; padding:16px; }
    .metric span { display:block; color:var(--muted); font-size:12px; text-transform:uppercase; }
    .metric strong { display:block; margin-top:4px; font-size:24px; }
    section { margin-top:28px; }
    h2 { margin:0 0 12px; font-size:19px; }
    .actions { background:var(--paper); border-left:4px solid var(--blue); padding:18px 20px; }
    .actions ol { margin:8px 0 0; padding-left:22px; }
    .actions li { overflow-wrap:anywhere; }
    .actions li + li { margin-top:6px; }
    .findings { display:grid; gap:8px; }
    .finding { background:var(--paper); border:1px solid var(--line); border-left-width:4px; border-radius:4px; overflow:hidden; }
    .finding-fail { border-left-color:var(--red); }
    .finding-warn { border-left-color:var(--amber); }
    .finding-pass { border-left-color:var(--green); }
    .finding-info { border-left-color:var(--blue); }
    .finding-main { display:grid; grid-template-columns:58px minmax(0,1fr) auto; gap:14px; align-items:start; padding:14px 16px; }
    .status { font-size:11px; font-weight:800; padding:3px 6px; text-align:center; border-radius:4px; }
    .finding-fail .status { color:var(--red); background:var(--red-bg); }
    .finding-warn .status { color:var(--amber); background:var(--amber-bg); }
    .finding-pass .status { color:var(--green); background:var(--green-bg); }
    .finding-info .status { color:var(--blue); background:var(--blue-bg); }
    .finding h3 { margin:0; font-size:15px; }
    .finding p { margin:3px 0 0; color:var(--muted); }
    .finding .evidence { color:#44515c; font-family:ui-monospace, SFMono-Regular, Consolas, monospace; font-size:12px; overflow-wrap:anywhere; }
    .category { color:var(--muted); font-size:12px; white-space:nowrap; }
    .recommendation { margin:0; padding:10px 16px 12px 88px; background:#f8fafb; border-top:1px solid #edf0f2; }
    footer { padding:20px 0; color:var(--muted); font-size:13px; border-top:1px solid var(--line); }
    @media (max-width:720px) { .brand { align-items:flex-start; flex-direction:column; } .score { min-width:0; text-align:left; } .score strong { font-size:36px; } .meta span { min-width:0; overflow-wrap:anywhere; } .metrics { grid-template-columns:repeat(2,minmax(0,1fr)); } .finding-main { grid-template-columns:54px minmax(0,1fr); } .category { grid-column:2; } .recommendation { padding-left:16px; overflow-wrap:anywhere; } }
  </style>
</head>
<body>
  <header>
    <div class="wrap">
      <div class="brand">
        <div><h1>SetupLens</h1><p>Know why a repository will not run, in one command and under 30 seconds.</p></div>
        <div class="score"><strong>${escapeHtml(scoreValue)}</strong><span>${escapeHtml(scoreCaption)}</span></div>
      </div>
      <div class="meta"><span><strong>Target:</strong> ${escapeHtml(report.target.name)}</span><span><strong>Stack:</strong> ${escapeHtml(stack)}</span><span><strong>Duration:</strong> ${report.durationMs} ms</span><span><strong>Files:</strong> ${report.target.filesIndexed}</span></div>
    </div>
  </header>
  <main class="wrap">
    <div class="metrics">
      <div class="metric"><span>Setup failures</span><strong>${report.scopes.setup.summary.fail}</strong></div>
      <div class="metric"><span>Setup warnings</span><strong>${report.scopes.setup.summary.warn}</strong></div>
      <div class="metric"><span>Hygiene findings</span><strong>${hygieneActions}</strong></div>
      <div class="metric"><span>Total checks</span><strong>${report.allSummary.total}</strong></div>
    </div>
${actions.length > 0 ? `    <section class="actions"><h2>Highest-impact next actions</h2><ol>${actions.map((item) => `<li>${escapeHtml(item.recommendation)}</li>`).join('')}</ol></section>\n` : ''}
    <section><h2>Findings</h2><div class="findings">${report.findings.map(findingRow).join('')}</div></section>
  </main>
  <footer><div class="wrap">Generated locally by SetupLens ${escapeHtml(report.tool.version)} at ${escapeHtml(report.generatedAt)}. No repository data was uploaded.</div></footer>
</body>
</html>\n`;
}
