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

function recommendedActions(report, limit) {
  return report.findings
    .filter((item) => item.recommendation && ['fail', 'warn'].includes(item.status))
    .sort((left, right) => Number(left.scope === 'hygiene') - Number(right.scope === 'hygiene'))
    .slice(0, limit);
}

export function renderTerminal(report, options = {}) {
  const useColor = options.color !== false && Boolean(process.stdout.isTTY);
  const paint = painter(useColor);
  const lines = [];
  const scoreColor = report.score >= 80 ? 'pass' : report.score >= 60 ? 'warn' : 'fail';

  lines.push('');
  lines.push(paint.bold(`SetupLens ${report.tool.version}`));
  lines.push(paint.dim('Know why a repository will not run, in one command and under 30 seconds.'));
  lines.push('');
  lines.push(`Target  ${paint.bold(report.target.name)}  ${paint.dim(`(${report.target.filesIndexed} files, ${report.durationMs} ms)`)}`);
  lines.push(`Stack   ${report.stacks.length > 0 ? report.stacks.join(', ') : 'unknown'}`);
  lines.push(`Score   ${paint[scoreColor](`${report.score}/100 ${report.grade}`)}  ${scoreBar(report.score)}  ${paint.dim('(setup readiness)')}`);
  lines.push(`Setup   ${summaryText(report.scopes.setup, paint)}`);
  lines.push(`Hygiene ${summaryText(report.scopes.hygiene, paint)}`);
  lines.push('');

  for (const item of report.findings) {
    const label = paint[item.status](STATUS_LABELS[item.status].padEnd(4));
    lines.push(`${label}  ${paint.bold(item.title)} ${paint.dim(`[${item.scope} / ${item.category}]`)}`);
    lines.push(`      ${item.message}`);
    if (item.evidence) lines.push(paint.dim(`      Evidence: ${item.evidence}`));
  }

  const actions = recommendedActions(report, 5);
  if (actions.length > 0) {
    lines.push('');
    lines.push(paint.bold('Next actions'));
    actions.forEach((item, index) => lines.push(`  ${index + 1}. ${item.recommendation}`));
  }

  lines.push('');
  return lines.join('\n');
}
