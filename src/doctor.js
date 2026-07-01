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
    signals: adapter.signals
  }));
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
    ? runProbes(root, plannedProbes, { timeoutMs: options.timeoutMs ?? 8000 })
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
  const rootCauses = uniqueBy([...staticCauses, ...probeCauses], (cause) => `${cause.type}:${cause.evidence}`);
  const adapterActions = adapters.flatMap((adapter) => adapter.actions ?? []).map(normalizeAction);
  const fixActions = rootCauses.map(actionFromCause).filter(Boolean);
  const nextActions = uniqueBy([...fixActions, ...adapterActions], (action) => action.command ?? action.description).slice(0, 12);
  const status = buildStatus({ scanReport, rootCauses, probesEnabled, probes, adapters });
  const fixPlan = options.apply === 'safe'
    ? await applySafeFixes(root, buildFixPlan({ index, adapters, rootCauses }))
    : buildFixPlan({ index, adapters, rootCauses });

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
      fixPlan
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
