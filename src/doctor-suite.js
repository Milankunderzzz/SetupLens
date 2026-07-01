import fs from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { VERSION } from './constants.js';
import { doctor } from './doctor.js';

function increment(map, key) {
  if (!key) return;
  map.set(key, (map.get(key) ?? 0) + 1);
}

function sortedCounts(map) {
  return [...map.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([name, count]) => ({ name, count }));
}

async function suiteTargets(root) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules')
    .map((entry) => path.join(root, entry.name));
}

function summarizeReport(target, report) {
  const adapters = report.project.adapters.map((adapter) => adapter.id);
  const ecosystems = [...new Set([
    ...adapters,
    ...(report.project.primaryStacks ?? []),
    ...report.project.adapters.flatMap((adapter) => adapter.signals?.frameworks ?? [])
  ])].sort();
  return {
    target,
    name: report.target.name,
    status: report.status,
    durationMs: report.durationMs,
    primaryStack: report.project.primaryStack,
    ecosystems,
    adapters,
    confidence: report.diagnosis.confidence,
    topRootCause: report.diagnosis.rootCauses[0] ?? null,
    rootCauseTypes: report.diagnosis.rootCauses.map((cause) => cause.type),
    unclassifiedProbes: report.probes.results
      .filter((probe) => probe.classification?.type === 'unclassified_command_failure')
      .map((probe) => ({
        id: probe.id,
        display: probe.display,
        evidence: probe.classification.evidence
      }))
  };
}

function summarizeSuite(results) {
  const statusCounts = new Map();
  const ecosystemCounts = new Map();
  const failureTypeCounts = new Map();
  const unclassifiedLogs = [];

  for (const result of results) {
    increment(statusCounts, result.status);
    for (const ecosystem of result.ecosystems) increment(ecosystemCounts, ecosystem);
    for (const type of result.rootCauseTypes) increment(failureTypeCounts, type);
    for (const item of result.unclassifiedProbes) {
      unclassifiedLogs.push({ target: result.name, ...item });
    }
  }

  return {
    total: results.length,
    statusCounts: sortedCounts(statusCounts),
    ecosystemCoverage: sortedCounts(ecosystemCounts),
    failureTypeDistribution: sortedCounts(failureTypeCounts),
    unclassifiedLogs
  };
}

export async function doctorSuite(target = '.', options = {}) {
  const started = performance.now();
  const root = path.resolve(target);
  const stat = await fs.stat(root).catch(() => null);
  if (!stat?.isDirectory()) throw new Error(`Target is not a directory: ${target}`);

  const targets = await suiteTargets(root);
  const results = [];
  const errors = [];
  for (const item of targets) {
    try {
      const report = await doctor(item, {
        plugins: options.plugins ?? [],
        probe: options.probe === true,
        probeStartup: options.probeStartup === true,
        timeoutMs: options.timeoutMs ?? 8000
      });
      results.push(summarizeReport(item, report));
    } catch (error) {
      errors.push({ target: item, message: error.message });
    }
  }

  return {
    schemaVersion: '1.0-doctor-suite',
    tool: { name: 'SetupLens', version: VERSION },
    generatedAt: new Date().toISOString(),
    durationMs: Math.max(1, Math.round(performance.now() - started)),
    target: {
      path: root,
      name: path.basename(root) || root
    },
    options: {
      probe: options.probe === true,
      probeStartup: options.probeStartup === true,
      timeoutMs: options.timeoutMs ?? 8000
    },
    summary: summarizeSuite(results),
    results,
    errors
  };
}
