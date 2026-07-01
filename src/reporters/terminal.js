import { STATUS_LABELS } from '../constants.js';

const ANSI = Object.freeze({
  reset: '\u001b[0m', bold: '\u001b[1m', dim: '\u001b[2m',
  red: '\u001b[31m', green: '\u001b[32m', yellow: '\u001b[33m', cyan: '\u001b[36m', white: '\u001b[37m'
});

function painter(enabled) {
  const color = (name, value) => enabled ? `${ANSI[name]}${value}${ANSI.reset}` : value;
  return {
    bold: (value) => color('bold', value), dim: (value) => color('dim', value),
    fail: (value) => color('red', value), warn: (value) => color('yellow', value),
    pass: (value) => color('green', value), info: (value) => color('cyan', value)
  };
}

function scoreBar(score, width = 24) {
  const filled = Math.round((score / 100) * width);
  return `[${'#'.repeat(filled)}${'.'.repeat(width - filled)}]`;
}

function summaryText(group, paint) {
  const warningLabel = group.summary.warn === 1 ? 'warning' : 'warnings';
  return `${paint.fail(`${group.summary.fail} failed`)}  ${paint.warn(`${group.summary.warn} ${warningLabel}`)}  ${paint.pass(`${group.summary.pass} passed`)}`;
}

function statusLabel(status, paint) {
  const labels = {
    blocked: paint.fail('BLOCKED'),
    needs_setup: paint.warn('NEEDS SETUP'),
    ready: paint.pass('READY'),
    unsupported: paint.warn('UNSUPPORTED')
  };
  return labels[status] ?? status;
}

function renderFinding(lines, item, paint) {
  const label = paint[item.status](STATUS_LABELS[item.status].padEnd(4));
  lines.push(`${label}  ${paint.bold(item.title)} ${paint.dim(`[${item.scope ?? 'setup'} / ${item.category}]`)}`);
  lines.push(`      ${item.message}`);
  if (item.evidence) lines.push(paint.dim(`      Evidence: ${item.evidence}`));
  if (item.recommendation) lines.push(`      Fix: ${item.recommendation}`);
}

function renderStartupFinding(lines, item, paint) {
  const label = paint[item.status](STATUS_LABELS[item.status].padEnd(4));
  lines.push(`${label}  ${paint.bold(item.title)} ${paint.dim(`[${item.category}]`)}`);
  lines.push(`      ${item.message}`);
  if (item.evidence) lines.push(paint.dim(`      Evidence: ${item.evidence}`));
  if (item.recommendation) lines.push(`      Fix: ${item.recommendation}`);
}

function commandRows(title, steps, lines, paint) {
  if (steps.length === 0) return;
  lines.push(paint.bold(title));
  steps.forEach((step, index) => {
    lines.push(`  ${index + 1}. ${paint.bold(step.command)} ${paint.dim(`(${step.reason})`)}`);
  });
}

export function renderTerminal(report, options = {}) {
  const useColor = options.color !== false && Boolean(process.stdout.isTTY);
  const showAll = options.showAll === true;
  const paint = painter(useColor);
  const lines = [];
  const scoreColor = report.scorable && report.score >= 80 ? 'pass' : report.scorable && report.score >= 60 ? 'warn' : 'fail';

  lines.push('');
  lines.push(paint.bold(`SetupLens ${report.tool.version}`));
  lines.push(paint.dim('Repository setup readiness scan. Use "setuplens doctor" for deeper diagnosis and probes.'));
  lines.push('');
  lines.push(`Target  ${paint.bold(report.target.name)}  ${paint.dim(`(${report.target.filesIndexed} files, ${report.durationMs} ms)`)}`);
  const supportingStacks = report.stackEvidence
    ?.filter((item) => item.role === 'supporting')
    .map((item) => item.name) ?? [];
  const primaryLabel = report.primaryStacks?.length > 0 ? report.primaryStacks.join(', ') : 'unknown';
  const supportingLabel = supportingStacks.length > 0 ? `  (supporting: ${supportingStacks.join(', ')})` : '';
  lines.push(`Stack   ${primaryLabel}${supportingLabel}`);
  lines.push(`Verdict ${statusLabel(report.startup.status, paint)}  ${paint.dim(report.startup.summary)}`);
  if (report.scorable) {
    lines.push(`Score   ${paint[scoreColor](`${report.score}/100 ${report.grade}`)}  ${scoreBar(report.score)}  ${paint.dim('(setup readiness)')}`);
  } else {
    const label = report.notScoredReason === 'unsupported_primary_stack' ? 'Unsupported / Not scored' : 'Not scored';
    lines.push(`Score   ${paint.warn(label)}  ${paint.dim(`(${report.scoreMessage})`)}`);
  }
  lines.push(`Setup   ${summaryText(report.scopes.setup, paint)}`);
  lines.push(`Hygiene ${summaryText(report.scopes.hygiene, paint)}`);
  lines.push('');

  commandRows('Prepare', report.startup.setupCommands, lines, paint);
  if (report.startup.setupCommands.length > 0 && report.startup.runCommands.length > 0) lines.push('');
  commandRows('Run', report.startup.runCommands, lines, paint);

  const noteFailures = report.startup.notes.filter((note) => note.level === 'fail');
  if (report.startup.blockers.length > 0 || noteFailures.length > 0) {
    lines.push('');
    lines.push(paint.bold('Startup blockers'));
    for (const item of report.startup.blockers) renderStartupFinding(lines, item, paint);
    for (const note of noteFailures) {
      lines.push(`${paint.fail('FAIL')}  ${paint.bold(note.title)} ${paint.dim('[Startup]')}`);
      lines.push(`      ${note.message}`);
      if (note.recommendation) lines.push(`      Fix: ${note.recommendation}`);
    }
  }

  if (report.startup.risks.length > 0) {
    lines.push('');
    lines.push(paint.bold('Safety risks'));
    for (const item of report.startup.risks.slice(0, 4)) renderStartupFinding(lines, item, paint);
  }

  const softNotes = report.startup.notes.filter((note) => note.level !== 'fail');
  if (report.startup.warnings.length > 0 || softNotes.length > 0) {
    lines.push('');
    lines.push(paint.bold('Setup warnings'));
    for (const item of report.startup.warnings.slice(0, 4)) renderStartupFinding(lines, item, paint);
    for (const note of softNotes.slice(0, 3)) {
      lines.push(`${paint.warn('WARN')}  ${paint.bold(note.title)} ${paint.dim('[Startup]')}`);
      lines.push(`      ${note.message}`);
      if (note.recommendation) lines.push(`      Fix: ${note.recommendation}`);
    }
  }

  if (showAll) {
    lines.push('');
    lines.push(paint.bold('All findings'));
    for (const item of report.findings) renderFinding(lines, item, paint);
  } else {
    const hiddenPasses = report.findings.filter((item) => item.status === 'pass').length;
    const hiddenHygiene = report.findings.filter((item) => item.scope === 'hygiene' && item.status !== 'pass').length;
    const hiddenInfo = report.findings.filter((item) => item.status === 'info').length;
    if (hiddenPasses > 0 || hiddenHygiene > 0 || hiddenInfo > 0) {
      lines.push('');
      lines.push(paint.dim(`Hidden: ${hiddenPasses} passed checks, ${hiddenHygiene} hygiene findings, ${hiddenInfo} info items. Use --show-all for the full audit list.`));
    }
  }

  lines.push('');
  return lines.join('\n');
}
