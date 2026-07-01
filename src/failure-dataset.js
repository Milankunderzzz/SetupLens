import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { VERSION } from './constants.js';
import { doctor } from './doctor.js';

export const DEFAULT_DATASET_QUERIES = Object.freeze([
  { ecosystem: 'next', query: 'topic:nextjs language:TypeScript archived:false pushed:>2024-01-01' },
  { ecosystem: 'vite', query: 'topic:vite language:TypeScript archived:false pushed:>2024-01-01' },
  { ecosystem: 'prisma', query: 'topic:prisma archived:false pushed:>2024-01-01' },
  { ecosystem: 'django', query: 'topic:django language:Python archived:false pushed:>2024-01-01' },
  { ecosystem: 'fastapi', query: 'topic:fastapi language:Python archived:false pushed:>2024-01-01' },
  { ecosystem: 'laravel', query: 'topic:laravel language:PHP archived:false pushed:>2024-01-01' },
  { ecosystem: 'rails', query: 'topic:rails language:Ruby archived:false pushed:>2024-01-01' },
  { ecosystem: 'spring', query: 'topic:spring-boot language:Java archived:false pushed:>2024-01-01' },
  { ecosystem: 'dotnet', query: 'topic:aspnet-core language:C# archived:false pushed:>2024-01-01' },
  { ecosystem: 'go', query: 'topic:golang language:Go archived:false pushed:>2024-01-01' },
  { ecosystem: 'rust', query: 'topic:rust language:Rust archived:false pushed:>2024-01-01' },
  { ecosystem: 'monorepo', query: 'topic:monorepo archived:false pushed:>2024-01-01' }
]);

const DEFAULT_ROOT = '.setuplens/failure-dataset';

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function increment(map, key) {
  if (!key) return;
  map.set(key, (map.get(key) ?? 0) + 1);
}

function sortedCounts(map) {
  return [...map.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([name, count]) => ({ name, count }));
}

