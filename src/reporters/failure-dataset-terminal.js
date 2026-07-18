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

function countLines(label, items, lines, paint) {
  lines.push(paint.bold(label));
  if (!items || items.length === 0) {
    lines.push('  none');
    return;
  }
  for (const item of items.slice(0, 10)) lines.push(`  ${item.name}: ${item.count}`);
  if (items.length > 10) lines.push(`  ... ${items.length - 10} more`);
}

function renderMetric(item) {
  if (!item) return null;
  if ('numerator' in item && 'denominator' in item) {
    const value = item.value === null ? 'n/a' : `${item.value}%`;
    return `  ${item.label}: ${value} (${item.numerator}/${item.denominator}, ${item.mode})`;
  }
  return `  ${item.label}: ${item.value} ${item.unit ?? ''}`.trimEnd();
}

function renderDelta(item) {
  if (!item || item.delta === null) return null;
  const marker = item.trend === 'improved' ? '+' : item.trend === 'regressed' ? '!' : '=';
  const delta = item.delta > 0 ? `+${item.delta}` : String(item.delta);
  return `  ${marker} ${item.label}: ${item.previous} -> ${item.current} (${delta})`;
}

function renderCollection(report, paint) {
  const lines = [];
  lines.push('');
  lines.push(paint.bold(`SetupLens Failure Dataset ${report.tool.version}`));
  lines.push(paint.dim('Evidence-backed public repository intake for corpus growth.'));
  lines.push('');
  lines.push(`Sources  ${paint.bold(report.summary.sources)} ${paint.dim(`(${report.durationMs} ms)`)}`);
  lines.push(`Mode     ${report.options.scan ? 'clone + doctor scan' : report.options.clone ? 'clone only' : 'metadata only'}`);
  lines.push(`Safety   ${report.policy.scanSafety}`);
  lines.push('');
  countLines('Source ecosystems', report.summary.sourceEcosystems, lines, paint);
  lines.push('');
  if (report.summary.cloneStatuses.length > 0) {
    countLines('Clone statuses', report.summary.cloneStatuses, lines, paint);
    lines.push('');
  }
  if (report.summary.cloneFailureTypes?.length > 0) {
    countLines('Clone failure types', report.summary.cloneFailureTypes, lines, paint);
    lines.push('');
  }
  if (report.summary.scanStatuses.length > 0) {
    countLines('Scan statuses', report.summary.scanStatuses, lines, paint);
    lines.push('');
  }
  if (report.summary.failureTypeDistribution.length > 0) {
    countLines('Failure types', report.summary.failureTypeDistribution, lines, paint);
    lines.push('');
  }
  if (report.errors.length > 0) {
    lines.push(paint.bold('Discovery errors'));
    for (const error of report.errors.slice(0, 6)) lines.push(`  ${error.ecosystem}: ${error.message}`);
    lines.push('');
  }
  lines.push(paint.dim('Next: setuplens failure-dataset review --input <manifest>'));
  return lines.join('\n');
}

function renderReview(report, paint) {
  const lines = [];
  lines.push('');
  lines.push(paint.bold(`SetupLens Failure Dataset Review ${report.tool.version}`));
  lines.push(paint.dim('Audit feedback for classifiers, safe fixes, and corpus promotion.'));
  lines.push('');
  lines.push(`Sources    ${paint.bold(report.summary.sources)}`);
  lines.push(`Scanned    ${paint.bold(report.summary.scanned)}`);
  lines.push(`Candidates ${paint.bold(report.summary.corpusCandidates)}`);
  lines.push(`Safe fixes ${paint.bold(report.summary.safeFixes)} ${paint.dim(`manual ${report.summary.manualFixes}`)}`);
  lines.push(`Gaps       ${report.ruleGaps.length} ${paint.dim(`unclassified logs ${report.summary.unclassifiedLogs}`)}`);
  lines.push('');
  if (report.scorecard) {
    lines.push(paint.bold('Scorecard'));
    lines.push(`  Overall: ${report.scorecard.overallScore ?? 'n/a'} ${paint.dim(report.scorecard.grade)}`);
    lines.push(`  Mode: ${report.scorecard.mode} ${paint.dim(`labeled cases ${report.scorecard.labeledCases}`)}`);
    for (const item of [
      report.scorecard.metrics.diagnosticHitRate,
      report.scorecard.metrics.rootCauseFirstRate,
      report.scorecard.metrics.safeFixGenerationRate,
      report.scorecard.metrics.falseBlockerRate,
      report.scorecard.metrics.falseBlockerRiskRate,
      report.scorecard.metrics.ecosystemCoverageCount
    ]) {
      const rendered = renderMetric(item);
      if (rendered) lines.push(rendered);
    }
    for (const note of report.scorecard.notes.slice(0, 2)) lines.push(paint.dim(`  note: ${note}`));
    lines.push('');
  }
  if (report.scorecardHistory) {
    lines.push(paint.bold('History'));
    lines.push(`  Snapshots: ${report.scorecardHistory.snapshotCount}`);
    lines.push(`  File: ${report.scorecardHistory.path}`);
    if (report.scorecardHistory.comparison) {
      const comparison = report.scorecardHistory.comparison;
      lines.push(`  Rollup: ${comparison.rollup.improved} improved, ${comparison.rollup.regressed} regressed, ${comparison.rollup.unchanged} unchanged`);
      for (const item of [
        comparison.metrics.diagnosticHitRate,
        comparison.metrics.safeFixGenerationRate,
        comparison.metrics.falseBlockerRiskRate,
        comparison.summary.manualFixes,
        comparison.summary.unclassifiedLogs,
        comparison.summary.ruleGaps
      ]) {
        const rendered = renderDelta(item);
        if (rendered) lines.push(rendered);
      }
    } else {
      lines.push(paint.dim('  First snapshot saved; run review again after the next scan to compare trends.'));
    }
    lines.push('');
  }
  countLines('Statuses', report.summary.statuses, lines, paint);
  lines.push('');
  countLines('Ecosystem coverage', report.summary.ecosystemCoverage, lines, paint);
  lines.push('');
  countLines('Failure types', report.summary.failureTypeDistribution, lines, paint);
  lines.push('');
  if (report.promotionCandidates.length > 0) {
    lines.push(paint.bold('Corpus promotion queue'));
    for (const item of report.promotionCandidates.slice(0, 8)) {
      const cause = item.scan.topRootCause?.type ? ` - ${item.scan.topRootCause.type}` : '';
      lines.push(`  ${item.scan.status.toUpperCase()} ${item.source.fullName}${paint.dim(cause)}`);
    }
    lines.push('');
  }
  if (report.ruleGaps.length > 0) {
    lines.push(paint.bold('Rule gaps'));
    for (const gap of report.ruleGaps.slice(0, 8)) {
      lines.push(`  ${gap.type}: ${gap.project}`);
      if (gap.evidence) lines.push(paint.dim(`    ${gap.evidence}`));
    }
    lines.push('');
  }
  return lines.join('\n');
}

