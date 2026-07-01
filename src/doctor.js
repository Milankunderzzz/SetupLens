import fs from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { VERSION } from './constants.js';
import { detectStacks } from './checks/stacks.js';
import { indexRepository } from './lib/files.js';
import { scan } from './scan.js';
import { runAdapters } from './doctor/adapters/index.js';
import { applySafeFixes, buildFixPlan } from './doctor/fix-plan.js';
import { runProbes } from './doctor/probes.js';

function uniqueBy(items, key) {
  const seen = new Set();
  const output = [];
  for (const item of items) {
    const value = key(item);
    if (seen.has(value)) continue;
    seen.add(value);
    output.push(item);
  }
  return output;
}

function findingCause(item) {
  return {
    source: 'scan',
    type: item.id,
    severity: item.status === 'fail' ? 'fail' : 'warn',
    title: item.title,
    evidence: item.evidence ?? item.message,
    recommendation: item.recommendation,
    confidence: item.status === 'fail' ? 'high' : 'medium'
  };
}

function issueCause(adapter, issue) {
  return {
    source: adapter.id,
    type: issue.type,
    severity: issue.severity,
    title: issue.title,
    evidence: issue.evidence,
    recommendation: issue.recommendation,
    confidence: adapter.confidence
  };
}

function probeCause(result) {
  if (!result.classification || result.classification.severity === 'info') return null;
  return {
    source: result.adapter,
    type: result.classification.type,
    severity: result.classification.severity,
    title: result.classification.title,
    evidence: result.classification.evidence || `${result.label}: ${result.display}`,
    recommendation: result.classification.recommendation,
    confidence: result.status === 'fail' ? 'high' : 'medium',
    subject: result.classification.subject ?? null,
    probe: result.id
  };
}

function actionFromCause(cause) {
  if (!cause.recommendation) return null;
  return {
    type: 'fix',
    command: null,
    description: cause.recommendation,
    reason: cause.title,
    confidence: cause.confidence
  };
}

function normalizeAction(action) {
  return {
    type: action.type,
    command: action.command,
    cwd: action.cwd ?? '.',
    description: action.description ?? null,
    reason: action.reason,
    confidence: action.confidence ?? 'medium'
  };
}

