import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { dependencyFindings } from '../src/checks/dependencies.js';
import { detectStacks } from '../src/checks/stacks.js';
import { indexRepository } from '../src/lib/files.js';

async function dependencyFixture(t, files, directories = []) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'setuplens-deps-'));
  for (const [relative, contents] of Object.entries(files)) {
    const absolute = path.join(root, relative);
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, contents, 'utf8');
  }
  for (const relative of directories) await fs.mkdir(path.join(root, relative), { recursive: true });
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const index = await indexRepository(root);
  const detection = await detectStacks(index);
  return { detection, findings: dependencyFindings(index, detection) };
}

const workspaceFiles = {
  'package.json': JSON.stringify({ private: true, workspaces: ['packages/*'] }),
  'package-lock.json': JSON.stringify({ lockfileVersion: 3 }),
  'packages/a/package.json': JSON.stringify({ dependencies: { a: '1.0.0' } }),
  'packages/b/package.json': JSON.stringify({ devDependencies: { b: '1.0.0' } }),
  'packages/c/package.json': JSON.stringify({ optionalDependencies: { c: '1.0.0' } })
};

test('aggregates monorepo dependency state into two root findings', async (t) => {
  const { findings } = await dependencyFixture(t, workspaceFiles);
  const nodeFindings = findings.filter((item) => item.id.startsWith('dependencies.node'));
  assert.equal(nodeFindings.length, 2);
  assert.deepEqual(nodeFindings.map((item) => item.id).sort(), [
    'dependencies.node.workspace-installed',
    'dependencies.node.workspace-lockfile'
  ]);
});

test('uses the root lockfile for every workspace package', async (t) => {
  const { findings } = await dependencyFixture(t, workspaceFiles);
  const lockfile = findings.find((item) => item.id === 'dependencies.node.workspace-lockfile');
  assert.equal(lockfile.status, 'pass');
  assert.match(lockfile.message, /Root package-lock\.json covers 4 workspace packages/);
});

test('emits only one install warning for an uninstalled workspace', async (t) => {
  const { findings } = await dependencyFixture(t, workspaceFiles);
  const warnings = findings.filter((item) => item.status === 'warn' && item.id.startsWith('dependencies.node'));
  assert.equal(warnings.length, 1);
  assert.match(warnings[0].recommendation, /npm install at the workspace root/);
});

test('passes workspace installation when root node_modules exists', async (t) => {
  const { findings } = await dependencyFixture(t, workspaceFiles, ['node_modules']);
  const installed = findings.find((item) => item.id === 'dependencies.node.workspace-installed');
  assert.equal(installed.status, 'pass');
});

test('retains package-level checks outside explicit workspaces', async (t) => {
  const { findings } = await dependencyFixture(t, {
    'package.json': JSON.stringify({ dependencies: { root: '1.0.0' } }),
    'tools/task/package.json': JSON.stringify({ dependencies: { task: '1.0.0' } })
  });
  const nodeFindings = findings.filter((item) => item.id.startsWith('dependencies.node'));
  assert.equal(nodeFindings.length, 4);
  assert.ok(nodeFindings.some((item) => item.id.includes('tools/task/package.json')));
});

test('recognizes object-form npm workspace declarations', async (t) => {
  const { detection } = await dependencyFixture(t, {
    'package.json': JSON.stringify({ private: true, workspaces: { packages: ['apps/*'] } }),
    'apps/web/package.json': JSON.stringify({ dependencies: { vite: '1.0.0' } })
  });
  assert.equal(detection.workspace.members.length, 1);
  assert.deepEqual(detection.workspace.patterns, ['apps/*']);
});

test('recognizes pnpm-workspace.yaml and the root pnpm lockfile', async (t) => {
  const { detection, findings } = await dependencyFixture(t, {
    'package.json': JSON.stringify({ private: true }),
    'pnpm-workspace.yaml': "packages:\n  - 'packages/*'\n",
    'pnpm-lock.yaml': 'lockfileVersion: 9\n',
    'packages/web/package.json': JSON.stringify({ dependencies: { vite: '1.0.0' } })
  });
  assert.equal(detection.workspace.manager, 'pnpm');
  assert.equal(findings.find((item) => item.id === 'dependencies.node.workspace-lockfile').status, 'pass');
});
