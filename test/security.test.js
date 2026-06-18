import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { securityFindings } from '../src/checks/security.js';
import { indexRepository } from '../src/lib/files.js';

async function securityFixture(t, files, track = false) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'setuplens-security-'));
  for (const [relative, contents] of Object.entries(files)) {
    const absolute = path.join(root, relative);
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, contents, 'utf8');
  }
  if (track) {
    const initialized = spawnSync('git', ['init', '-q'], { cwd: root, windowsHide: true });
    assert.equal(initialized.status, 0);
    const added = spawnSync('git', ['add', '-f', '.'], { cwd: root, windowsHide: true });
    assert.equal(added.status, 0);
  }
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const index = await indexRepository(root);
  const findings = await securityFindings(index);
  return new Map(findings.map((item) => [item.id, item]));
}

test('reports a tracked primary environment file', async (t) => {
  const findings = await securityFixture(t, { '.env': 'APP_MODE=local\n' }, true);
  assert.equal(findings.get('security.tracked-env').status, 'fail');
  assert.equal(findings.get('security.tracked-env').evidence, '.env');
});

test('ignores tracked environment files used only as test fixtures', async (t) => {
  const findings = await securityFixture(t, { 'tests/fixtures/app/.env': 'APP_MODE=test\n' }, true);
  assert.equal(findings.get('security.tracked-env').status, 'pass');
  assert.equal(findings.get('security.tracked-env').evidence, null);
});

test('ignores generic secret assignments in documentation', async (t) => {
  const findings = await securityFixture(t, {
    'docs/configuration.py': 'SECRET_KEY = "documented-development-key-123"\n'
  });
  assert.equal(findings.get('security.secret-scan').status, 'pass');
});

test('reports generic secret assignments in primary source', async (t) => {
  const findings = await securityFixture(t, {
    'src/config.js': 'export const API_KEY = "ActualLookingKeyValue123";\n'
  });
  assert.equal(findings.get('security.secret-scan').status, 'fail');
  assert.match(findings.get('security.secret-scan').evidence, /Hardcoded API_KEY at src\/config\.js:1/);
});

test('ignores secret-looking assignments inside Python docstrings', async (t) => {
  const findings = await securityFixture(t, {
    'src/config.py': '"""Example::\n\n    SECRET_KEY = "documented-development-key-123"\n"""\n'
  });
  assert.equal(findings.get('security.secret-scan').status, 'pass');
});

test('does not mistake an OpenAI-like documentation slug for a key', async (t) => {
  const findings = await securityFixture(t, {
    'docs/troubleshooting.md': 'See sk-attached-to-a-different-loop for details.\n'
  });
  assert.equal(findings.get('security.secret-scan').status, 'pass');
});

test('reports a random-looking OpenAI key in primary source', async (t) => {
  const findings = await securityFixture(t, {
    'src/client.js': 'const token = "sk-AbCDefghijklmnopqrstu123456";\n'
  });
  assert.equal(findings.get('security.secret-scan').status, 'fail');
  assert.match(findings.get('security.secret-scan').evidence, /OpenAI-style API key/);
});

test('keeps high-confidence token detection active in documentation', async (t) => {
  const findings = await securityFixture(t, {
    'docs/leak.md': 'Accidentally published ghp_1234567890AbCdEfGhIjKlMn.\n' // setuplens: allow-secret
  });
  assert.equal(findings.get('security.secret-scan').status, 'fail');
  assert.match(findings.get('security.secret-scan').evidence, /GitHub access token/);
});

test('honors the explicit allow-secret suppression marker', async (t) => {
  const findings = await securityFixture(t, {
    'src/config.js': 'const API_KEY = "ActualLookingKeyValue123"; // setuplens: allow-secret\n'
  });
  assert.equal(findings.get('security.secret-scan').status, 'pass');
});
