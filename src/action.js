import fs from 'node:fs/promises';
import path from 'node:path';
import { scan } from './scan.js';
import { renderHtml } from './reporters/html.js';

async function append(file, value) {
  if (file) await fs.appendFile(file, value, 'utf8');
}

const target = process.env.INPUT_PATH || '.';
const threshold = Number(process.env.INPUT_THRESHOLD || 70);
const report = await scan(target);
const reportPath = path.resolve('setuplens-report.html');
await fs.writeFile(reportPath, renderHtml(report), 'utf8');

const scoreLabel = report.scorable ? `${report.score}/100 (${report.grade})` : 'Not scored';
await append(process.env.GITHUB_OUTPUT, `score=${report.scorable ? report.score : ''}\n`);
await append(process.env.GITHUB_OUTPUT, `status=${report.scoreStatus}\n`);
await append(process.env.GITHUB_OUTPUT, `startup_status=${report.startup.status}\n`);
await append(process.env.GITHUB_STEP_SUMMARY, `## SetupLens readiness ${scoreLabel}\n\n`);
if (!report.scorable) await append(process.env.GITHUB_STEP_SUMMARY, `- ${report.scoreMessage}\n`);
await append(process.env.GITHUB_STEP_SUMMARY, `- Startup verdict: ${report.startup.status} - ${report.startup.summary}\n`);
await append(process.env.GITHUB_STEP_SUMMARY, `- Setup: ${report.scopes.setup.summary.fail} failed, ${report.scopes.setup.summary.warn} warnings, ${report.scopes.setup.summary.pass} passed\n`);
await append(process.env.GITHUB_STEP_SUMMARY, `- Hygiene: ${report.scopes.hygiene.summary.fail} failed, ${report.scopes.hygiene.summary.warn} warnings, ${report.scopes.hygiene.summary.pass} passed\n`);
await append(process.env.GITHUB_STEP_SUMMARY, `- ${report.durationMs} ms\n\n`);

const actions = [
  ...report.startup.blockers,
  ...report.startup.risks,
  ...report.startup.warnings
]
  .filter((item) => item.recommendation)
  .slice(0, 6);
if (actions.length > 0) {
  await append(process.env.GITHUB_STEP_SUMMARY, '### Next actions\n\n');
  for (const item of actions) await append(process.env.GITHUB_STEP_SUMMARY, `- ${item.recommendation}\n`);
}

if (report.startup.setupCommands.length > 0 || report.startup.runCommands.length > 0) {
  await append(process.env.GITHUB_STEP_SUMMARY, '\n### Detected commands\n\n');
  for (const item of [...report.startup.setupCommands, ...report.startup.runCommands]) {
    await append(process.env.GITHUB_STEP_SUMMARY, `- \`${item.command}\` - ${item.reason}\n`);
  }
}

console.log(`SetupLens readiness: ${scoreLabel}`);
console.log(`Startup verdict: ${report.startup.status}`);
console.log(`HTML report: ${reportPath}`);
if (!report.scorable) {
  console.error(`Readiness threshold cannot be evaluated: ${report.scoreMessage}`);
  process.exitCode = 1;
} else if (report.score < threshold) {
  console.error(`Readiness score is below the required threshold of ${threshold}.`);
  process.exitCode = 1;
}
