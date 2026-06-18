import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyPathRole, isIncidentalPathRole, PATH_ROLES } from '../src/lib/context.js';

test('classifies application source as primary context', () => {
  assert.equal(classifyPathRole('src/server.js'), PATH_ROLES.PRIMARY);
});

test('classifies test directories as test fixtures', () => {
  assert.equal(classifyPathRole('tests/fixtures/app/.env'), PATH_ROLES.TEST_FIXTURE);
});

test('classifies test and spec filenames as test fixtures', () => {
  assert.equal(classifyPathRole('src/config.test.js'), PATH_ROLES.TEST_FIXTURE);
  assert.equal(classifyPathRole('src/config.spec.ts'), PATH_ROLES.TEST_FIXTURE);
});

test('classifies documentation directories and Markdown files', () => {
  assert.equal(classifyPathRole('docs/setup/config.py'), PATH_ROLES.DOCUMENTATION);
  assert.equal(classifyPathRole('docs_src/security/tutorial.py'), PATH_ROLES.DOCUMENTATION);
  assert.equal(classifyPathRole('README.md'), PATH_ROLES.DOCUMENTATION);
});

test('classifies examples and playgrounds separately', () => {
  assert.equal(classifyPathRole('examples/basic/package.json'), PATH_ROLES.EXAMPLE);
  assert.equal(classifyPathRole('playground/react/.env'), PATH_ROLES.EXAMPLE);
});

test('classifies generated snapshots as generated context', () => {
  assert.equal(classifyPathRole('src/generated/client.js'), PATH_ROLES.GENERATED);
  assert.equal(classifyPathRole('__snapshots__/output.js'), PATH_ROLES.GENERATED);
});

test('normalizes Windows separators before classifying context', () => {
  assert.equal(classifyPathRole('tests\\fixtures\\app\\.env'), PATH_ROLES.TEST_FIXTURE);
});

test('marks every non-primary role as incidental', () => {
  assert.equal(isIncidentalPathRole(PATH_ROLES.PRIMARY), false);
  assert.equal(isIncidentalPathRole(PATH_ROLES.DOCUMENTATION), true);
  assert.equal(isIncidentalPathRole(PATH_ROLES.TEST_FIXTURE), true);
});
