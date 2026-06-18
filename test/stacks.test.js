import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { detectStacks, stackFindings } from '../src/checks/stacks.js';
import { indexRepository } from '../src/lib/files.js';

async function detectFixture(t, files) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'setuplens-stacks-'));
  for (const [relative, contents] of Object.entries(files)) {
    const absolute = path.join(root, relative);
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, contents, 'utf8');
  }
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const index = await indexRepository(root);
  return { index, detection: await detectStacks(index) };
}

test('ranks a root Node application as the primary stack', async (t) => {
  const { detection } = await detectFixture(t, {
    'package.json': JSON.stringify({ dependencies: { express: '1.0.0' } })
  });
  assert.equal(detection.primaryStack, 'node');
  assert.deepEqual(detection.stacks, ['node']);
});

test('does not mistake Laravel frontend tooling for the primary stack', async (t) => {
  const { index, detection } = await detectFixture(t, {
    'composer.json': JSON.stringify({ require: { php: '^8.2' } }),
    'package.json': JSON.stringify({ private: true, devDependencies: { vite: '^7.0.0' }, scripts: { build: 'vite build' } })
  });
  const stackFinding = stackFindings(index, detection)[0];
  assert.equal(detection.primaryStack, 'php');
  assert.deepEqual(detection.stacks, ['node']);
  assert.equal(detection.stackEvidence.find((item) => item.name === 'node').role, 'supporting');
  assert.equal(stackFinding.status, 'warn');
  assert.match(stackFinding.message, /Primary stack appears to be php/);
});

test('ignores an example Dockerfile when Dart is the root project', async (t) => {
  const { detection } = await detectFixture(t, {
    'pubspec.yaml': 'name: sample_app\n',
    'examples/container/Dockerfile': 'FROM scratch\n'
  });
  assert.equal(detection.primaryStack, 'dart');
  assert.deepEqual(detection.stacks, []);
  assert.equal(detection.stackEvidence.find((item) => item.name === 'docker').role, 'incidental');
});

test('ignores test-only Python and Go manifests in a Rust project', async (t) => {
  const { detection } = await detectFixture(t, {
    'Cargo.toml': '[package]\nname = "demo"\n',
    'tests/fixtures/python/requirements.txt': 'pytest\n',
    'tests/fixtures/go/go.mod': 'module example.test/demo\n'
  });
  assert.equal(detection.primaryStack, 'rust');
  assert.deepEqual(detection.stacks, ['rust']);
});

test('recognizes a package.json workspace as a primary Node monorepo', async (t) => {
  const { detection } = await detectFixture(t, {
    'package.json': JSON.stringify({ private: true, workspaces: ['packages/*'] }),
    'packages/a/package.json': JSON.stringify({ dependencies: { a: '1.0.0' } }),
    'packages/b/package.json': JSON.stringify({ dependencies: { b: '1.0.0' } })
  });
  assert.equal(detection.primaryStack, 'node');
  assert.equal(detection.workspace.members.length, 2);
  assert.deepEqual(detection.workspace.patterns, ['packages/*']);
});

test('ranks root Compose evidence above a nested Node service', async (t) => {
  const { detection } = await detectFixture(t, {
    'compose.yaml': 'services:\n  api:\n    build: ./services/api\n',
    'services/api/package.json': JSON.stringify({ dependencies: { express: '1.0.0' } })
  });
  assert.equal(detection.primaryStack, 'docker');
  assert.equal(detection.stackEvidence.find((item) => item.name === 'node').role, 'supporting');
});

test('does not treat a tooling-only pyproject as a Python application', async (t) => {
  const { detection } = await detectFixture(t, {
    'pyproject.toml': '[tool.ruff]\nline-length = 100\n'
  });
  assert.equal(detection.primaryStack, null);
  assert.deepEqual(detection.stacks, []);
});

test('recognizes project metadata in pyproject as primary Python evidence', async (t) => {
  const { detection } = await detectFixture(t, {
    'pyproject.toml': '[project]\nname = "demo"\nversion = "1.0.0"\n'
  });
  assert.equal(detection.primaryStack, 'python');
  assert.deepEqual(detection.stacks, ['python']);
});

test('records evidence files and primary roles in stack output', async (t) => {
  const { detection } = await detectFixture(t, {
    'package.json': JSON.stringify({ name: 'demo-app', dependencies: { express: '1.0.0' } }),
    'Dockerfile': 'FROM node:22\n'
  });
  const node = detection.stackEvidence.find((item) => item.name === 'node');
  const docker = detection.stackEvidence.find((item) => item.name === 'docker');
  assert.deepEqual(node.files, ['package.json']);
  assert.equal(node.role, 'primary');
  assert.equal(docker.role, 'supporting');
});

test('treats an unnamed root package used for linting as supporting a Cargo project', async (t) => {
  const { detection } = await detectFixture(t, {
    'Cargo.toml': '[workspace]\nmembers = ["crates/*"]\n',
    'package.json': JSON.stringify({ dependencies: { eslint: '^10.0.0' }, scripts: { lint: 'eslint .' } })
  });
  assert.equal(detection.primaryStack, 'rust');
  assert.equal(detection.stackEvidence.find((item) => item.name === 'node').role, 'supporting');
});
