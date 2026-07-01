import fs from 'node:fs/promises';
import path from 'node:path';
import { VERSION } from './constants.js';
import { doctor } from './doctor.js';
import { scan } from './scan.js';
import { renderDoctorTerminal } from './reporters/doctor-terminal.js';
import { renderHtml } from './reporters/html.js';
import { renderJson } from './reporters/json.js';
import { renderTerminal } from './reporters/terminal.js';

const HELP = `SetupLens ${VERSION}
Diagnose why unfamiliar repositories fail to install, configure, or start.

Usage:
  setuplens doctor [path] [options]
  setuplens scan [path] [options]
  setuplens [path] [options]

Options:
  --format <terminal|json|html>  Output format (default: terminal)
  -o, --output <file>           Write the report to a file
  --probe                       Run adapter probes and classify command failures
  --timeout <ms>                Probe timeout in milliseconds (default: 8000)
  --threshold <0-100>           Exit 1 when lower, 2 when not scorable
  --plugin <file>               Load a trusted local plugin (repeatable)
  --no-color                    Disable terminal colors
  --show-all                    Print pass, info, and hygiene details
  -h, --help                    Show help
  -v, --version                 Show version

Examples:
  setuplens doctor .
  setuplens doctor . --probe
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
  const command = args[0] === 'doctor' || args[0] === 'scan' ? args.shift() : 'scan';
  const options = {
    command,
    format: 'terminal',
    output: null,
    threshold: null,
    plugins: [],
    color: true,
    showAll: false,
    probe: false,
    timeoutMs: 8000,
    timeoutSet: false,
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
    if (arg === '--format') { options.format = valueAfter(args, index, arg); index += 1; continue; }
    if (arg === '-o' || arg === '--output') { options.output = valueAfter(args, index, arg); index += 1; continue; }
    if (arg === '--timeout') { options.timeoutMs = Number(valueAfter(args, index, arg)); options.timeoutSet = true; index += 1; continue; }
    if (arg === '--threshold') { options.threshold = Number(valueAfter(args, index, arg)); index += 1; continue; }
    if (arg === '--plugin') { options.plugins.push(valueAfter(args, index, arg)); index += 1; continue; }
    if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    if (targetSet) throw new Error(`Unexpected argument: ${arg}`);
    options.target = arg;
    targetSet = true;
  }

  if (!['terminal', 'json', 'html'].includes(options.format)) throw new Error(`Unsupported format: ${options.format}`);
  if (options.command === 'doctor' && options.format === 'html') throw new Error('Doctor reports currently support terminal and json output.');
  if (options.threshold !== null && (!Number.isFinite(options.threshold) || options.threshold < 0 || options.threshold > 100)) {
    throw new Error('--threshold must be between 0 and 100.');
  }
  if (options.command === 'scan' && options.probe) {
    throw new Error('--probe is only available with doctor. Use: setuplens doctor [path] --probe');
  }
  if (options.command === 'scan' && options.timeoutSet) {
    throw new Error('--timeout is only available with doctor probes. Use: setuplens doctor [path] --probe --timeout <ms>');
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 1000 || options.timeoutMs > 120000) {
    throw new Error('--timeout must be between 1000 and 120000 milliseconds.');
  }
  if (!options.output && options.format === 'html') options.output = 'setuplens-report.html';
  return options;
}

export async function main(argv) {
  const options = parseArguments(argv);
  if (options.help) { process.stdout.write(HELP); return; }
  if (options.version) { process.stdout.write(`${VERSION}\n`); return; }

  const report = options.command === 'doctor'
    ? await doctor(options.target, { plugins: options.plugins, probe: options.probe, timeoutMs: options.timeoutMs })
    : await scan(options.target, { plugins: options.plugins });
  const rendered = options.format === 'json'
    ? renderJson(report)
    : options.format === 'html'
      ? renderHtml(report)
      : options.command === 'doctor'
        ? renderDoctorTerminal(report, { color: options.color })
        : renderTerminal(report, { color: options.color, showAll: options.showAll });

  if (options.output) {
    const output = path.resolve(options.output);
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, rendered, 'utf8');
    const terminal = options.command === 'doctor'
      ? renderDoctorTerminal(report, { color: options.color })
      : renderTerminal(report, { color: options.color, showAll: options.showAll });
    process.stdout.write(`${terminal}\nReport written to ${output}\n`);
  } else {
    process.stdout.write(rendered);
  }

  if (options.command === 'scan' && options.threshold !== null) {
    if (!report.scorable) process.exitCode = 2;
    else if (report.score < options.threshold) process.exitCode = 1;
  }
}