function truncate(value, max = 6000) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max)}\n...[truncated]` : text;
}

function safeSlug(value) {
  return String(value)
    .trim()
    .replace(/[\\/]+/g, '--')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'repository';
}

function ensureInside(root, target) {
  const relative = path.relative(root, target);
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) return;
  throw new Error(`Refusing path outside dataset directory: ${target}`);
}

async function pathExists(target) {
  return fs.access(target).then(() => true, () => false);
}

function tokenFromEnv() {
  return process.env.SETUPLENS_GITHUB_TOKEN || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
}

async function requestJson(url, options) {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('GitHub discovery requires Node.js fetch support.');
  const headers = {
    accept: 'application/vnd.github+json',
    'user-agent': `SetupLens/${VERSION} failure-dataset-collector`
  };
  if (options.token) headers.authorization = `Bearer ${options.token}`;

  const response = await fetchImpl(url, { headers });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`GitHub search failed (${response.status}): ${truncate(text, 300)}`);
  }
  return response.json();
}

export function normalizeRepository(repo, discovery) {
  const fullName = repo.full_name ?? `${repo.owner?.login ?? 'unknown'}/${repo.name ?? 'repository'}`;
  const fetchedAt = discovery.fetchedAt;
  return {
    id: `github-${safeSlug(fullName).toLowerCase()}`,
    status: 'candidate',
    source: {
      provider: 'github',
      fullName,
      owner: repo.owner?.login ?? null,
      name: repo.name ?? null,
      htmlUrl: repo.html_url ?? null,
      cloneUrl: repo.clone_url ?? null,
      apiUrl: repo.url ?? null,
      defaultBranch: repo.default_branch ?? null,
      description: repo.description ?? '',
      license: repo.license?.spdx_id ?? repo.license?.key ?? null,
      topics: asArray(repo.topics).sort(),
      primaryLanguage: repo.language ?? null,
      stars: repo.stargazers_count ?? 0,
      forks: repo.forks_count ?? 0,
      openIssues: repo.open_issues_count ?? 0,
      sizeKb: repo.size ?? null,
      createdAt: repo.created_at ?? null,
      updatedAt: repo.updated_at ?? null,
      pushedAt: repo.pushed_at ?? null,
      discoveredAt: fetchedAt,
      discoveredBy: {
        provider: 'github-search-api',
        ecosystem: discovery.ecosystem,
        query: discovery.query,
        page: discovery.page,
        rank: discovery.rank,
        endpoint: discovery.endpoint
      }
    },
    provenance: {
      evidenceKind: 'github_repository_search_result',
      fetchedAt,
      reproducibility: {
        cloneCommand: repo.clone_url ? `git clone ${repo.clone_url} ${safeSlug(fullName)}` : null,
        pinCommand: repo.default_branch ? `git -C ${safeSlug(fullName)} rev-parse ${repo.default_branch}` : null,
        scanCommand: `setuplens doctor ${safeSlug(fullName)} --format json`
      },
      retainedFields: [
        'full_name',
        'html_url',
        'clone_url',
        'default_branch',
        'license',
        'topics',
        'language',
        'pushed_at',
        'stargazers_count'
      ]
    },
    clone: null,
    scan: null
  };
}

export async function discoverGitHubRepositories(options = {}) {
  const limit = Math.max(1, Number(options.limit ?? 50));
  const maxPages = Math.max(1, Number(options.maxPages ?? 2));
  const queries = asArray(options.queries).length > 0 ? options.queries : DEFAULT_DATASET_QUERIES;
  const token = options.token ?? tokenFromEnv();
  const perPage = Math.min(100, Math.max(5, Number(options.perPage ?? Math.ceil(limit / queries.length) + 5)));
  const fetchedAt = options.now ?? new Date().toISOString();
  const endpoint = 'https://api.github.com/search/repositories';
  const seen = new Set();
  const sources = [];
  const errors = [];

  for (let page = 1; page <= maxPages && sources.length < limit; page += 1) {
    const pageBuckets = [];
    for (const item of queries) {
      const spec = typeof item === 'string' ? { ecosystem: 'unknown', query: item } : item;
      const url = `${endpoint}?q=${encodeURIComponent(spec.query)}&sort=updated&order=desc&per_page=${perPage}&page=${page}`;
      try {
        const payload = await requestJson(url, { fetch: options.fetch, token });
        const bucket = [];
        for (const [index, repo] of asArray(payload.items).entries()) {
          const key = repo.full_name?.toLowerCase();
          if (!key || seen.has(key)) continue;
          seen.add(key);
          bucket.push(normalizeRepository(repo, {
            fetchedAt,
            endpoint,
            ecosystem: spec.ecosystem,
            query: spec.query,
            page,
            rank: index + 1
          }));
        }
        pageBuckets.push(bucket);
      } catch (error) {
        errors.push({
          ecosystem: spec.ecosystem,
          query: spec.query,
          page,
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }
    let added = true;
    while (sources.length < limit && added) {
      added = false;
      for (const bucket of pageBuckets) {
        const source = bucket.shift();
        if (!source) continue;
        sources.push(source);
        added = true;
        if (sources.length >= limit) break;
      }
    }
  }

  return { sources, errors };
}

function spawnProcess(command, args, options = {}) {
  const started = performance.now();
  const timeoutMs = options.timeoutMs ?? 120000;
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    child.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({
        status: 'error',
        exitCode: null,
        timedOut: false,
        durationMs: Math.max(1, Math.round(performance.now() - started)),
        stdout: truncate(stdout),
        stderr: truncate(stderr),
        error: error.message
      });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        status: timedOut ? 'timeout' : code === 0 ? 'success' : 'failed',
        exitCode: code,
        timedOut,
        durationMs: Math.max(1, Math.round(performance.now() - started)),
        stdout: truncate(stdout),
        stderr: truncate(stderr)
      });
    });
  });
}

async function gitOutput(args, options = {}) {
  const result = await spawnProcess('git', args, options);
  if (result.status !== 'success') return null;
  return result.stdout.trim();
}

async function cloneSource(source, options) {
  const root = path.resolve(options.reposDir ?? path.join(DEFAULT_ROOT, 'repos'));
  const localPath = path.join(root, safeSlug(source.source.fullName));
  ensureInside(root, localPath);
  await fs.mkdir(root, { recursive: true });

  if (!source.source.cloneUrl) {
    return { status: 'skipped', reason: 'missing_clone_url', path: localPath };
  }

  const alreadyExists = await pathExists(localPath);
  if (alreadyExists && !await pathExists(path.join(localPath, '.git'))) {
    return { status: 'error', reason: 'target_exists_not_git_repo', path: localPath };
  }

  const result = alreadyExists
    ? { status: 'success', exitCode: 0, durationMs: 0, stdout: '', stderr: '' }
    : await spawnProcess('git', ['clone', '--depth', '1', '--filter=blob:none', source.source.cloneUrl, localPath], {
      timeoutMs: options.cloneTimeoutMs ?? 180000
    });

  if (result.status !== 'success') {
    return {
      status: result.status,
      reason: 'git_clone_failed',
      path: localPath,
      durationMs: result.durationMs,
      exitCode: result.exitCode,
      stderr: result.stderr
    };
  }

  const commit = await gitOutput(['-C', localPath, 'rev-parse', 'HEAD'], { timeoutMs: 30000 });
  const commitDate = await gitOutput(['-C', localPath, 'log', '-1', '--format=%cI'], { timeoutMs: 30000 });
  return {
    status: alreadyExists ? 'existing' : 'cloned',
    path: localPath,
    durationMs: result.durationMs,
    commit,
    commitDate,
    reproducibility: {
      cloneCommand: `git clone ${source.source.cloneUrl} ${localPath}`,
      checkoutCommand: commit ? `git -C ${localPath} checkout ${commit}` : null
    }
  };
}

function summarizeDoctor(report, reportPath) {
  const adapters = report.project.adapters.map((adapter) => adapter.id);
  const ecosystems = [...new Set([
    ...adapters,
    ...(report.project.primaryStacks ?? []),
    ...report.project.adapters.flatMap((adapter) => adapter.signals?.frameworks ?? [])
  ])].sort();
  const fixes = report.diagnosis.fixPlan?.fixes ?? [];
  return {
    status: report.status,
    durationMs: report.durationMs,
    primaryStack: report.project.primaryStack,
    ecosystems,
    adapters,
    readiness: report.diagnosis.readiness,
    confidence: report.diagnosis.confidence,
    topRootCause: report.diagnosis.rootCauses[0] ?? null,
    rootCauses: report.diagnosis.rootCauses.map((cause) => ({
      rank: cause.rank,
      type: cause.type,
      title: cause.title,
      evidence: cause.evidence,
      confidence: cause.confidence
    })),
    rootCauseTypes: report.diagnosis.rootCauses.map((cause) => cause.type),
    safeFixCount: fixes.filter((fix) => fix.canApply).length,
    manualFixCount: fixes.filter((fix) => !fix.canApply).length,
    unclassifiedProbes: report.probes.results
      .filter((probe) => probe.classification?.type === 'unclassified_command_failure')
      .map((probe) => ({
        id: probe.id,
        display: probe.display,
        evidence: probe.classification.evidence
      })),
    unknowns: report.diagnosis.unknowns,
    reportPath
  };
}

async function scanSource(source, options) {
  if (!source.clone?.path || !['cloned', 'existing'].includes(source.clone.status)) {
    return { status: 'skipped', reason: 'repository_not_cloned' };
  }
  const reportsRoot = path.resolve(options.reportsDir ?? path.join(DEFAULT_ROOT, 'reports'));
  const reportPath = path.join(reportsRoot, `${source.id}.doctor.json`);
  ensureInside(reportsRoot, reportPath);
  await fs.mkdir(reportsRoot, { recursive: true });

  try {
    const report = await doctor(source.clone.path, {
      probe: options.probe === true,
      probeStartup: options.probeStartup === true,
      timeoutMs: options.timeoutMs ?? 8000
    });
    await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    return summarizeDoctor(report, reportPath);
  } catch (error) {
    return {
      status: 'error',
      reason: 'doctor_failed',
      message: error instanceof Error ? error.message : String(error),
      reportPath
    };
  }
}

function summarizeCollection(sources, errors) {
  const ecosystemCounts = new Map();
  const licenseCounts = new Map();
  const statusCounts = new Map();
  const scanStatusCounts = new Map();
  const failureTypeCounts = new Map();
  for (const source of sources) {
    increment(ecosystemCounts, source.source.discoveredBy.ecosystem);
    increment(licenseCounts, source.source.license ?? 'unknown');
    increment(statusCounts, source.clone?.status ?? source.status);
    increment(scanStatusCounts, source.scan?.status);
    for (const type of source.scan?.rootCauseTypes ?? []) increment(failureTypeCounts, type);
  }
  return {
    sources: sources.length,
    cloned: sources.filter((source) => ['cloned', 'existing'].includes(source.clone?.status)).length,
    scanned: sources.filter((source) => source.scan && !['skipped', 'error'].includes(source.scan.status)).length,
    discoveryErrors: errors.length,
    sourceEcosystems: sortedCounts(ecosystemCounts),
    sourceLicenses: sortedCounts(licenseCounts),
    cloneStatuses: sortedCounts(statusCounts),
    scanStatuses: sortedCounts(scanStatusCounts),
    failureTypeDistribution: sortedCounts(failureTypeCounts)
  };
}

export async function collectFailureDataset(options = {}) {
  const started = performance.now();
  const limit = Math.max(1, Number(options.limit ?? 50));
  const clone = options.clone === true || options.scan === true;
  const scan = options.scan === true;
  const { sources, errors } = await discoverGitHubRepositories({
    limit,
    queries: options.queries,
    perPage: options.perPage,
    maxPages: options.maxPages,
    fetch: options.fetch,
    token: options.token,
    now: options.now
  });

  for (const source of sources) {
    if (clone) source.clone = await cloneSource(source, options);
    if (scan) source.scan = await scanSource(source, options);
  }

  return {
    schemaVersion: '1.0-failure-dataset',
    tool: { name: 'SetupLens', version: VERSION },
    generatedAt: options.now ?? new Date().toISOString(),
    durationMs: Math.max(1, Math.round(performance.now() - started)),
    policy: {
      purpose: 'Collect public repository candidates for reproducible setup-failure validation.',
      defaultLimit: 50,
      contentRetention: 'The manifest stores repository metadata, provenance, clone pins, and scan summaries. Third-party repository contents stay outside git by default.',
      scanSafety: scan
        ? options.probe ? 'doctor scan with bounded probes requested' : 'static doctor scan only'
        : 'metadata-only collection; no repository code executed'
    },
    options: {
      limit,
      clone,
      scan,
      probe: options.probe === true,
      probeStartup: options.probeStartup === true,
      timeoutMs: options.timeoutMs ?? 8000,
      reposDir: clone ? path.resolve(options.reposDir ?? path.join(DEFAULT_ROOT, 'repos')) : null,
      reportsDir: scan ? path.resolve(options.reportsDir ?? path.join(DEFAULT_ROOT, 'reports')) : null
    },
    queries: (asArray(options.queries).length > 0 ? options.queries : DEFAULT_DATASET_QUERIES).map((item) => (
      typeof item === 'string' ? { ecosystem: 'unknown', query: item } : item
    )),
    summary: summarizeCollection(sources, errors),
    sources,
    errors
  };
}

function summarizeReview(sources) {
  const statusCounts = new Map();
  const ecosystemCounts = new Map();
  const failureTypeCounts = new Map();
  let safeFixes = 0;
  let manualFixes = 0;
  let unclassifiedLogs = 0;
  for (const source of sources) {
    increment(statusCounts, source.scan?.status ?? 'not_scanned');
    for (const ecosystem of source.scan?.ecosystems ?? [source.source?.discoveredBy?.ecosystem]) increment(ecosystemCounts, ecosystem);
    for (const type of source.scan?.rootCauseTypes ?? []) increment(failureTypeCounts, type);
    safeFixes += source.scan?.safeFixCount ?? 0;
    manualFixes += source.scan?.manualFixCount ?? 0;
    unclassifiedLogs += source.scan?.unclassifiedProbes?.length ?? 0;
  }
  return {
    sources: sources.length,
    scanned: sources.filter((source) => source.scan && !['skipped', 'error'].includes(source.scan.status)).length,
    corpusCandidates: sources.filter((source) => ['blocked', 'needs_setup'].includes(source.scan?.status) && source.scan?.rootCauseTypes?.length > 0).length,
    safeFixes,
    manualFixes,
    unclassifiedLogs,
    statuses: sortedCounts(statusCounts),
    ecosystemCoverage: sortedCounts(ecosystemCounts),
    failureTypeDistribution: sortedCounts(failureTypeCounts)
  };
}

function promotionCandidate(source) {
  return {
    id: source.id,
    source: {
      fullName: source.source.fullName,
      htmlUrl: source.source.htmlUrl,
      license: source.source.license,
      discoveredBy: source.source.discoveredBy
    },
    clone: source.clone ? {
      path: source.clone.path,
      commit: source.clone.commit,
      commitDate: source.clone.commitDate
    } : null,
    scan: {
      status: source.scan.status,
      readiness: source.scan.readiness,
      confidence: source.scan.confidence,
      topRootCause: source.scan.topRootCause,
      rootCauseTypes: source.scan.rootCauseTypes,
      safeFixCount: source.scan.safeFixCount,
      manualFixCount: source.scan.manualFixCount,
      reportPath: source.scan.reportPath
    },
    reproduce: {
      cloneCommand: source.source.cloneUrl ? `git clone ${source.source.cloneUrl} ${safeSlug(source.source.fullName)}` : null,
      checkoutCommand: source.clone?.commit ? `git -C ${safeSlug(source.source.fullName)} checkout ${source.clone.commit}` : null,
      scanCommand: source.clone?.path ? `setuplens doctor "${source.clone.path}" --format json` : `setuplens doctor ${safeSlug(source.source.fullName)} --format json`
    }
  };
}

function buildRuleGaps(sources) {
  const gaps = [];
  for (const source of sources) {
    if (source.scan?.status === 'unsupported') {
      gaps.push({
        type: 'unsupported_stack',
        sourceId: source.id,
        project: source.source.fullName,
        evidence: source.scan.primaryStack ?? source.source.primaryLanguage ?? 'unknown'
      });
    }
    for (const probe of source.scan?.unclassifiedProbes ?? []) {
      gaps.push({
        type: 'unclassified_probe_log',
        sourceId: source.id,
        project: source.source.fullName,
        probeId: probe.id,
        evidence: probe.evidence
      });
    }
    for (const unknown of source.scan?.unknowns ?? []) {
      gaps.push({
        type: 'diagnostic_unknown',
        sourceId: source.id,
        project: source.source.fullName,
        evidence: unknown
      });
    }
    if (source.clone?.status && !['cloned', 'existing'].includes(source.clone.status)) {
      gaps.push({
        type: 'collection_error',
        sourceId: source.id,
        project: source.source.fullName,
        evidence: source.clone.reason ?? source.clone.status
      });
    }
    if (source.scan?.status === 'error') {
      gaps.push({
        type: 'scan_error',
        sourceId: source.id,
        project: source.source.fullName,
        evidence: source.scan.message ?? source.scan.reason
      });
    }
  }
  return gaps;
}

export async function reviewFailureDataset(options = {}) {
  const input = options.input ? path.resolve(options.input) : null;
  const dataset = options.dataset ?? JSON.parse(await fs.readFile(input, 'utf8'));
  const sources = asArray(dataset.sources);
  const promotionCandidates = sources
    .filter((source) => ['blocked', 'needs_setup'].includes(source.scan?.status) && source.scan?.rootCauseTypes?.length > 0)
    .map(promotionCandidate)
    .sort((left, right) => {
      const leftScore = left.scan.status === 'blocked' ? 0 : 1;
      const rightScore = right.scan.status === 'blocked' ? 0 : 1;
      return leftScore - rightScore || left.id.localeCompare(right.id);
    });
  const ruleGaps = buildRuleGaps(sources);

  return {
    schemaVersion: '1.0-failure-dataset-review',
    tool: { name: 'SetupLens', version: VERSION },
    generatedAt: options.now ?? new Date().toISOString(),
    input,
    datasetGeneratedAt: dataset.generatedAt ?? null,
    summary: summarizeReview(sources),
    promotionCandidates,
    feedback: {
      corpusPromotionQueue: promotionCandidates.slice(0, 20),
      classifierBacklog: ruleGaps.filter((gap) => ['unclassified_probe_log', 'unsupported_stack', 'diagnostic_unknown'].includes(gap.type)).slice(0, 50),
      safeFixOpportunities: promotionCandidates
        .filter((candidate) => candidate.scan.safeFixCount > 0)
        .map((candidate) => ({
          id: candidate.id,
          project: candidate.source.fullName,
          safeFixCount: candidate.scan.safeFixCount,
          topRootCause: candidate.scan.topRootCause?.type ?? null
        }))
    },
    ruleGaps,
    reproductionChecklist: [
      'Use the recorded clone URL and commit before comparing results.',
      'Run setuplens doctor with the same probe and timeout policy recorded in the manifest.',
      'Promote only sanitized minimal fixtures into docs/failure-corpus/cases.json.',
      'Keep third-party repository contents outside git unless a license review explicitly allows inclusion.'
    ]
  };
}
