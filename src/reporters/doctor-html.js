function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function list(items, renderer) {
  if (!items || items.length === 0) return '<p class="empty">None</p>';
  return `<ul>${items.map((item) => `<li>${renderer(item)}</li>`).join('')}</ul>`;
}

function statusClass(status) {
  if (status === 'blocked') return 'bad';
  if (status === 'ready') return 'good';
  return 'warn';
}

export function renderDoctorHtml(report) {
  const panel = report.diagnosis.actionPanel;
  const topCause = panel?.topRootCause;
  const nextCommand = panel?.nextCommand;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>SetupLens Doctor - ${escapeHtml(report.target.name)}</title>
  <style>
    :root { --bg:#f7f8fa; --ink:#17202a; --muted:#64748b; --line:#d9e0e8; --panel:#fff; --good:#147a45; --warn:#9a5b00; --bad:#b42318; --info:#1769aa; }
    * { box-sizing:border-box; }
    body { margin:0; font-family:Inter, "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background:var(--bg); color:var(--ink); }
    main { max-width:1120px; margin:0 auto; padding:32px 20px 48px; }
    header { display:flex; justify-content:space-between; gap:20px; align-items:flex-start; margin-bottom:24px; }
    h1 { font-size:28px; margin:0 0 6px; }
    h2 { font-size:17px; margin:0 0 12px; }
    p { margin:0; color:var(--muted); line-height:1.5; }
    code { font-family:"SFMono-Regular", Consolas, monospace; overflow-wrap:anywhere; }
    .verdict { border:1px solid var(--line); border-radius:6px; padding:12px 14px; background:var(--panel); min-width:190px; }
    .verdict strong { display:block; font-size:20px; text-transform:uppercase; }
    .good { color:var(--good); } .warn { color:var(--warn); } .bad { color:var(--bad); }
    .grid { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:16px; }
    .wide { grid-column:1 / -1; }
    section { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:16px; }
    .metrics { display:grid; grid-template-columns:repeat(5, minmax(0, 1fr)); gap:12px; margin-bottom:16px; }
    .metric { border:1px solid var(--line); border-radius:6px; padding:12px; background:#fbfcfe; }
    .metric span { display:block; color:var(--muted); font-size:12px; margin-bottom:4px; }
    .metric strong { font-size:20px; }
    ul { margin:0; padding-left:18px; }
    li { margin:8px 0; line-height:1.45; }
    .tag { display:inline-block; border:1px solid var(--line); border-radius:999px; padding:2px 8px; color:var(--muted); font-size:12px; margin-left:6px; }
    .empty { color:var(--muted); }
    @media (max-width:760px) { header { flex-direction:column; } .grid, .metrics { grid-template-columns:1fr; } .wide { grid-column:auto; } }
  </style>
</head>
<body>
<main>
  <header>
    <div>
      <h1>SetupLens Doctor</h1>
      <p>${escapeHtml(report.target.name)} - ${escapeHtml(report.summary)}</p>
    </div>
    <div class="verdict">
      <span>Verdict</span>
      <strong class="${statusClass(report.status)}">${escapeHtml(report.status.replaceAll('_', ' '))}</strong>
    </div>
  </header>

  <section class="wide">
    <h2>Action Panel</h2>
    <div class="metrics">
      <div class="metric"><span>Readiness</span><strong>${panel?.readiness?.score === null ? 'n/a' : `${escapeHtml(panel?.readiness?.score ?? 0)}/100`}</strong></div>
      <div class="metric"><span>Diagnosis Confidence</span><strong>${escapeHtml(panel?.confidence?.level ?? 'unknown')}</strong></div>
      <div class="metric"><span>Safe Fixes</span><strong>${escapeHtml(panel?.safeFixes?.length ?? 0)}</strong></div>
      <div class="metric"><span>Manual Fixes</span><strong>${escapeHtml(panel?.manualFixes?.length ?? 0)}</strong></div>
      <div class="metric"><span>Probe Results</span><strong>${escapeHtml(panel?.probeTrace?.total ?? 0)}</strong></div>
    </div>
    <p><strong>Top cause:</strong> ${topCause ? `${escapeHtml(topCause.title)} <span class="tag">${escapeHtml(topCause.source)}</span>` : 'None'}</p>
    <p><strong>Next command:</strong> ${nextCommand ? `<code>${escapeHtml(nextCommand.command)}</code>` : 'None'}</p>
  </section>

  <div class="grid">
    <section>
      <h2>Root Causes</h2>
      ${list(report.diagnosis.rootCauses.slice(0, 8), (cause) => `<strong>#${escapeHtml(cause.rank)} ${escapeHtml(cause.title)}</strong><span class="tag">${escapeHtml(cause.severity)}</span><br>${escapeHtml(cause.evidence ?? '')}`)}
    </section>
    <section>
      <h2>Fix Plan</h2>
      ${list(report.diagnosis.fixPlan.fixes.slice(0, 10), (fix) => `<strong>${escapeHtml(fix.canApply ? 'SAFE' : 'MANUAL')} ${escapeHtml(fix.title)}</strong><br>${escapeHtml(fix.description)}<br><span class="tag">${escapeHtml(fix.explanation ?? '')}</span>`)}
    </section>
    <section>
      <h2>Probe Trace</h2>
      ${list(report.probes.results.slice(0, 10), (probe) => `<strong>${escapeHtml(probe.status)} ${escapeHtml(probe.label)}</strong><br><code>${escapeHtml(probe.display)}</code><br>${escapeHtml(probe.classification?.title ?? probe.purpose)}`)}
    </section>
    <section>
      <h2>Unknowns</h2>
      ${list(report.diagnosis.unknowns, (item) => escapeHtml(item))}
    </section>
  </div>
</main>
</body>
</html>
`;
}
