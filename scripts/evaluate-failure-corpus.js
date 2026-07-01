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
      status: report.status
    };
  } finally {
    if (!options.keep) await fs.rm(root, { recursive: true, force: true });
  }
}

export async function evaluateCorpus(options = {}) {
  const corpus = await loadCorpus(options.corpusPath ?? DEFAULT_CORPUS);
  const selected = options.caseId
    ? corpus.cases.filter((testCase) => testCase.id === options.caseId)
    : corpus.cases;
  if (options.caseId && selected.length === 0) throw new Error(`Unknown failure corpus case: ${options.caseId}`);

  const results = [];
  for (const testCase of selected) results.push(await evaluateCase(testCase, options));
  return { corpus, results, passed: results.every((result) => result.passed) };
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
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

if (process.argv[1] === __filename) {
  const options = parseArgs(process.argv.slice(2));
  const { results, passed } = await evaluateCorpus(options);
  for (const result of results) {
    const mark = result.passed ? 'PASS' : 'FAIL';
    process.stdout.write(`${mark} ${result.id} (${result.ecosystems.join(', ')}) -> ${result.status}\n`);
    for (const failure of result.failures) process.stdout.write(`  - ${failure}\n`);
  }
  process.stdout.write(`\nFailure corpus: ${results.filter((result) => result.passed).length}/${results.length} passed\n`);
  if (!passed) process.exitCode = 1;
}
