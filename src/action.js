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

await append(process.env.GITHUB_OUTPUT, `score=${report.score}\n`);
await append(process.env.GITHUB_STEP_SUMMARY, `## SetupLens ${report.score}/100 (${report.grade})\n\n`);
await append(process.env.GITHUB_STEP_SUMMARY, `- ${report.summary.fail} failed\n- ${report.summary.warn} warnings\n- ${report.summary.pass} passed\n- ${report.durationMs} ms\n\n`);

const actions = report.findings.filter((item) => item.recommendation && ['fail', 'warn'].includes(item.status)).slice(0, 6);
if (actions.length > 0) {
  await append(process.env.GITHUB_STEP_SUMMARY, '### Next actions\n\n');
  for (const item of actions) await append(process.env.GITHUB_STEP_SUMMARY, `- ${item.recommendation}\n`);
}

console.log(`SetupLens score: ${report.score}/100 (${report.grade})`);
console.log(`HTML report: ${reportPath}`);
if (report.score < threshold) {
  console.error(`Readiness score is below the required threshold of ${threshold}.`);
  process.exitCode = 1;
}
