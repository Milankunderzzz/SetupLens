import path from 'node:path';

const TEST_SEGMENTS = new Set([
  '__tests__', 'fixture', 'fixtures', 'spec', 'specs', 'test', 'tests',
  'testdata', 'test-data', 'testing'
]);
const EXAMPLE_SEGMENTS = new Set([
  'demo', 'demos', 'example', 'examples', 'playground', 'playgrounds',
  'sample', 'samples'
]);
const DOCUMENTATION_SEGMENTS = new Set(['doc', 'docs', 'documentation']);
const GENERATED_SEGMENTS = new Set(['generated', 'snapshots', '__snapshots__']);

export const PATH_ROLES = Object.freeze({
  PRIMARY: 'primary',
  TEST_FIXTURE: 'test_fixture',
  EXAMPLE: 'example',
  DOCUMENTATION: 'documentation',
  GENERATED: 'generated'
});

export function classifyPathRole(relative) {
  const normalized = String(relative).replaceAll('\\', '/').toLowerCase();
  const segments = normalized.split('/').filter(Boolean);
  const name = segments.at(-1) ?? '';
  const directories = segments.slice(0, -1);

  if (directories.some((segment) => TEST_SEGMENTS.has(segment))
      || /(?:^|\.)(?:test|spec)\.[cm]?[jt]sx?$/.test(name)) {
    return PATH_ROLES.TEST_FIXTURE;
  }
  if (directories.some((segment) => EXAMPLE_SEGMENTS.has(segment))) return PATH_ROLES.EXAMPLE;
  if (directories.some((segment) => DOCUMENTATION_SEGMENTS.has(segment) || /^docs?[_-]/.test(segment))
      || ['readme', '.md', '.mdx', '.rst'].includes(path.extname(name) || name)) {
    return PATH_ROLES.DOCUMENTATION;
  }
  if (directories.some((segment) => GENERATED_SEGMENTS.has(segment))) return PATH_ROLES.GENERATED;
  return PATH_ROLES.PRIMARY;
}

export function isIncidentalPathRole(role) {
  return role !== PATH_ROLES.PRIMARY;
}
