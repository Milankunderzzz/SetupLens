import fs from 'node:fs/promises';
import path from 'node:path';
import { VERSION } from './constants.js';
import { doctor } from './doctor.js';
import { doctorSuite } from './doctor-suite.js';
import { scan } from './scan.js';
import { renderDoctorTerminal } from './reporters/doctor-terminal.js';
import { renderDoctorHtml } from './reporters/doctor-html.js';
import { renderDoctorSuiteTerminal } from './reporters/doctor-suite-terminal.js';
import { renderHtml } from './reporters/html.js';
import { renderJson } from './reporters/json.js';
import { renderTerminal } from './reporters/terminal.js';

const HELP = `SetupLens ${VERSION}
Diagnose why unfamiliar repositories fail to install, configure, or start.

Usage:
  setuplens doctor [path] [options]
  setuplens doctor-suite [path] [options]
  setuplens scan [path] [options]
  setuplens [path] [options]

Options:
  --format <terminal|json|html>  Output format (default: terminal)
  -o, --output <file>           Write the report to a file
  --probe                       Run adapter probes and classify command failures
  --probe-startup               Also run long-running startup probes
  --timeout <ms>                Probe timeout in milliseconds (default: 8000)
  --fix-plan                    Show safe and manual repair candidates
  --apply <safe>                Apply only whitelisted safe local fixes
  --threshold <0-100>           Exit 1 when lower, 2 when not scorable
  --plugin <file>               Load a trusted local plugin (repeatable)
  --no-color                    Disable terminal colors
  --show-all                    Print pass, info, and hygiene details
  -h, --help                    Show help
  -v, --version                 Show version

Examples:
  setuplens doctor .
  setuplens doctor . --probe
  setuplens doctor-suite ./repos --format json
  setuplens scan .
  setuplens scan . --format html -o setuplens-report.html
  setuplens scan . --format json --threshold 80
`;

function valueAfter(args, index, option) {
  const value = args[index + 1];
  if (!value || value.startsWith('-')) throw new Error(`${option} requires a value.`);
  return value;
}

function parseArguments(argv) {
  const args = [...argv];
  const command = ['doctor', 'doctor-suite', 'scan'].includes(args[0]) ? args.shift() : 'scan';
  const options = {
    command,
    format: 'terminal',
    output: null,
    threshold: null,
    plugins: [],
    color: true,
    showAll: false,
    probe: false,
    probeStartup: false,
    timeoutMs: 8000,
    timeoutSet: false,
    fixPlan: false,
    apply: null,
    target: '.'
  };
  let targetSet = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '-h' || arg === '--help') return { help: true };
    if (arg === '-v' || arg === '--version') return { version: true };
    if (arg === '--no-color') { options.color = false; continue; }
    if (arg === '--show-all') { options.showAll = true; continue; }
    if (arg === '--probe') { options.probe = true; continue; }
    if (arg === '--probe-startup') { options.probe = true; options.probeStartup = true; continue; }
    if (arg === '--fix-plan') { options.fixPlan = true; continue; }
    if (arg === '--format') { options.format = valueAfter(args, index, arg); index += 1; continue; }
    if (arg === '-o' || arg === '--output') { options.output = valueAfter(args, index, arg); index += 1; continue; }
    if (arg === '--timeout') { options.timeoutMs = Number(valueAfter(args, index, arg)); options.timeoutSet = true; index += 1; continue; }
    if (arg === '--apply') { options.apply = valueAfter(args, index, arg); index += 1; continue; }
    if (arg === '--threshold') { options.threshold = Number(valueAfter(args, index, arg)); index += 1; continue; }
    if (arg === '--plugin') { options.plugins.push(valueAfter(args, index, arg)); index += 1; continue; }
    if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    if (targetSet) throw new Error(`Unexpected argument: ${arg}`);
    options.target = arg;
    targetSet = true;
  }

  if (!['terminal', 'json', 'html'].includes(options.format)) throw new Error(`Unsupported format: ${options.format}`);
  if (options.command === 'doctor-suite' && options.format === 'html') {
    throw new Error('doctor-suite reports currently support terminal and json output.');
  }
  if (options.threshold !== null && (!Number.isFinite(options.threshold) || options.threshold < 0 || options.threshold > 100)) {
    throw new Error('--threshold must be between 0 and 100.');
  }
  if (options.command === 'scan' && options.probe) {
    throw new Error('--probe is only available with doctor. Use: setuplens doctor [path] --probe');
  }
  if (options.command === 'scan' && options.probeStartup) {
    throw new Error('--probe-startup is only available with doctor. Use: setuplens doctor [path] --probe --probe-startup');
  }
  if (options.command === 'scan' && options.timeoutSet) {
    throw new Error('--timeout is only available with doctor probes. Use: setuplens doctor [path] --probe --timeout <ms>');
  }
  if (options.command !== 'doctor' && options.fixPlan) {
    throw new Error('--fix-plan is only available with doctor. Use: setuplens doctor [path] --fix-plan');
  }
  if (options.command !== 'doctor' && options.apply) {
    throw new Error('--apply is only available with doctor. Use: setuplens doctor [path] --apply safe');
  }
  if (options.apply !== null && options.apply !== 'safe') throw new Error('--apply currently only accepts "safe".');
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 1000 || options.timeoutMs > 120000) {
    throw new Error('--timeout must be between 1000 and 120000 milliseconds.');
  }
  if (!options.output && options.format === 'html') options.output = options.command === 'doctor' ? 'setuplens-doctor.html' : 'setuplens-report.html';
  return options;
}

async function runCommand(options) {
  if (options.command === 'doctor') {
    return doctor(options.target, {
      plugins: options.plugins,
      probe: options.probe,
      probeStartup: options.probeStartup,
      timeoutMs: options.timeoutMs,
      apply: options.apply
    });
  }
  if (options.command === 'doctor-suite') {
    return doctorSuite(options.target, {
      plugins: options.plugins,
      probe: options.probe,
      probeStartup: options.probeStartup,
      timeoutMs: options.timeoutMs
    });
  }
  return scan(options.target, { plugins: options.plugins });
}

function renderReport(report, options) {
  if (options.format === 'json') return renderJson(report);
  if (options.format === 'html' && options.command === 'doctor') return renderDoctorHtml(report);
  if (options.format === 'html') return renderHtml(report);
  if (options.command === 'doctor') {
    return renderDoctorTerminal(report, { color: options.color, showFixPlan: options.fixPlan || options.apply === 'safe' });
  }
  if (options.command === 'doctor-suite') return renderDoctorSuiteTerminal(report, { color: options.color });
  return renderTerminal(report, { color: options.color, showAll: options.showAll });
}

export async function main(argv) {
  const options = parseArguments(argv);
  if (options.help) { process.stdout.write(HELP); return; }
  if (options.version) { process.stdout.write(`${VERSION}\n`); return; }

  const report = await runCommand(options);
  const rendered = renderReport(report, options);

  if (options.output) {
    const output = path.resolve(options.output);
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, rendered, 'utf8');
    const terminal = renderReport(report, { ...options, format: 'terminal' });
    process.stdout.write(`${terminal}\nReport written to ${output}\n`);
  } else {
    process.stdout.write(rendered);
  }

  if (options.command === 'scan' && options.threshold !== null) {
    if (!report.scorable) process.exitCode = 2;
    else if (report.score < options.threshold) process.exitCode = 1;
  }
}