function renderPromotion(report, paint) {
  const lines = [];
  lines.push('');
  lines.push(paint.bold(`SetupLens Failure Dataset Promotion ${report.tool.version}`));
  lines.push(paint.dim('Reviewable corpus draft queue from public scan evidence.'));
  lines.push('');
  lines.push(`Sources       ${paint.bold(report.summary.sources)}`);
  lines.push(`Eligible      ${paint.bold(report.summary.eligible)}`);
  lines.push(`Drafted       ${paint.bold(report.summary.drafted)} ${paint.dim(`high priority ${report.summary.highPriority}`)}`);
  lines.push(`Rejected      ${report.summary.rejected}`);
  lines.push('');
  if (report.drafts.length > 0) {
    lines.push(paint.bold('Draft queue'));
    for (const draft of report.drafts.slice(0, 8)) {
      const cause = draft.evidence.topRootCause?.type ? ` - ${draft.evidence.topRootCause.type}` : '';
      const missing = draft.missingEvidence.length > 0 ? paint.dim(` missing: ${draft.missingEvidence.join(', ')}`) : '';
      lines.push(`  ${draft.priority.toUpperCase()} ${draft.project}${paint.dim(cause)}${missing}`);
    }
    lines.push('');
  }
  if (report.rejections.length > 0) {
    lines.push(paint.bold('Not promoted'));
    for (const item of report.rejections.slice(0, 6)) lines.push(`  ${item.project}: ${item.reason}`);
    if (report.rejections.length > 6) lines.push(`  ... ${report.rejections.length - 6} more`);
    lines.push('');
  }
  lines.push(paint.bold('Next actions'));
  for (const action of report.nextActions) lines.push(`  - ${action}`);
  return lines.join('\n');
}

function renderClean(report, paint) {
  const lines = [];
  lines.push('');
  lines.push(paint.bold(`SetupLens Failure Dataset Clean ${report.tool.version}`));
  lines.push(paint.dim('Local dataset cache cleanup.'));
  lines.push('');
  lines.push(`Repos removed   ${paint.bold(String(report.summary.reposRemoved))}`);
  lines.push(`Repo entries    ${report.summary.reposFiles} files, ${report.summary.reposDirectories} directories`);
  lines.push(`Reports removed ${paint.bold(String(report.summary.reportsRemoved))}`);
  if (!report.summary.includeReports) lines.push(paint.dim('Reports retained. Use --include-reports to remove per-repository reports too.'));
  lines.push('');
  lines.push(`Repos dir       ${report.summary.reposDir}`);
  if (report.summary.includeReports) lines.push(`Reports dir     ${report.summary.reportsDir}`);
  return lines.join('\n');
}

export function renderFailureDatasetTerminal(report, options = {}) {
  const useColor = options.color !== false && Boolean(process.stdout.isTTY);
  const paint = painter(useColor);
  if (report.schemaVersion === '1.0-failure-dataset-review') return renderReview(report, paint);
  if (report.schemaVersion === '1.0-failure-dataset-promotion') return renderPromotion(report, paint);
  if (report.schemaVersion === '1.0-failure-dataset-clean') return renderClean(report, paint);
  return renderCollection(report, paint);
}
