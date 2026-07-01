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
  if (status === 'blocked') return paint.fail('BLOCKED');
  if (status === 'needs_setup') return paint.warn('NEEDS SETUP');
  if (status === 'ready') return paint.pass('READY');
  if (status === 'needs_probe') return paint.info('NEEDS PROBE');
  return paint.warn(String(status).toUpperCase());
}

function counts(label, items, lines, paint) {
  lines.push(paint.bold(label));
  if (items.length === 0) {
    lines.push('  none');
    return;
  }
  for (const item of items.slice(0, 10)) lines.push(`  ${item.name}: ${item.count}`);
}

export function renderDoctorSuiteTerminal(report, options = {}) {
  const useColor = options.color !== false && Boolean(process.stdout.isTTY);
  const paint = painter(useColor);
  const lines = [];

  lines.push('');
  lines.push(paint.bold(`SetupLens Doctor Suite ${report.tool.version}`));
  lines.push(paint.dim('Batch diagnosis for real-project validation and corpus growth.'));
  lines.push('');
  lines.push(`Target   ${paint.bold(report.target.name)} ${paint.dim(`(${report.summary.total} repositories, ${report.durationMs} ms)`)}`);
  lines.push(`Probe    ${report.options.probe ? report.options.probeStartup ? 'verify + startup' : 'safe verify only' : 'off'}`);
  lines.push('');

  counts('Statuses', report.summary.statusCounts, lines, paint);
  lines.push('');
  counts('Ecosystem coverage', report.summary.ecosystemCoverage, lines, paint);
  lines.push('');
  counts('Failure types', report.summary.failureTypeDistribution, lines, paint);
  lines.push('');

  if (report.results.length > 0) {
    lines.push(paint.bold('Projects'));
    for (const result of report.results.slice(0, 12)) {
      const cause = result.topRootCause ? ` - ${result.topRootCause.type}` : '';
      lines.push(`  ${statusLabel(result.status, paint)} ${paint.bold(result.name)}${paint.dim(cause)}`);
    }
    lines.push('');
  }

  if (report.summary.unclassifiedLogs.length > 0) {
    lines.push(paint.bold('Unclassified logs'));
    for (const item of report.summary.unclassifiedLogs.slice(0, 6)) {
      lines.push(`  ${item.target}: ${item.id}`);
      if (item.evidence) lines.push(paint.dim(`    ${item.evidence}`));
    }
    lines.push('');
  }

  if (report.errors.length > 0) {
    lines.push(paint.bold('Errors'));
    for (const error of report.errors.slice(0, 6)) lines.push(`  ${error.target}: ${error.message}`);
    lines.push('');
  }

  return lines.join('\n');
}
