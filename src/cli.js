import fs from 'node:fs/promises';
import path from 'node:path';
import { VERSION } from './constants.js';
import { scan } from './scan.js';
import { renderHtml } from './reporters/html.js';
import { renderJson } from './reporters/json.js';
import { renderTerminal } from './reporters/terminal.js';

const HELP = `SetupLens ${VERSION}
Know why a repository will not run, in one command and under 30 seconds.

Usage:
  setuplens scan [path] [options]
  setuplens [path] [options]

Options:
  --format <terminal|json|html>  Output format (default: terminal)
  -o, --output <file>           Write the report to a file
  --threshold <0-100>           Exit nonzero when lower or not scorable
  --plugin <file>               Load a trusted local plugin (repeatable)
  --no-color                    Disable terminal colors
  -h, --help                    Show help
  -v, --version                 Show version

Examples:
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
  if (args[0] === 'scan') args.shift();
  const options = { format: 'terminal', output: null, threshold: null, plugins: [], color: true, target: '.' };
  let targetSet = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '-h' || arg === '--help') return { help: true };
    if (arg === '-v' || arg === '--version') return { version: true };
    if (arg === '--no-color') { options.color = false; continue; }
    if (arg === '--format') { options.format = valueAfter(args, index, arg); index += 1; continue; }
    if (arg === '-o' || arg === '--output') { options.output = valueAfter(args, index, arg); index += 1; continue; }
    if (arg === '--threshold') { options.threshold = Number(valueAfter(args, index, arg)); index += 1; continue; }
    if (arg === '--plugin') { options.plugins.push(valueAfter(args, index, arg)); index += 1; continue; }
    if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    if (targetSet) throw new Error(`Unexpected argument: ${arg}`);
    options.target = arg;
    targetSet = true;
  }

  if (!['terminal', 'json', 'html'].includes(options.format)) throw new Error(`Unsupported format: ${options.format}`);
  if (options.threshold !== null && (!Number.isFinite(options.threshold) || options.threshold < 0 || options.threshold > 100)) {
    throw new Error('--threshold must be between 0 and 100.');
  }
  if (!options.output && options.format === 'html') options.output = 'setuplens-report.html';
  return options;
}

export async function main(argv) {
  const options = parseArguments(argv);
  if (options.help) { process.stdout.write(HELP); return; }
  if (options.version) { process.stdout.write(`${VERSION}\n`); return; }

  const report = await scan(options.target, { plugins: options.plugins });
  const rendered = options.format === 'json'
    ? renderJson(report)
    : options.format === 'html'
      ? renderHtml(report)
      : renderTerminal(report, { color: options.color });

  if (options.output) {
    const output = path.resolve(options.output);
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, rendered, 'utf8');
    process.stdout.write(`${renderTerminal(report, { color: options.color })}\nReport written to ${output}\n`);
  } else {
    process.stdout.write(rendered);
  }

  if (options.threshold !== null) {
    if (!report.scorable) process.exitCode = 2;
    else if (report.score < options.threshold) process.exitCode = 1;
  }
}
