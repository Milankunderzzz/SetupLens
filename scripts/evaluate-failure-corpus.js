import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { doctor } from '../src/doctor.js';
import { classifyLog } from '../src/doctor/error-classifier.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_CORPUS = path.resolve(__dirname, '../docs/failure-corpus/cases.json');

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

async function pathExists(file) {
  return fs.access(file).then(() => true, () => false);
}

function renderFile(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'json' in value) return `${JSON.stringify(value.json, null, 2)}\n`;
  if (value && typeof value === 'object' && 'text' in value) return String(value.text);
  throw new Error('Fixture file values must be strings, { "text": "..." }, or { "json": ... }.');
}

async function writeFixture(root, files) {
  for (const [relative, contents] of Object.entries(files ?? {})) {
    if (path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) {
      throw new Error(`Refusing unsafe fixture path: ${relative}`);
    }
    const target = path.join(root, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, renderFile(contents), 'utf8');
  }
}

function hasExpected(values, expected) {
  return values.some((value) => value === expected || value.includes(expected));
}

function checkIncludes(failures, label, actualValues, expectedValues) {
  for (const expected of asArray(expectedValues)) {
    if (!hasExpected(actualValues, expected)) {
      failures.push(`${label} missing "${expected}". Actual: ${actualValues.join(', ') || 'none'}`);
    }
  }
}

function countMatches(actualValues, expectedValues) {
  return asArray(expectedValues).filter((expected) => hasExpected(actualValues, expected)).length;
}

function checkFiles(root, failures, expectedFiles) {
  return Promise.all(asArray(expectedFiles).map(async (item) => {
    const target = path.join(root, item.path);
    if (!await pathExists(target)) {
      failures.push(`Expected file was not created: ${item.path}`);
      return;
    }
    if (item.contains) {
      const text = await fs.readFile(target, 'utf8');
      if (!text.includes(item.contains)) failures.push(`${item.path} does not contain "${item.contains}".`);
    }
  }));
}

function checkLogSamples(testCase, failures) {
  for (const sample of asArray(testCase.logSamples)) {
    const actual = classifyLog(sample.text);
    if (!actual) {
      failures.push(`Log sample "${sample.name}" was not classified.`);
      continue;
    }
    if (sample.expect?.type && actual.type !== sample.expect.type) {
      failures.push(`Log sample "${sample.name}" expected ${sample.expect.type}, got ${actual.type}.`);
    }
    if (sample.expect?.subject && actual.subject !== sample.expect.subject) {
      failures.push(`Log sample "${sample.name}" expected subject ${sample.expect.subject}, got ${actual.subject ?? 'none'}.`);
    }
  }
}

function checkReport(testCase, report, failures) {
  const expect = testCase.expect ?? {};
  if (expect.status && report.status !== expect.status) {
    failures.push(`Expected status ${expect.status}, got ${report.status}.`);
  }

  checkIncludes(
    failures,
    'Adapter',
    report.project.adapters.map((adapter) => adapter.id),
    expect.adapters
  );
  checkIncludes(
    failures,
    'Root cause',
    report.diagnosis.rootCauses.map((cause) => cause.type),
    expect.rootCauseTypes
  );
  checkIncludes(
    failures,
    'Root-cause evidence',
    report.diagnosis.rootCauses.map((cause) => cause.evidence ?? ''),
    expect.rootCauseEvidence
  );
  checkIncludes(
    failures,
    'Next action command',
    report.diagnosis.nextActions.map((action) => action.command ?? ''),
    expect.nextActionCommands
  );
  checkIncludes(
    failures,
    'Next action description',
    report.diagnosis.nextActions.map((action) => action.description ?? ''),
    expect.nextActionDescriptions
  );
  checkIncludes(
    failures,
    'Planned probe',
    report.probes.planned.map((probe) => probe.id),
    expect.probes
  );
  checkIncludes(
    failures,
    'Safe fix title',
    report.diagnosis.fixPlan?.fixes?.filter((fix) => fix.canApply).map((fix) => fix.title) ?? [],
    expect.safeFixTitles
  );
  checkIncludes(
    failures,
    'Manual fix title',
    report.diagnosis.fixPlan?.fixes?.filter((fix) => !fix.canApply).map((fix) => fix.title) ?? [],
    expect.manualFixTitles
  );
}

export async function loadCorpus(corpusPath = DEFAULT_CORPUS) {
  const raw = await fs.readFile(corpusPath, 'utf8');
  const corpus = JSON.parse(raw);
  if (corpus.schemaVersion !== '1.0') throw new Error(`Unsupported failure corpus schema: ${corpus.schemaVersion}`);
  if (!Array.isArray(corpus.cases)) throw new Error('Failure corpus must contain a cases array.');
  return corpus;
}

