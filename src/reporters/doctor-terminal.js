const ANSI = Object.freeze({
  reset: '\u001b[0m', bold: '\u001b[1m', dim: '\u001b[2m',
  red: '\u001b[31m', green: '\u001b[32m', yellow: '\u001b[33m', cyan: '\u001b[36m'
});

function painter(enabled) {
  const color = (name, value) => enabled ? `${ANSI[name]}${value}${ANSI.reset}` : value;
  return {
    bold: (value) => color('bold', value),
    dim: (value) => color('dim', value),
    fail: (value) => color('red', value),
    warn: (value) => color('yellow', value),
    pass: (value) => color('green', value),
    info: (value) => color('cyan', value)
  };
}

function statusLabel(status, paint) {
  const labels = {
    blocked: paint.fail('BLOCKED'),
    needs_setup: paint.warn('NEEDS SETUP'),
    needs_probe: paint.info('NEEDS PROBE'),
    ready: paint.pass('READY'),
    unsupported: paint.warn('PARTIAL')
  };
  return labels[status] ?? status;
}

function severityLabel(severity, paint) {
  if (severity === 'fail') return paint.fail('FAIL');
  if (severity === 'warn') return paint.warn('WARN');
  return paint.info('INFO');
}

function renderAction(action, index, lines, paint) {
  const body = action.command ? paint.bold(action.command) : action.description;
  const location = action.cwd && action.cwd !== '.' ? ` in ${action.cwd}` : '';
  lines.push(`  ${index + 1}. ${body}${paint.dim(`${location} (${action.reason})`)}`);
}

function renderProbe(result, lines, paint) {
  const label = result.status === 'pass'
    ? paint.pass('PASS')
    : result.status === 'timeout'
      ? paint.warn('TIME')
      : result.status === 'skipped'
        ? paint.info('SKIP')
        : paint.fail('FAIL');
  lines.push(`${label}  ${paint.bold(result.label)} ${paint.dim(result.display)} ${paint.dim(`${result.durationMs} ms`)}`);
  if (result.classification) {
    lines.push(`      ${result.classification.title}${result.classification.recommendation ? `: ${result.classification.recommendation}` : ''}`);
  }
}

