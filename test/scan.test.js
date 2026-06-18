import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { scan } from '../src/scan.js';
import { renderHtml } from '../src/reporters/html.js';
import { renderTerminal } from '../src/reporters/terminal.js';

async function fixture(files) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'setuplens-'));
  await Promise.all(Object.entries(files).map(async ([relative, contents]) => {
    const absolute = path.join(root, relative);
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, contents, 'utf8');
  }));
  return root;
}

test('detects missing dependencies, paths, configuration, and credentials', async (t) => {
  const root = await fixture({
    'package.json': JSON.stringify({ engines: { node: '>=18.17' }, dependencies: { demo: '1.0.0' }, scripts: { test: 'node --test' } }),
    '.env.example': 'DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DB\nJWT_SECRET_KEY=replace-me\n',
    '.gitignore': '.env\nnode_modules\n',
    'docker-compose.yml': 'services:\n  api:\n    build:\n      context: .\n      dockerfile: missing/Dockerfile\n',
    'config.js': 'export const JWT_SECRET_KEY = "this-is-a-real-looking-secret";\n', // setuplens: allow-secret
    'README.md': '# Fixture\n\n## Install\n',
    'LICENSE': 'MIT'
  });
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const report = await scan(root);
  const ids = new Map(report.findings.map((item) => [item.id, item]));

  assert.equal(ids.get('security.secret-scan').status, 'fail');
  assert.equal(ids.get('configuration.env.missing..env.example').status, 'warn');
  assert.equal(ids.get('paths.compose.docker-compose.yml').status, 'fail');
  assert.match(renderTerminal(report, { color: false }), /Values are never printed/);
  assert.doesNotMatch(renderTerminal(report, { color: false }), /this-is-a-real-looking-secret/);
  assert.ok(report.score < 90);
});

test('explains how to create a missing local environment file', async (t) => {
  const root = await fixture({
    '.env.example': 'DATABASE_URL=postgresql://localhost/app\nAPI_TOKEN=replace-me\n',
    '.gitignore': '.env\n.env.local\n',
    'README.md': '# Missing env fixture\n'
  });
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const report = await scan(root);
  const finding = report.findings.find((item) => item.id === 'configuration.env.missing..env.example');

  assert.equal(finding.status, 'warn');
  assert.equal(finding.message, 'No local environment file was found for 2 documented variables.');
  assert.equal(finding.evidence, 'Expected .env or .env.local');
  assert.match(finding.recommendation, /Copy \.env\.example/);
  assert.doesNotMatch(JSON.stringify(finding), /replace-me/);
});

test('names available npm scripts when a Makefile command is invalid', async (t) => {
  const root = await fixture({
    'apps/web/package.json': JSON.stringify({ scripts: { dev: 'vite', test: 'node --test' } }),
    'Makefile': 'start:\n\tcd apps/web && npm run build\n',
    'README.md': '# Missing npm script fixture\n'
  });
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const report = await scan(root);
  const finding = report.findings.find((item) => item.id === 'paths.makefile.Makefile');

  assert.equal(finding.status, 'fail');
  assert.equal(finding.message, '1 Makefile command is invalid.');
  assert.match(finding.evidence, /line 2: npm run build/);
  assert.match(finding.evidence, /apps\/web\/package\.json/);
  assert.match(finding.evidence, /available scripts: dev, test/);
});

test('produces a self-contained escaped HTML report', async (t) => {
  const root = await fixture({
    'package.json': JSON.stringify({ name: '<unsafe>', scripts: { test: 'node --test' } }),
    'package-lock.json': JSON.stringify({ lockfileVersion: 3 }),
    '.gitignore': '.env\nnode_modules\n',
    'README.md': '# <unsafe>',
    'LICENSE': 'MIT',
    '.github/workflows/ci.yml': 'name: CI',
    'test/smoke.test.js': '// setuplens: allow-secret\nconst example = "JWT_SECRET_KEY = \\"fixture-secret-value\\"";\nexport { example };'
  });
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const report = await scan(root);
  const html = renderHtml(report);
  assert.match(html, /<!doctype html>/);
  assert.match(html, /No repository data was uploaded/);
  assert.doesNotMatch(html, /<script/i);
});

test('loads only explicitly requested plugins', async (t) => {
  const root = await fixture({
    'README.md': '# Plugin fixture',
    'plugin.mjs': 'export default { name: "demo", run: async () => [{ id: "rule", status: "pass", title: "Demo rule", message: "Works" }] };'
  });
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const withoutPlugin = await scan(root);
  const withPlugin = await scan(root, { plugins: [path.join(root, 'plugin.mjs')] });
  assert.equal(withoutPlugin.plugins.length, 0);
  assert.deepEqual(withPlugin.plugins, ['demo']);
  assert.ok(withPlugin.findings.some((item) => item.id === 'plugin.demo.rule'));
});
