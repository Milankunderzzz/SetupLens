import fs from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { FINDING_SCOPES, STATUS_ORDER, VERSION } from './constants.js';
import { indexRepository } from './lib/files.js';
import { clamp, gradeForScore } from './lib/utils.js';
import { detectStacks, stackFindings } from './checks/stacks.js';
import { runtimeFindings } from './checks/runtimes.js';
import { dependencyFindings } from './checks/dependencies.js';
import { configurationFindings } from './checks/configuration.js';
import { pathFindings } from './checks/paths.js';
import { securityFindings } from './checks/security.js';
import { repositoryFindings } from './checks/repository.js';
import { editorFindings } from './checks/editor.js';
import { runPlugins } from './plugins.js';

function calculateScore(findings) {
  const deduction = findings.reduce((total, item) => {
    if (item.status === 'fail') return total + item.weight;
    if (item.status === 'warn') return total + item.weight * 0.5;
    return total;
  }, 0);
  return Math.round(clamp(100 - deduction, 0, 100));
}

function summary(findings) {
  const result = { total: findings.length, pass: 0, warn: 0, fail: 0, info: 0 };
  for (const item of findings) result[item.status] += 1;
  return result;
}

function scopeResult(findings, scope, scorable = true) {
  const scopedFindings = findings.filter((item) => item.scope === scope);
  const score = scorable ? calculateScore(scopedFindings) : null;
  return {
    score,
    grade: scorable ? gradeForScore(score) : null,
    summary: summary(scopedFindings)
  };
}

function scoreEligibility(index, detection) {
  if (index.files.length === 0) {
    return {
      scorable: false,
      reason: 'empty_repository',
      message: 'The repository is empty, so setup readiness cannot be assessed.'
    };
  }

  const primary = detection.stackEvidence.filter((item) => item.role === 'primary');
  if (primary.length === 0) {
    return {
      scorable: false,
      reason: 'primary_stack_not_detected',
      message: 'No supported primary stack was detected, so setup readiness was not scored.'
    };
  }

  if (!primary.some((item) => item.supported)) {
    const names = primary.map((item) => item.name).join(', ');
    return {
      scorable: false,
      reason: 'unsupported_primary_stack',
      message: `The primary stack (${names}) is outside SetupLens support, so setup readiness was not scored.`
    };
  }

  return { scorable: true, reason: null, message: null };
}

export async function scan(target = '.', options = {}) {
  const started = performance.now();
  const root = path.resolve(target);
  const stat = await fs.stat(root).catch(() => null);
  if (!stat?.isDirectory()) throw new Error(`Target is not a directory: ${target}`);

  const index = await indexRepository(root);
  const detection = await detectStacks(index);
  const editor = editorFindings(detection);
  const pluginResult = await runPlugins(options.plugins ?? [], {
    root,
    stacks: detection.stacks,
    primaryStack: detection.primaryStack,
    files: index.files
  });

  const findings = [
    ...stackFindings(index, detection),
    ...runtimeFindings(index, detection),
    ...dependencyFindings(index, detection),
    ...(await configurationFindings(index)),
    ...(await pathFindings(index, detection)),
    ...(await securityFindings(index)),
    ...repositoryFindings(index),
    ...editor.findings,
    ...pluginResult.findings
  ].sort((left, right) => {
    const status = STATUS_ORDER[left.status] - STATUS_ORDER[right.status];
    return status || left.category.localeCompare(right.category) || left.title.localeCompare(right.title);
  });

  const eligibility = scoreEligibility(index, detection);
  const scopes = {
    setup: scopeResult(findings, FINDING_SCOPES.SETUP, eligibility.scorable),
    hygiene: scopeResult(findings, FINDING_SCOPES.HYGIENE)
  };
  const score = scopes.setup.score;
  return {
    schemaVersion: '1.2',
    tool: { name: 'SetupLens', version: VERSION },
    generatedAt: new Date().toISOString(),
    durationMs: Math.max(1, Math.round(performance.now() - started)),
    target: { name: path.basename(root), path: root, filesIndexed: index.files.length, truncated: index.truncated },
    stacks: detection.stacks,
    primaryStack: detection.primaryStack,
    primaryStacks: detection.primaryStacks,
    stackEvidence: detection.stackEvidence,
    scorable: eligibility.scorable,
    scoreStatus: eligibility.scorable ? 'scored' : 'not_scored',
    notScoredReason: eligibility.reason,
    scoreMessage: eligibility.message,
    score,
    grade: eligibility.scorable ? gradeForScore(score) : null,
    summary: scopes.setup.summary,
    allSummary: summary(findings),
    scopes,
    findings,
    vscodeExtensions: editor.extensions,
    plugins: pluginResult.loaded
  };
}