export function renderDoctorTerminal(report, options = {}) {
  const useColor = options.color !== false && Boolean(process.stdout.isTTY);
  const paint = painter(useColor);
  const lines = [];
  const adapters = report.project.adapters.map((adapter) => adapter.id).join(', ') || 'none';

  lines.push('');
  lines.push(paint.bold(`SetupLens Doctor ${report.tool.version}`));
  lines.push(paint.dim('Diagnose unfamiliar repositories with adapters, static evidence, and optional probes.'));
  lines.push('');
  lines.push(`Target   ${paint.bold(report.target.name)}  ${paint.dim(`(${report.target.filesIndexed} files, ${report.durationMs} ms)`)}`);
  lines.push(`Stack    ${report.project.primaryStacks?.length > 0 ? report.project.primaryStacks.join(', ') : 'unknown'}`);
  lines.push(`Adapters ${adapters}`);
  lines.push(`Verdict  ${statusLabel(report.status, paint)}  ${paint.dim(report.summary)}`);
  lines.push('');

  const panel = report.diagnosis.actionPanel;
  if (panel) {
    lines.push(paint.bold('Action panel'));
    lines.push(`  Readiness ${paint.bold(panel.readiness.score === null ? 'n/a' : `${panel.readiness.score}/100`)} ${paint.dim(`[${panel.readiness.verdict}]`)}`);
    lines.push(`  Diagnosis ${paint.bold(`${panel.confidence.level} confidence (${panel.confidence.score}/100)`)}`);
    if (panel.topRootCause) lines.push(`  Top cause  ${paint.bold(panel.topRootCause.title)} ${paint.dim(`[${panel.topRootCause.source}]`)}`);
    if (panel.nextCommand) lines.push(`  Next cmd   ${paint.bold(panel.nextCommand.command)}${paint.dim(panel.nextCommand.cwd && panel.nextCommand.cwd !== '.' ? ` in ${panel.nextCommand.cwd}` : '')}`);
    if (panel.safeFixes.length > 0) lines.push(`  Safe fixes ${panel.safeFixes.length}`);
    if (panel.manualFixes.length > 0) lines.push(`  Manual     ${panel.manualFixes.length}`);
    if (panel.unknowns.length > 0) lines.push(`  Unknowns   ${panel.unknowns.length}`);
    lines.push('');
  }

  if (report.diagnosis.rootCauses.length > 0) {
    lines.push(paint.bold('Likely root causes'));
    for (const cause of report.diagnosis.rootCauses.slice(0, 8)) {
      lines.push(`${severityLabel(cause.severity, paint)}  #${cause.rank ?? '?'} ${paint.bold(cause.title)} ${paint.dim(`[${cause.source}]`)}`);
      if (cause.evidence) lines.push(paint.dim(`      Evidence: ${cause.evidence}`));
      if (cause.recommendation) lines.push(`      Fix: ${cause.recommendation}`);
    }
    lines.push('');
  }

  if (report.diagnosis.nextActions.length > 0) {
    lines.push(paint.bold('Next actions'));
    report.diagnosis.nextActions.slice(0, 8).forEach((action, index) => renderAction(action, index, lines, paint));
    lines.push('');
  }

  const showFixPlan = options.showFixPlan === true || report.diagnosis.fixPlan?.applied?.length > 0;
  if (showFixPlan && report.diagnosis.fixPlan?.fixes?.length > 0) {
    lines.push(paint.bold('Fix plan'));
    const safe = report.diagnosis.fixPlan.fixes.filter((fix) => fix.canApply);
    const manual = report.diagnosis.fixPlan.fixes.filter((fix) => !fix.canApply);
    for (const fix of safe.slice(0, 6)) {
      lines.push(`  ${paint.pass('SAFE')}  ${paint.bold(fix.title)} ${paint.dim(`[${fix.source}]`)}`);
      lines.push(`        ${fix.description}`);
      if (fix.explanation) lines.push(paint.dim(`        Why safe: ${fix.explanation}`));
    }
    for (const fix of manual.slice(0, 4)) {
      lines.push(`  ${paint.warn('MANUAL')} ${paint.bold(fix.title)} ${paint.dim(`[${fix.source}]`)}`);
      lines.push(`        ${fix.description}`);
      if (fix.explanation) lines.push(paint.dim(`        Why manual: ${fix.explanation}`));
    }
    if (report.diagnosis.fixPlan.applied?.length > 0) {
      lines.push(paint.bold('Applied safe fixes'));
      for (const item of report.diagnosis.fixPlan.applied) {
        lines.push(`  ${item.status.toUpperCase()}  ${item.title}: ${item.message}`);
      }
    } else if (safe.length > 0) {
      lines.push(paint.dim('  Use --apply safe to apply only whitelisted local fixes.'));
    }
    lines.push('');
  }

  if (!report.probes.enabled) {
    lines.push(paint.bold('Probes'));
    lines.push(`  Planned ${report.probes.planned.length} probe${report.probes.planned.length === 1 ? '' : 's'}. Run ${paint.bold('setuplens doctor . --probe')} to execute them.`);
  } else {
    lines.push(paint.bold('Probe results'));
    if (report.probes.results.length === 0) lines.push('  No probes were available for this project.');
    for (const result of report.probes.results) renderProbe(result, lines, paint);
  }

  if (report.diagnosis.unknowns?.length > 0) {
    lines.push('');
    lines.push(paint.bold('Unknowns'));
    for (const item of report.diagnosis.unknowns.slice(0, 4)) lines.push(`  ${item}`);
  }

  lines.push('');
  return lines.join('\n');
}
