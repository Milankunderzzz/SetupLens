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
await append(process.env.GITHUB_STEP_SUMMARY, `## SetupLens readiness ${scoreLabel}\n\n`);
if (!report.scorable) await append(process.env.GITHUB_STEP_SUMMARY, `- ${report.scoreMessage}\n`);
await append(process.env.GITHUB_STEP_SUMMARY, `- Setup: ${report.scopes.setup.summary.fail} failed, ${report.scopes.setup.summary.warn} warnings, ${report.scopes.setup.summary.pass} passed\n`);
await append(process.env.GITHUB_STEP_SUMMARY, `- Hygiene: ${report.scopes.hygiene.summary.fail} failed, ${report.scopes.hygiene.summary.warn} warnings, ${report.scopes.hygiene.summary.pass} passed\n`);
await append(process.env.GITHUB_STEP_SUMMARY, `- ${report.durationMs} ms\n\n`);

const actions = report.findings
  .filter((item) => item.recommendation && ['fail', 'warn'].includes(item.status))
  .sort((left, right) => Number(left.scope === 'hygiene') - Number(right.scope === 'hygiene'))
  .slice(0, 6);
if (actions.length > 0) {
  await append(process.env.GITHUB_STEP_SUMMARY, '### Next actions\n\n');
  for (const item of actions) await append(process.env.GITHUB_STEP_SUMMARY, `- ${item.recommendation}\n`);
}

console.log(`SetupLens readiness: ${scoreLabel}`);
console.log(`HTML report: ${reportPath}`);
if (!report.scorable) {
  console.error(`Readiness threshold cannot be evaluated: ${report.scoreMessage}`);
  process.exitCode = 1;
} else if (report.score < threshold) {
  console.error(`Readiness score is below the required threshold of ${threshold}.`);
  process.exitCode = 1;
}
