import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { classifyCloneFailure, collectFailureDataset, reviewFailureDataset } from '../src/failure-dataset.js';

const cliPath = fileURLToPath(new URL('../bin/setuplens.js', import.meta.url));

function repo(fullName, overrides = {}) {
  const [owner, name] = fullName.split('/');
  return {
    full_name: fullName,
    owner: { login: owner },
    name,
    html_url: `https://github.com/${fullName}`,
    clone_url: `https://github.com/${fullName}.git`,
    url: `https://api.github.com/repos/${fullName}`,
    default_branch: 'main',
    description: `${name} fixture`,
    license: { spdx_id: 'MIT' },
    topics: ['nextjs'],
    language: 'TypeScript',
    stargazers_count: 42,
    forks_count: 3,
    open_issues_count: 2,
    size: 100,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    pushed_at: '2026-01-01T00:00:00Z',
    ...overrides
  };
}

test('failure dataset collection records GitHub provenance without cloning by default', async () => {
  const calls = [];
  const fakeFetch = async (url) => {
    calls.push(url);
    return {
      ok: true,
      async json() {
        return {
          items: [
            repo('example/next-app'),
            repo('example/vite-app', { topics: ['vite'], language: 'JavaScript' })
          ]
        };
      }
    };
  };

  const report = await collectFailureDataset({
    limit: 2,
    queries: [{ ecosystem: 'next', query: 'topic:nextjs archived:false' }],
    fetch: fakeFetch,
    now: '2026-07-01T00:00:00.000Z'
  });

  assert.equal(report.schemaVersion, '1.0-failure-dataset');
  assert.equal(report.summary.sources, 2);
  assert.equal(report.summary.cloned, 0);
  assert.equal(report.summary.scanned, 0);
  assert.equal(report.sources[0].source.discoveredBy.query, 'topic:nextjs archived:false');
  assert.equal(report.sources[0].source.discoveredAt, '2026-07-01T00:00:00.000Z');
  assert.match(report.sources[0].provenance.reproducibility.cloneCommand, /git clone https:\/\/github.com\/example\/next-app\.git/);
  assert.equal(report.sources[0].clone, null);
  assert.equal(report.sources[0].scan, null);
  assert.equal(calls.length, 1);
});