export async function evaluateCase(testCase, options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `setuplens-corpus-${testCase.id}-`));
  const failures = [];
  try {
    await writeFixture(root, testCase.fixture?.files ?? {});
    const report = await doctor(root, { timeoutMs: options.timeoutMs ?? 3000 });
    checkReport(testCase, report, failures);
    checkLogSamples(testCase, failures);
    const expectedRootCauses = asArray(testCase.expect?.rootCauseTypes);
    const actualRootCauses = report.diagnosis.rootCauses.map((cause) => cause.type);
    const expectedSafeFixes = asArray(testCase.expect?.safeFixTitles);
    const actualSafeFixes = report.diagnosis.fixPlan?.fixes?.filter((fix) => fix.canApply).map((fix) => fix.title) ?? [];
    const falseBlocker = testCase.expect?.status !== 'blocked' && report.status === 'blocked';

    if (testCase.expect?.applySafe) {
      await doctor(root, { timeoutMs: options.timeoutMs ?? 3000, apply: 'safe' });
      await checkFiles(root, failures, testCase.expect.createdFiles);
    }

    return {
      id: testCase.id,
      ecosystems: testCase.ecosystems,
      source: testCase.source,
      passed: failures.length === 0,
      failures,
      status: report.status,
      metrics: {
        expectedRootCauses: expectedRootCauses.length,
        matchedRootCauses: countMatches(actualRootCauses, expectedRootCauses),
        firstRootCauseExpected: expectedRootCauses[0] ?? null,
        firstRootCauseActual: actualRootCauses[0] ?? null,
        firstRootCauseHit: expectedRootCauses.length === 0 ? null : actualRootCauses[0] === expectedRootCauses[0],
        expectedSafeFixes: expectedSafeFixes.length,
        matchedSafeFixes: countMatches(actualSafeFixes, expectedSafeFixes),
        falseBlocker
      }
    };
  } finally {
    if (!options.keep) await fs.rm(root, { recursive: true, force: true });
  }
}

function percent(numerator, denominator) {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function buildMetrics(results) {
  const rootExpected = results.reduce((total, result) => total + result.metrics.expectedRootCauses, 0);
  const rootMatched = results.reduce((total, result) => total + result.metrics.matchedRootCauses, 0);
  const firstEligible = results.filter((result) => result.metrics.firstRootCauseHit !== null);
  const firstHits = firstEligible.filter((result) => result.metrics.firstRootCauseHit).length;
  const safeExpected = results.reduce((total, result) => total + result.metrics.expectedSafeFixes, 0);
  const safeMatched = results.reduce((total, result) => total + result.metrics.matchedSafeFixes, 0);
  const falseBlockers = results.filter((result) => result.metrics.falseBlocker);
  const ecosystemCounts = new Map();
  const ecosystemPassCounts = new Map();
  for (const result of results) {
    for (const ecosystem of result.ecosystems) {
      ecosystemCounts.set(ecosystem, (ecosystemCounts.get(ecosystem) ?? 0) + 1);
      if (result.passed) ecosystemPassCounts.set(ecosystem, (ecosystemPassCounts.get(ecosystem) ?? 0) + 1);
    }
  }
  const ecosystemCoverage = [...ecosystemCounts.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([ecosystem, cases]) => ({
      ecosystem,
      cases,
      passed: ecosystemPassCounts.get(ecosystem) ?? 0
    }));

  return {
    cases: results.length,
    passed: results.filter((result) => result.passed).length,
    diagnosticHitRate: percent(rootMatched, rootExpected),
    rootCauseFirstRate: percent(firstHits, firstEligible.length),
    safeFixGenerationRate: percent(safeMatched, safeExpected),
    falseBlockerCount: falseBlockers.length,
    falseBlockerRate: percent(falseBlockers.length, results.length),
    ecosystemCoverage
  };
}

export async function evaluateCorpus(options = {}) {
  const corpus = await loadCorpus(options.corpusPath ?? DEFAULT_CORPUS);
  const selected = options.caseId
    ? corpus.cases.filter((testCase) => testCase.id === options.caseId)
    : corpus.cases;
  if (options.caseId && selected.length === 0) throw new Error(`Unknown failure corpus case: ${options.caseId}`);

  const results = [];
  for (const testCase of selected) results.push(await evaluateCase(testCase, options));
  return { corpus, results, metrics: buildMetrics(results), passed: results.every((result) => result.passed) };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--case') {
      options.caseId = argv[index + 1];
      index += 1;
    } else if (arg === '--keep') {
      options.keep = true;
    } else if (arg === '--corpus') {
      options.corpusPath = path.resolve(argv[index + 1]);
      index += 1;
    } else if (arg === '--format') {
      options.format = argv[index + 1];
      index += 1;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

if (process.argv[1] === __filename) {
  const options = parseArgs(process.argv.slice(2));
  const { results, metrics, passed } = await evaluateCorpus(options);
  if (options.format === 'json') {
    process.stdout.write(`${JSON.stringify({ passed, metrics, results }, null, 2)}\n`);
    if (!passed) process.exitCode = 1;
  } else {
  for (const result of results) {
    const mark = result.passed ? 'PASS' : 'FAIL';
    process.stdout.write(`${mark} ${result.id} (${result.ecosystems.join(', ')}) -> ${result.status}\n`);
    for (const failure of result.failures) process.stdout.write(`  - ${failure}\n`);
  }
    process.stdout.write('\nMetrics\n');
    process.stdout.write(`  Diagnostic hit rate: ${metrics.diagnosticHitRate ?? 'n/a'}%\n`);
    process.stdout.write(`  Root cause first: ${metrics.rootCauseFirstRate ?? 'n/a'}%\n`);
    process.stdout.write(`  Safe fix generation: ${metrics.safeFixGenerationRate ?? 'n/a'}%\n`);
    process.stdout.write(`  False blockers: ${metrics.falseBlockerCount} (${metrics.falseBlockerRate ?? 'n/a'}%)\n`);
    process.stdout.write(`  Ecosystems: ${metrics.ecosystemCoverage.map((item) => `${item.ecosystem}:${item.cases}`).join(', ')}\n`);
    process.stdout.write(`\nFailure corpus: ${metrics.passed}/${metrics.cases} passed\n`);
  if (!passed) process.exitCode = 1;
  }
}
