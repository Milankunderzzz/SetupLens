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

export function classifyCloneFailure(result = {}) {
  const combined = `${result.stderr ?? ''}\n${result.stdout ?? ''}\n${result.error ?? ''}`;
  if (/Filename too long|file name too long|cannot create directory at .*Filename too long/i.test(combined)) {
    return {
      type: 'windows_path_too_long',
      title: 'Checkout failed because a path exceeded the local filename limit',
      evidence: combined.match(/fatal: .*(?:Filename too long|file name too long).*/i)?.[0] ?? 'Git reported a filename length failure during checkout.',
      recommendation: 'Retry with Windows long paths enabled, a shorter clone directory, sparse checkout, or exclude this repository from fast corpus intake.'
    };
  }
  if (/Clone succeeded, but checkout failed/i.test(combined)) {
    return {
      type: 'git_checkout_failed',
      title: 'Clone succeeded but checkout failed',
      evidence: combined.match(/warning: Clone succeeded, but checkout failed\./i)?.[0] ?? 'Git reported a checkout failure after clone.',
      recommendation: 'Inspect git status in the partial clone or retry with a narrower checkout strategy.'
    };
  }
  if (/RPC failed|early EOF|invalid index-pack output|remote end hung up/i.test(combined)) {
    return {
      type: 'git_network_or_pack_failure',
      title: 'Git clone failed during network or pack transfer',
      evidence: combined.match(/(?:RPC failed|early EOF|invalid index-pack output|remote end hung up).*/i)?.[0] ?? 'Git reported a transfer failure.',
      recommendation: 'Retry later, reduce clone depth/filtering further, or skip the source for this dataset pass.'
    };
  }
  if (result.timedOut || result.status === 'timeout') {
    return {
      type: 'git_clone_timeout',
      title: 'Git clone timed out',
      evidence: `Clone exceeded the configured timeout after ${result.durationMs ?? 'unknown'} ms.`,
      recommendation: 'Increase clone timeout for large repositories or add size filters to the dataset collector.'
    };
  }
  return {
    type: 'git_clone_failed',
    title: 'Git clone failed',
    evidence: combined.trim().split(/\r?\n/).filter(Boolean).slice(-1)[0] ?? 'Git clone returned a non-zero exit code.',
    recommendation: 'Inspect the clone stderr and decide whether to retry, skip, or classify a new collection failure pattern.'
  };
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
    const classification = classifyCloneFailure(result);
    return {
      status: result.status,
      reason: 'git_clone_failed',
      classification,
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
  const cloneFailureTypeCounts = new Map();
  for (const source of sources) {
    increment(ecosystemCounts, source.source.discoveredBy.ecosystem);
    increment(licenseCounts, source.source.license ?? 'unknown');
    increment(statusCounts, source.clone?.status ?? source.status);
    increment(cloneFailureTypeCounts, source.clone?.classification?.type);
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
    cloneFailureTypes: sortedCounts(cloneFailureTypeCounts),
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

function percent(numerator, denominator) {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function metric(label, numerator, denominator, definition, mode = 'operational') {
  return {
    label,
    value: percent(numerator, denominator),
    numerator,
    denominator,
    unit: 'percent',
    mode,
    definition
  };
}

function scanStatus(source) {
  return source.scan?.status ?? 'not_scanned';
}

function rootCauseTypes(source) {
  return asArray(source.scan?.rootCauseTypes);
}

function topRootCauseType(source) {
  return source.scan?.topRootCause?.type ?? rootCauseTypes(source)[0] ?? null;
}

function hasRankedRootCause(source) {
  return rootCauseTypes(source).length > 0 || Boolean(source.scan?.topRootCause?.type);
}

function expectationFor(source) {
  const expect = source.expect ?? source.expected ?? source.evaluation?.expect ?? source.corpus?.expect ?? null;
  if (!expect || typeof expect !== 'object') return null;
  const expectedRootCauseTypes = asArray(expect.rootCauseTypes ?? expect.rootCauseType)
    .flat()
    .filter(Boolean);
  const expectedStatus = expect.status ?? expect.verdict ?? null;
  const expectedSafeFix = expect.safeFix === true || expect.safeFixExpected === true || asArray(expect.safeFixTitles).length > 0;
  if (expectedRootCauseTypes.length === 0 && !expectedStatus && !expectedSafeFix) return null;
  return {
    rootCauseTypes: expectedRootCauseTypes,
    status: expectedStatus,
    safeFix: expectedSafeFix
  };
}

function sourceEcosystem(source) {
  return source.source?.discoveredBy?.ecosystem
    ?? source.scan?.primaryStack
    ?? source.source?.primaryLanguage
    ?? 'unknown';
}

function blockerRisk(source) {
  if (scanStatus(source) !== 'blocked') return false;
  if (!hasRankedRootCause(source)) return true;
  if ((source.scan?.confidence?.score ?? 100) < 55) return true;
  if ((source.scan?.unclassifiedProbes?.length ?? 0) > 0 && rootCauseTypes(source).length <= 1) return true;
  return false;
}

function buildEcosystemScorecard(sources) {
  const buckets = new Map();
  for (const source of sources) {
    const ecosystem = sourceEcosystem(source);
    const bucket = buckets.get(ecosystem) ?? {
      ecosystem,
      sources: 0,
      scanned: 0,
      corpusCandidates: 0,
      blocked: 0,
      needsSetup: 0,
      needsProbe: 0,
      safeFixes: 0,
      manualFixes: 0,
      failureTypes: new Map()
    };
    bucket.sources += 1;
    const status = scanStatus(source);
    if (source.scan && !['skipped', 'error'].includes(status)) bucket.scanned += 1;
    if (['blocked', 'needs_setup'].includes(status) && rootCauseTypes(source).length > 0) bucket.corpusCandidates += 1;
    if (status === 'blocked') bucket.blocked += 1;
    if (status === 'needs_setup') bucket.needsSetup += 1;
    if (status === 'needs_probe') bucket.needsProbe += 1;
    bucket.safeFixes += source.scan?.safeFixCount ?? 0;
    bucket.manualFixes += source.scan?.manualFixCount ?? 0;
    for (const type of rootCauseTypes(source)) increment(bucket.failureTypes, type);
    buckets.set(ecosystem, bucket);
  }
  return [...buckets.values()]
    .sort((left, right) => right.sources - left.sources || left.ecosystem.localeCompare(right.ecosystem))
    .map((bucket) => ({
      ecosystem: bucket.ecosystem,
      sources: bucket.sources,
      scanned: bucket.scanned,
      corpusCandidates: bucket.corpusCandidates,
      blocked: bucket.blocked,
      needsSetup: bucket.needsSetup,
      needsProbe: bucket.needsProbe,
      safeFixes: bucket.safeFixes,
      manualFixes: bucket.manualFixes,
      topFailureTypes: sortedCounts(bucket.failureTypes).slice(0, 5)
    }));
}

function buildScorecard(sources) {
  const scanned = sources.filter((source) => source.scan && !['skipped', 'error'].includes(scanStatus(source)));
  const actionable = scanned.filter((source) => ['blocked', 'needs_setup'].includes(scanStatus(source)));
  const blocked = scanned.filter((source) => scanStatus(source) === 'blocked');
  const labeled = sources
    .map((source) => ({ source, expect: expectationFor(source) }))
    .filter((item) => item.expect);
  const labeledRootCauses = labeled.filter((item) => item.expect.rootCauseTypes.length > 0);
  const labeledStatuses = labeled.filter((item) => item.expect.status);
  const labeledSafeFixes = labeled.filter((item) => item.expect.safeFix);

  const diagnosticDenominator = labeledRootCauses.length > 0 ? labeledRootCauses.length : actionable.length;
  const diagnosticHits = labeledRootCauses.length > 0
    ? labeledRootCauses.filter(({ source, expect }) => expect.rootCauseTypes.some((type) => rootCauseTypes(source).includes(type))).length
    : actionable.filter(hasRankedRootCause).length;
  const rootFirstHits = labeledRootCauses
    .filter(({ source, expect }) => topRootCauseType(source) === expect.rootCauseTypes[0])
    .length;
  const safeFixDenominator = labeledSafeFixes.length > 0 ? labeledSafeFixes.length : actionable.length;
  const safeFixHits = labeledSafeFixes.length > 0
    ? labeledSafeFixes.filter(({ source }) => (source.scan?.safeFixCount ?? 0) > 0).length
    : actionable.filter((source) => (source.scan?.safeFixCount ?? 0) > 0).length;
  const falseBlockers = labeledStatuses
    .filter(({ source, expect }) => expect.status !== 'blocked' && scanStatus(source) === 'blocked')
    .length;
  const blockerRisks = blocked.filter(blockerRisk).length;

  const diagnosticHitRate = metric(
    'Diagnostic hit rate',
    diagnosticHits,
    diagnosticDenominator,
    labeledRootCauses.length > 0
      ? 'Percent of labeled cases whose expected root-cause type appeared anywhere in the ranked diagnosis.'
      : 'Percent of blocked/needs_setup candidates with at least one ranked root cause.',
    labeledRootCauses.length > 0 ? 'labeled' : 'operational'
  );
  const rootCauseFirstRate = metric(
    'Root cause first rate',
    rootFirstHits,
    labeledRootCauses.length,
    'Percent of labeled cases whose expected first root cause was ranked #1.',
    'labeled'
  );
  const safeFixGenerationRate = metric(
    'Safe fix generation rate',
    safeFixHits,
    safeFixDenominator,
    labeledSafeFixes.length > 0
      ? 'Percent of labeled safe-fix cases where at least one safe fix was generated.'
      : 'Percent of blocked/needs_setup candidates where at least one whitelisted safe fix was generated.',
    labeledSafeFixes.length > 0 ? 'labeled' : 'operational'
  );
  const falseBlockerRate = metric(
    'False blocker rate',
    falseBlockers,
    labeledStatuses.length,
    'Percent of labeled non-blocked cases that were incorrectly marked blocked.',
    'labeled'
  );
  const falseBlockerRiskRate = metric(
    'False blocker risk rate',
    blockerRisks,
    blocked.length,
    'Percent of blocked public candidates with weak evidence, low confidence, or unclassified probe noise.',
    'operational'
  );
  const ecosystemCoverage = buildEcosystemScorecard(sources);

  const scoredValues = [
    diagnosticHitRate.value,
    safeFixGenerationRate.value,
    falseBlockerRiskRate.value === null ? null : 100 - falseBlockerRiskRate.value,
    rootCauseFirstRate.value
  ].filter((value) => value !== null);
  const overallScore = labeled.length === 0 || scoredValues.length === 0
    ? null
    : Math.round(scoredValues.reduce((sum, value) => sum + value, 0) / scoredValues.length);
  const grade = overallScore === null
    ? labeled.length === 0 ? 'operational_only' : 'unscored'
    : overallScore >= 90 ? 'excellent'
      : overallScore >= 75 ? 'strong'
        : overallScore >= 60 ? 'developing'
          : 'needs_attention';

  return {
    schemaVersion: '1.0-scorecard',
    mode: labeled.length > 0 ? 'labeled_and_operational' : 'operational',
    overallScore,
    grade,
    labeledCases: labeled.length,
    notes: [
      labeledRootCauses.length === 0
        ? 'Root cause first rate requires labeled expected root causes; public source scans are treated as operational evidence until promoted into the curated corpus.'
        : null,
      labeledStatuses.length === 0
        ? 'False blocker rate requires labeled expected statuses; false blocker risk is reported as an operational proxy.'
        : null
    ].filter(Boolean),
    metrics: {
      diagnosticHitRate,
      rootCauseFirstRate,
      safeFixGenerationRate,
      falseBlockerRate,
      falseBlockerRiskRate,
      ecosystemCoverageCount: {
        label: 'Ecosystem coverage count',
        value: ecosystemCoverage.length,
        unit: 'ecosystems',
        definition: 'Number of source ecosystems represented in the reviewed dataset.'
      }
    },
    ecosystemCoverage
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
      ecosystems: source.scan.ecosystems ?? [],
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

function promotionPriority(candidate) {
  if (candidate.scan.status === 'blocked') return 'high';
  if ((candidate.scan.safeFixCount ?? 0) > 0) return 'medium';
  return 'review';
}

function corpusDraftId(candidate) {
  const project = safeSlug(candidate.source.fullName).toLowerCase();
  const cause = safeSlug(candidate.scan.topRootCause?.type ?? candidate.scan.rootCauseTypes?.[0] ?? 'setup-failure').toLowerCase();
  return `${project}-${cause}`.slice(0, 120);
}

function buildCorpusDraft(candidate) {
  return {
    id: corpusDraftId(candidate),
    ecosystems: [...new Set([candidate.source.discoveredBy?.ecosystem, ...(candidate.scan.ecosystems ?? [])].filter(Boolean))],
    source: {
      kind: 'public_real_project',
      label: `${candidate.source.fullName} failure-dataset candidate`,
      reference: candidate.source.htmlUrl,
      sanitized: false,
      provenance: {
        sourceId: candidate.id,
        discoveredBy: candidate.source.discoveredBy,
        license: candidate.source.license,
        commit: candidate.clone?.commit ?? null,
        commitDate: candidate.clone?.commitDate ?? null,
        reportPath: candidate.scan.reportPath ?? null
      }
    },
    fixture: {
      files: {},
      note: 'Paste the smallest sanitized file tree that still reproduces this diagnosis.'
    },
    expect: {
      status: candidate.scan.status,
      rootCauseTypes: candidate.scan.rootCauseTypes ?? [],
      topRootCauseType: candidate.scan.topRootCause?.type ?? candidate.scan.rootCauseTypes?.[0] ?? null,
      safeFixExpected: (candidate.scan.safeFixCount ?? 0) > 0
    }
  };
}

function promotionReviewChecklist(candidate) {
  return [
    'Reproduce the project at the recorded clone URL and commit before trusting the draft.',
    'Run the recorded SetupLens doctor command and compare the root-cause ranking.',
    'Reduce the project to the smallest fixture that still triggers the same diagnosis.',
    'Remove secrets, private URLs, generated code, vendor code, and unrelated project files.',
    'Paste the minimized fixture into draftCase.fixture.files and set source.sanitized to true.',
    'Confirm expected status, rootCauseTypes, topRootCauseType, and safeFixExpected.',
    'Run npm run corpus and npm test before committing the promoted case.'
  ].concat(candidate.source.license ? [] : ['Review licensing before copying even minimized public source snippets.']);
}

function buildPromotionDraft(candidate) {
  const missingEvidence = [];
  if (!candidate.clone?.commit) missingEvidence.push('resolved commit');
  if (!candidate.scan.reportPath) missingEvidence.push('doctor report path');
  if (!candidate.scan.topRootCause?.type) missingEvidence.push('ranked top root cause');
  if (!candidate.source.license) missingEvidence.push('license');
  return {
    id: candidate.id,
    project: candidate.source.fullName,
    priority: promotionPriority(candidate),
    missingEvidence,
    evidence: {
      status: candidate.scan.status,
      readiness: candidate.scan.readiness,
      confidence: candidate.scan.confidence,
      topRootCause: candidate.scan.topRootCause,
      rootCauseTypes: candidate.scan.rootCauseTypes,
      safeFixCount: candidate.scan.safeFixCount,
      manualFixCount: candidate.scan.manualFixCount,
      reportPath: candidate.scan.reportPath,
      clone: candidate.clone,
      reproduce: candidate.reproduce
    },
    draftCase: buildCorpusDraft(candidate),
    reviewChecklist: promotionReviewChecklist(candidate)
  };
}

function buildPromotionRejections(sources) {
  return sources
    .filter((source) => !(['blocked', 'needs_setup'].includes(source.scan?.status) && source.scan?.rootCauseTypes?.length > 0))
    .map((source) => ({
      id: source.id,
      project: source.source?.fullName ?? source.id,
      reason: !source.scan ? 'not_scanned'
        : ['skipped', 'error'].includes(source.scan.status) ? source.scan.reason ?? source.scan.status
          : !['blocked', 'needs_setup'].includes(source.scan.status) ? `status_${source.scan.status}`
            : 'missing_ranked_root_cause'
    }));
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
        type: source.clone.classification?.type ?? 'collection_error',
        sourceId: source.id,
        project: source.source.fullName,
        evidence: source.clone.classification?.evidence ?? source.clone.reason ?? source.clone.status,
        recommendation: source.clone.classification?.recommendation
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
  const scorecard = buildScorecard(sources);

  return {
    schemaVersion: '1.0-failure-dataset-review',
    tool: { name: 'SetupLens', version: VERSION },
    generatedAt: options.now ?? new Date().toISOString(),
    input,
    datasetGeneratedAt: dataset.generatedAt ?? null,
    summary: summarizeReview(sources),
    scorecard,
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

export async function promoteFailureDataset(options = {}) {
  const input = options.input ? path.resolve(options.input) : null;
  const dataset = options.dataset ?? JSON.parse(await fs.readFile(input, 'utf8'));
  const sources = asArray(dataset.sources);
  const candidates = sources
    .filter((source) => ['blocked', 'needs_setup'].includes(source.scan?.status) && source.scan?.rootCauseTypes?.length > 0)
    .map(promotionCandidate)
    .sort((left, right) => {
      const priority = { high: 0, medium: 1, review: 2 };
      return priority[promotionPriority(left)] - priority[promotionPriority(right)] || left.id.localeCompare(right.id);
    });
  const drafts = candidates.map(buildPromotionDraft);
  const rejections = buildPromotionRejections(sources);
  return {
    schemaVersion: '1.0-failure-dataset-promotion',
    tool: { name: 'SetupLens', version: VERSION },
    generatedAt: options.now ?? new Date().toISOString(),
    input,
    datasetGeneratedAt: dataset.generatedAt ?? null,
    summary: {
      sources: sources.length,
      eligible: candidates.length,
      drafted: drafts.length,
      highPriority: drafts.filter((draft) => draft.priority === 'high').length,
      rejected: rejections.length
    },
    policy: {
      purpose: 'Create reviewable corpus case drafts from public failure-dataset scan evidence.',
      safety: 'Drafts intentionally keep fixture.files empty until a human sanitizes and minimizes the public project evidence.',
      commitRule: 'Commit only sanitized minimal fixtures, not cloned third-party repository contents.'
    },
    drafts,
    rejections,
    nextActions: [
      'Open the highest-priority draft and reproduce it at the recorded commit.',
      'Minimize and sanitize the file tree before copying it into docs/failure-corpus/cases.json.',
      'Run npm run corpus and npm test after promotion.',
      'Keep the original public source manifest as provenance for later review.'
    ]
  };
}

function assertDatasetCachePath(target) {
  const resolved = path.resolve(target);
  const parts = resolved.split(path.sep).map((part) => part.toLowerCase());
  if (parts.includes('.setuplens') && parts.includes('failure-dataset')) return resolved;
  throw new Error(`Refusing to clean a path outside .setuplens/failure-dataset: ${target}`);
}

async function countCacheEntries(root) {
  const stats = { files: 0, directories: 0 };
  if (!await pathExists(root)) return stats;
  async function walk(directory) {
    let entries = [];
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        stats.directories += 1;
        await walk(absolute);
      } else {
        stats.files += 1;
      }
      if (stats.files + stats.directories > 50000) return;
    }
  }
  await walk(root);
  return stats;
}

export async function cleanFailureDataset(options = {}) {
  const started = performance.now();
  const reposDir = assertDatasetCachePath(options.reposDir ?? path.join(DEFAULT_ROOT, 'repos'));
  const reportsDir = assertDatasetCachePath(options.reportsDir ?? path.join(DEFAULT_ROOT, 'reports'));
  const includeReports = options.includeReports === true;
  const reposBefore = await countCacheEntries(reposDir);
  const reportsBefore = includeReports ? await countCacheEntries(reportsDir) : { files: 0, directories: 0 };
  const reposExisted = await pathExists(reposDir);
  const reportsExisted = includeReports && await pathExists(reportsDir);

  await fs.rm(reposDir, { recursive: true, force: true });
  if (includeReports) await fs.rm(reportsDir, { recursive: true, force: true });

  return {
    schemaVersion: '1.0-failure-dataset-clean',
    tool: { name: 'SetupLens', version: VERSION },
    generatedAt: options.now ?? new Date().toISOString(),
    durationMs: Math.max(1, Math.round(performance.now() - started)),
    policy: {
      safety: 'Only paths under .setuplens/failure-dataset are eligible for cleanup.',
      retained: includeReports
        ? 'Source manifests outside the cleaned directories are retained.'
        : 'Per-repository reports and source manifests are retained; only cloned repositories were removed.'
    },
    summary: {
      reposDir,
      reposRemoved: reposExisted,
      reposFiles: reposBefore.files,
      reposDirectories: reposBefore.directories,
      reportsDir,
      reportsRemoved: reportsExisted,
      reportsFiles: reportsBefore.files,
      reportsDirectories: reportsBefore.directories,
      includeReports
    }
  };
}