function quoteCommandPath(value) {
  const text = String(value);
  if (!/[\s"]/u.test(text)) return text;
  return `"${text.replaceAll('"', '\\"')}"`;
}

function buildStatus({ scanReport, rootCauses, probesEnabled, probes, adapters }) {
  if (!scanReport.scorable && adapters.length === 0) return 'unsupported';
  if (rootCauses.some((item) => item.severity === 'fail')) return 'blocked';
  if (rootCauses.some((item) => item.severity === 'warn')) return 'needs_setup';
  if (!probesEnabled) return 'needs_probe';
  if (probes.some((item) => item.status === 'timeout')) return 'needs_probe';
  return 'ready';
}

function statusSummary(status, rootCauses, probesEnabled) {
  if (status === 'unsupported') return 'The primary stack is outside the active SetupLens adapters, so diagnosis is partial.';
  if (status === 'blocked') {
    const count = rootCauses.filter((item) => item.severity === 'fail').length;
    return `${count} likely blocker${count === 1 ? '' : 's'} found across static checks and command probes.`;
  }
  if (status === 'needs_setup') return 'No hard startup blocker was confirmed, but setup gaps should be fixed before running the project.';
  if (status === 'needs_probe' && !probesEnabled) return 'Static diagnosis completed. Run with --probe to execute safe checks and classify real command failures.';
  if (status === 'needs_probe') return 'Probe output needs manual review before declaring the project runnable.';
  return 'No setup blocker was found by static analysis or enabled probes.';
}

function summarizeAdapters(adapters) {
  return adapters.map((adapter) => ({
    id: adapter.id,
    title: adapter.title,
    confidence: adapter.confidence,
    explanation: explainAdapter(adapter),
    signals: adapter.signals
  }));
}

function confidenceWeight(value) {
  if (value === 'high') return 3;
  if (value === 'medium') return 2;
  return 1;
}

function severityWeight(value) {
  if (value === 'fail') return 3;
  if (value === 'warn') return 2;
  return 1;
}

function rankRootCauses(causes) {
  return [...causes]
    .sort((left, right) => severityWeight(right.severity) - severityWeight(left.severity)
      || confidenceWeight(right.confidence) - confidenceWeight(left.confidence)
      || (left.probe ? -1 : 0) - (right.probe ? -1 : 0))
    .map((cause, index) => ({
      ...cause,
      rank: index + 1,
      explanation: explainCause(cause)
    }));
}

function signalSummary(signals) {
  if (!signals) return [];
  const values = [];
  if (Array.isArray(signals.frameworks) && signals.frameworks.length > 0) values.push(`frameworks: ${signals.frameworks.join(', ')}`);
  if (Array.isArray(signals.projects) && signals.projects.length > 0) values.push(`${signals.projects.length} project file(s)`);
  if (Array.isArray(signals.packages) && signals.packages.length > 0) values.push(`${signals.packages.length} package manifest(s)`);
  if (Array.isArray(signals.composeFiles) && signals.composeFiles.length > 0) values.push(`Compose files: ${signals.composeFiles.join(', ')}`);
  if (Array.isArray(signals.schemaFiles) && signals.schemaFiles.length > 0) values.push(`Prisma schemas: ${signals.schemaFiles.map((item) => item.path).join(', ')}`);
  if (Array.isArray(signals.commandDirs) && signals.commandDirs.length > 0) values.push(`Go command dirs: ${signals.commandDirs.join(', ')}`);
  if (Array.isArray(signals.binTargets) && signals.binTargets.length > 0) values.push(`Rust bin targets: ${signals.binTargets.join(', ')}`);
  if (Array.isArray(signals.tools) && signals.tools.length > 0) values.push(`workspace tools: ${signals.tools.join(', ')}`);
  return values.slice(0, 4);
}

function explainAdapter(adapter) {
  const evidence = signalSummary(adapter.signals);
  return {
    question: `Why SetupLens thinks this is ${adapter.title}`,
    answer: evidence.length > 0
      ? `${adapter.confidence} confidence from ${evidence.join('; ')}.`
      : `${adapter.confidence} confidence from adapter-specific manifest or file evidence.`
  };
}

function explainCause(cause) {
  const severity = cause.severity === 'fail' ? 'blocker' : 'setup warning';
  const evidence = cause.evidence ? ` Evidence: ${cause.evidence}` : '';
  return `${cause.title} is ranked as a ${severity} from ${cause.source} evidence.${evidence}`;
}

function explainFix(fix) {
  if (fix.canApply) return fix.reason ?? 'This safe fix only creates or appends local files and refuses overwrites.';
  return fix.reason ?? 'This repair needs user review because it can affect project behavior or external state.';
}

function buildConfidence({ adapters, rootCauses, probesEnabled, probes }) {
  const highAdapters = adapters.filter((adapter) => adapter.confidence === 'high').length;
  const highCauses = rootCauses.filter((cause) => cause.confidence === 'high').length;
  const unclassified = probes.filter((probe) => probe.classification?.type === 'unclassified_command_failure').length;
  let score = 45 + highAdapters * 8 + highCauses * 10 + (probesEnabled ? 8 : 0) - unclassified * 12;
  if (rootCauses.length === 0) score -= 8;
  score = Math.max(0, Math.min(100, score));
  const level = score >= 80 ? 'high' : score >= 55 ? 'medium' : 'low';
  return {
    level,
    score,
    reasons: [
      `${adapters.length} adapter${adapters.length === 1 ? '' : 's'} matched (${highAdapters} high-confidence).`,
      `${rootCauses.length} root cause${rootCauses.length === 1 ? '' : 's'} ranked (${highCauses} high-confidence).`,
      probesEnabled ? `${probes.length} probe result${probes.length === 1 ? '' : 's'} included.` : 'Command probes were not executed.',
      unclassified > 0 ? `${unclassified} probe failure${unclassified === 1 ? '' : 's'} remained unclassified.` : 'No unclassified probe failures were observed.'
    ]
  };
}

function buildReadiness({ status, rootCauses, probesEnabled, probes }) {
  const failures = rootCauses.filter((cause) => cause.severity === 'fail').length;
  const warnings = rootCauses.filter((cause) => cause.severity === 'warn').length;
  const failedProbes = probes.filter((probe) => probe.status === 'fail').length;
  let score = 0;
  if (status === 'ready') score = 100;
  else if (status === 'needs_probe') score = probesEnabled ? 62 : 55;
  else if (status === 'needs_setup') score = Math.max(35, 70 - warnings * 8);
  else if (status === 'blocked') score = Math.max(0, 30 - failures * 7 - failedProbes * 3);
  else score = null;
  const level = score === null ? 'unknown' : score >= 80 ? 'ready' : score >= 55 ? 'probe_needed' : score >= 30 ? 'needs_setup' : 'blocked';
  return {
    verdict: status,
    score,
    level,
    summary: score === null
      ? 'Readiness cannot be scored because the project is outside active adapters.'
      : `${failures} blocker${failures === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'}, and ${failedProbes} failed probe${failedProbes === 1 ? '' : 's'} were considered.`
  };
}

function buildUnknowns({ probesEnabled, probes, rootCauses }) {
  const unknowns = [];
  if (!probesEnabled) unknowns.push('Command probes were not run, so static diagnosis may miss machine-specific failures.');
  if (probes.some((probe) => probe.kind === 'startup' && probe.status === 'skipped')) {
    unknowns.push('Startup probes were skipped by the safe probe policy; long-running service readiness was not verified.');
  }
  if (probes.some((probe) => probe.classification?.type === 'unclassified_command_failure')) {
    unknowns.push('At least one command failed with an unclassified log pattern; add it to the failure corpus if it is reproducible.');
  }
  if (rootCauses.length === 0) unknowns.push('No root cause was found; run probes or add a corpus case if the project still fails.');
  return [...new Set(unknowns)];
}

function selectNextCommand({ root, adapterActions, fixPlan }) {
  const safeFixes = fixPlan.fixes.filter((fix) => fix.canApply);
  if (safeFixes.length > 0) {
    return {
      type: 'safe_fix',
      command: `setuplens doctor ${quoteCommandPath(root)} --apply safe`,
      cwd: '.',
      description: `Apply ${safeFixes.length} whitelisted safe fix${safeFixes.length === 1 ? '' : 'es'} before retrying probes.`,
      reason: 'Whitelisted safe fixes are available.',
      confidence: 'high'
    };
  }

  const commandActions = adapterActions.filter((action) => action.command);
  return commandActions.find((action) => action.type === 'install')
    ?? commandActions.find((action) => action.type === 'setup')
    ?? commandActions.find((action) => action.type === 'verify')
    ?? commandActions.find((action) => action.type === 'run')
    ?? commandActions[0]
    ?? null;
}

function buildActionPanel({ rootCauses, nextActions, nextCommand, fixPlan, probes, unknowns, confidence, readiness }) {
  const safeFixes = fixPlan.fixes.filter((fix) => fix.canApply).map((fix) => ({ ...fix, explanation: explainFix(fix) }));
  const manualFixes = fixPlan.fixes.filter((fix) => !fix.canApply).map((fix) => ({ ...fix, explanation: explainFix(fix) }));
  return {
    confidence,
    readiness,
    topRootCause: rootCauses[0] ?? null,
    rootCauses: rootCauses.slice(0, 5),
    nextCommand,
    nextActions: nextActions.slice(0, 5),
    safeFixes: safeFixes.slice(0, 6),
    manualFixes: manualFixes.slice(0, 6),
    probeTrace: {
      total: probes.length,
      passed: probes.filter((probe) => probe.status === 'pass').length,
      failed: probes.filter((probe) => probe.status === 'fail').length,
      skipped: probes.filter((probe) => probe.status === 'skipped').length,
      readyDetected: probes.filter((probe) => probe.trace?.readyDetected).length,
      results: probes.map((probe) => ({
        id: probe.id,
        kind: probe.kind,
        status: probe.status,
        rawStatus: probe.rawStatus,
        classification: probe.classification?.type ?? null,
        trace: probe.trace
      }))
    },
    unknowns
  };
}

export async function doctor(target = '.', options = {}) {
  const started = performance.now();
  const root = path.resolve(target);
  const stat = await fs.stat(root).catch(() => null);
  if (!stat?.isDirectory()) throw new Error(`Target is not a directory: ${target}`);

  const scanReport = await scan(root, { plugins: options.plugins ?? [] });
  const index = await indexRepository(root);
  const detection = await detectStacks(index);
  const adapters = await runAdapters({ root, index, detection, scanReport });
  const plannedProbes = uniqueBy(adapters.flatMap((adapter) => adapter.probes ?? []), (probe) => probe.id);
  const probesEnabled = options.probe === true;
  const probes = probesEnabled
    ? await runProbes(root, plannedProbes, { timeoutMs: options.timeoutMs ?? 8000, includeStartup: options.probeStartup === true })
    : [];
  const hasPrimaryAdapter = scanReport.primaryStacks?.some((stack) => adapters.some((adapter) => adapter.id === stack));
  const startupWarnings = hasPrimaryAdapter
    ? scanReport.startup.warnings.filter((item) => item.id !== 'stack.detected')
    : scanReport.startup.warnings;

  const staticCauses = [
    ...scanReport.startup.blockers.map(findingCause),
    ...startupWarnings.map(findingCause),
    ...adapters.flatMap((adapter) => (adapter.issues ?? []).map((issue) => issueCause(adapter, issue)))
  ];
  const probeCauses = probes.map(probeCause).filter(Boolean);
  const rootCauses = rankRootCauses(uniqueBy([...staticCauses, ...probeCauses], (cause) => `${cause.type}:${cause.evidence}`));
  const adapterActions = adapters.flatMap((adapter) => adapter.actions ?? []).map(normalizeAction);
  const fixActions = rootCauses.map(actionFromCause).filter(Boolean);
  const status = buildStatus({ scanReport, rootCauses, probesEnabled, probes, adapters });
  const fixPlan = options.apply === 'safe'
    ? await applySafeFixes(root, buildFixPlan({ index, adapters, rootCauses }))
    : buildFixPlan({ index, adapters, rootCauses });
  fixPlan.fixes = fixPlan.fixes.map((fix) => ({ ...fix, explanation: explainFix(fix) }));
  const nextCommand = selectNextCommand({ root, adapterActions, fixPlan });
  const nextActions = uniqueBy([nextCommand, ...fixActions, ...adapterActions].filter(Boolean), (action) => action.command ?? action.description).slice(0, 12);
  const confidence = buildConfidence({ adapters, rootCauses, probesEnabled, probes });
  const readiness = buildReadiness({ status, rootCauses, probesEnabled, probes });
  const unknowns = buildUnknowns({ probesEnabled, probes, rootCauses });
  const actionPanel = buildActionPanel({ rootCauses, nextActions, nextCommand, fixPlan, probes, unknowns, confidence, readiness });

  return {
    schemaVersion: '2.0-doctor',
    tool: { name: 'SetupLens', version: VERSION },
    generatedAt: new Date().toISOString(),
    durationMs: Math.max(1, Math.round(performance.now() - started)),
    target: scanReport.target,
    status,
    summary: statusSummary(status, rootCauses, probesEnabled),
    scan: {
      score: scanReport.score,
      grade: scanReport.grade,
      scorable: scanReport.scorable,
      scoreStatus: scanReport.scoreStatus,
      startup: scanReport.startup,
      summaries: {
        setup: scanReport.scopes.setup.summary,
        hygiene: scanReport.scopes.hygiene.summary,
        all: scanReport.allSummary
      }
    },
    project: {
      primaryStack: scanReport.primaryStack,
      primaryStacks: scanReport.primaryStacks,
      supportedStacks: scanReport.stacks,
      stackEvidence: scanReport.stackEvidence,
      adapters: summarizeAdapters(adapters)
    },
    diagnosis: {
      rootCauses,
      nextActions,
      fixPlan,
      confidence,
      readiness,
      unknowns,
      actionPanel
    },
    probes: {
      enabled: probesEnabled,
      timeoutMs: options.timeoutMs ?? 8000,
      planned: plannedProbes,
      results: probes
    },
    findings: scanReport.findings
  };
}