test('failure dataset review builds a corpus queue and classifier backlog', async () => {
  const dataset = {
    schemaVersion: '1.0-failure-dataset',
    generatedAt: '2026-07-01T00:00:00.000Z',
    sources: [
      {
        id: 'github-example-next-app',
        source: {
          fullName: 'example/next-app',
          htmlUrl: 'https://github.com/example/next-app',
          cloneUrl: 'https://github.com/example/next-app.git',
          license: 'MIT',
          primaryLanguage: 'TypeScript',
          discoveredBy: { ecosystem: 'next', query: 'topic:nextjs', page: 1, rank: 1 }
        },
        expect: {
          status: 'blocked',
          rootCauseTypes: ['node_dependencies_missing'],
          safeFix: true
        },
        clone: { status: 'cloned', path: 'repos/next-app', commit: 'abc123', commitDate: '2026-01-01T00:00:00Z' },
        scan: {
          status: 'blocked',
          readiness: { score: 0 },
          confidence: { score: 100 },
          primaryStack: 'node',
          ecosystems: ['node', 'Next.js'],
          topRootCause: { type: 'node_dependencies_missing', title: 'Node dependencies missing' },
          rootCauseTypes: ['node_dependencies_missing'],
          safeFixCount: 1,
          manualFixCount: 1,
          unclassifiedProbes: [{ id: 'node.verify.lint', evidence: 'custom failure' }],
          unknowns: ['Need startup probes for dev server readiness'],
          reportPath: 'reports/next-app.doctor.json'
        }
      },
      {
        id: 'github-example-unknown',
        source: {
          fullName: 'example/unknown',
          htmlUrl: 'https://github.com/example/unknown',
          cloneUrl: 'https://github.com/example/unknown.git',
          license: null,
          primaryLanguage: 'Zig',
          discoveredBy: { ecosystem: 'unknown', query: 'topic:unknown', page: 1, rank: 1 }
        },
        clone: { status: 'cloned', path: 'repos/unknown', commit: 'def456' },
        scan: {
          status: 'unsupported',
          primaryStack: 'zig',
          ecosystems: ['zig'],
          rootCauseTypes: [],
          safeFixCount: 0,
          manualFixCount: 0,
          unclassifiedProbes: [],
          unknowns: [],
          reportPath: 'reports/unknown.doctor.json'
        }
      },
      {
        id: 'github-example-long-path',
        source: {
          fullName: 'example/long-path',
          htmlUrl: 'https://github.com/example/long-path',
          cloneUrl: 'https://github.com/example/long-path.git',
          license: 'MIT',
          primaryLanguage: 'Ruby',
          discoveredBy: { ecosystem: 'rails', query: 'topic:rails', page: 1, rank: 1 }
        },
        clone: {
          status: 'failed',
          reason: 'git_clone_failed',
          classification: {
            type: 'windows_path_too_long',
            evidence: 'fatal: cannot create directory at spec/fixtures/example: Filename too long',
            recommendation: 'Retry with Windows long paths enabled.'
          }
        },
        scan: { status: 'skipped', reason: 'repository_not_cloned' }
      }
    ]
  };

  const review = await reviewFailureDataset({ dataset, now: '2026-07-01T00:00:00.000Z' });

  assert.equal(review.schemaVersion, '1.0-failure-dataset-review');
  assert.equal(review.summary.sources, 3);
  assert.equal(review.summary.corpusCandidates, 1);
  assert.equal(review.scorecard.overallScore, 75);
  assert.equal(review.scorecard.grade, 'strong');
  assert.equal(review.scorecard.metrics.diagnosticHitRate.value, 100);
  assert.equal(review.scorecard.metrics.rootCauseFirstRate.value, 100);
  assert.equal(review.scorecard.metrics.safeFixGenerationRate.value, 100);
  assert.equal(review.scorecard.metrics.falseBlockerRate.value, 0);
  assert.equal(review.scorecard.metrics.falseBlockerRiskRate.value, 100);
  assert.ok(review.scorecard.ecosystemCoverage.some((item) => item.ecosystem === 'next' && item.sources === 1));
  assert.equal(review.promotionCandidates[0].id, 'github-example-next-app');
  assert.equal(review.feedback.safeFixOpportunities[0].safeFixCount, 1);
  assert.ok(review.ruleGaps.some((gap) => gap.type === 'unclassified_probe_log'));
  assert.ok(review.ruleGaps.some((gap) => gap.type === 'unsupported_stack'));
  assert.ok(review.ruleGaps.some((gap) => gap.type === 'windows_path_too_long'));
});

test('failure dataset classifies Windows path length clone failures', () => {
  const classification = classifyCloneFailure({
    status: 'failed',
    stderr: "fatal: cannot create directory at 'spec/fixtures/vcr_cassettes/very/long/path': Filename too long\nwarning: Clone succeeded, but checkout failed.\n"
  });

  assert.equal(classification.type, 'windows_path_too_long');
  assert.match(classification.recommendation, /long paths/i);
});

test('failure-dataset review command supports terminal output', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'setuplens-dataset-'));
  const manifest = path.join(root, 'sources.json');
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(manifest, JSON.stringify({
    schemaVersion: '1.0-failure-dataset',
    generatedAt: '2026-07-01T00:00:00.000Z',
    sources: []
  }), 'utf8');

  const result = spawnSync(process.execPath, [cliPath, 'failure-dataset', 'review', '--input', manifest, '--no-color'], {
    encoding: 'utf8',
    windowsHide: true
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /SetupLens Failure Dataset Review/);
  assert.match(result.stdout, /Sources\s+0/);
  assert.match(result.stdout, /Scorecard/);
});
