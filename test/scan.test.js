import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { scan } from '../src/scan.js';
import { renderHtml } from '../src/reporters/html.js';
import { renderJson } from '../src/reporters/json.js';
import { renderTerminal } from '../src/reporters/terminal.js';

const cliPath = fileURLToPath(new URL('../bin/setuplens.js', import.meta.url));

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
  assert.equal(report.startup.status, 'blocked');
  assert.ok(report.startup.blockers.some((item) => item.id === 'paths.compose.docker-compose.yml'));
  assert.equal(report.startup.runCommands.some((item) => item.command.includes('docker compose')), false);
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

test('builds a practical startup plan for a Node application', async (t) => {
  const root = await fixture({
    'package.json': JSON.stringify({
      name: 'web-app',
      scripts: { dev: 'vite --host 0.0.0.0', test: 'vitest' },
      dependencies: { vite: '1.0.0' }
    }),
    'README.md': '# Web app\n',
    '.gitignore': 'node_modules\n.env\n'
  });
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const report = await scan(root);
  const terminal = renderTerminal(report, { color: false });

  assert.equal(report.startup.status, 'needs_setup');
  assert.equal(report.startup.setupCommands[0].command, 'npm install');
  assert.equal(report.startup.runCommands[0].command, 'npm run dev');
  assert.match(terminal, /Verdict NEEDS SETUP/);
  assert.match(terminal, /Prepare/);
  assert.match(terminal, /npm install/);
  assert.match(terminal, /Run/);
  assert.match(terminal, /npm run dev/);
  assert.doesNotMatch(terminal, /README \[hygiene \/ Repository\]/);
});

test('detects a Python web app startup path', async (t) => {
  const root = await fixture({
    'requirements.txt': 'flask\n',
    'app.py': 'from flask import Flask\napp = Flask(__name__)\n',
    'README.md': '# Flask app\n',
    '.gitignore': '.venv\n.env\n'
  });
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const report = await scan(root);

  assert.equal(report.primaryStack, 'python');
  assert.equal(report.startup.status, 'needs_setup');
  assert.ok(report.startup.setupCommands.some((item) => item.command === 'python -m venv .venv'));
  assert.ok(report.startup.setupCommands.some((item) => item.command === 'python -m pip install -r requirements.txt'));
  assert.ok(report.startup.runCommands.some((item) => item.command === 'python -m flask --app app run'));
});

test('separates setup readiness from repository hygiene', async (t) => {
  const root = await fixture({
    'package.json': JSON.stringify({ name: 'scope-fixture' })
  });
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const report = await scan(root);
  const ids = new Map(report.findings.map((item) => [item.id, item]));
  const terminal = renderTerminal(report, { color: false, showAll: true });

  assert.equal(report.schemaVersion, '1.2');
  assert.equal(report.score, 100);
  assert.equal(report.scopes.setup.score, 100);
  assert.equal(report.scopes.hygiene.score, 81);
  assert.equal(report.scopes.hygiene.summary.fail, 1);
  assert.equal(report.scopes.hygiene.summary.warn, 4);
  assert.equal(report.summary.fail, 0);
  assert.equal(report.allSummary.fail, 1);
  assert.equal(ids.get('repository.readme').scope, 'hygiene');
  assert.equal(ids.get('repository.index-limit').scope, 'setup');
  assert.match(terminal, /Score\s+100\/100 A.*setup readiness/);
  assert.match(terminal, /Setup\s+0 failed\s+0 warnings/);
  assert.match(terminal, /Hygiene\s+1 failed\s+4 warnings/);
  assert.match(terminal, /README \[hygiene \/ Repository\]/);
});

test('does not score an unsupported C++ repository', async (t) => {
  const root = await fixture({
    'CMakeLists.txt': 'cmake_minimum_required(VERSION 3.20)\nproject(hello)\nadd_executable(hello main.cpp)\n',
    'main.cpp': '#include <iostream>\nint main() { std::cout << "hello"; }\n'
  });
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const report = await scan(root);
  const terminal = renderTerminal(report, { color: false });
  const html = renderHtml(report);
  const json = JSON.parse(renderJson(report));
  const cli = spawnSync(process.execPath, [cliPath, 'scan', root, '--threshold', '80', '--no-color'], {
    encoding: 'utf8',
    windowsHide: true
  });

  assert.equal(report.primaryStack, 'c++');
  assert.equal(report.scorable, false);
  assert.equal(report.scoreStatus, 'not_scored');
  assert.equal(report.notScoredReason, 'unsupported_primary_stack');
  assert.equal(report.score, null);
  assert.equal(report.grade, null);
  assert.equal(report.scopes.setup.score, null);
  assert.equal(json.score, null);
  assert.equal(json.scoreStatus, 'not_scored');
  assert.match(terminal, /Unsupported \/ Not scored/);
  assert.doesNotMatch(terminal, /98\/100 A/);
  assert.match(html, /Not scored/);
  assert.match(html, /Unsupported primary stack: c\+\+/);
  assert.equal(cli.status, 2, cli.stderr);
  assert.match(cli.stdout, /Unsupported \/ Not scored/);
  assert.doesNotMatch(cli.stdout, /98\/100 A/);
});

test('does not score an empty repository', async (t) => {
  const root = await fixture({});
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const report = await scan(root);

  assert.equal(report.scorable, false);
  assert.equal(report.notScoredReason, 'empty_repository');
  assert.equal(report.score, null);
  assert.match(report.scoreMessage, /repository is empty/i);
});

test('does not score a repository with an unknown primary stack', async (t) => {
  const root = await fixture({
    'main.swift': 'print("hello")\n',
    'README.md': '# Swift fixture\n'
  });
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const report = await scan(root);

  assert.equal(report.primaryStack, null);
  assert.equal(report.scorable, false);
  assert.equal(report.notScoredReason, 'primary_stack_not_detected');
  assert.equal(report.score, null);
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
  assert.match(html, /Setup failures/);
  assert.match(html, /Hygiene findings/);
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
  const pluginFinding = withPlugin.findings.find((item) => item.id === 'plugin.demo.rule');
  assert.equal(pluginFinding.scope, 'setup');
});
