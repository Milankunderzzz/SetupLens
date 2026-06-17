import path from 'node:path';
import { findNamed, readJson } from '../lib/files.js';
import { finding, uniqueBy } from '../lib/utils.js';

export async function detectStacks(index) {
  const packageFiles = findNamed(index, 'package.json');
  const packages = [];

  for (const file of packageFiles) {
    const manifest = await readJson(file);
    if (!manifest) continue;
    packages.push({
      file,
      directory: path.dirname(file.absolute),
      relativeDirectory: path.posix.dirname(file.relative) === '.' ? '.' : path.posix.dirname(file.relative),
      manifest
    });
  }

  const has = (name) => index.files.some((file) => file.name === name);
  const stacks = [];
  if (packages.length > 0) stacks.push('node');
  if (has('requirements.txt') || has('pyproject.toml') || has('Pipfile')) stacks.push('python');
  if (has('docker-compose.yml') || has('docker-compose.yaml') || has('compose.yml') || has('compose.yaml') || has('Dockerfile')) stacks.push('docker');
  if (has('pom.xml') || has('build.gradle') || has('build.gradle.kts')) stacks.push('java');
  if (has('Cargo.toml')) stacks.push('rust');
  if (has('go.mod')) stacks.push('go');

  return { stacks: uniqueBy(stacks, (item) => item), packages };
}

export function stackFindings(index, detection) {
  const label = detection.stacks.length > 0 ? detection.stacks.join(', ') : 'no supported stack';
  return [finding({
    id: 'stack.detected',
    category: 'Stack',
    status: detection.stacks.length > 0 ? 'pass' : 'warn',
    title: 'Project stack detected',
    message: `Detected ${label} across ${index.files.length} indexed files.`,
    recommendation: detection.stacks.length > 0 ? null : 'Add a supported project manifest or a SetupLens plugin.',
    weight: detection.stacks.length > 0 ? 0 : 4
  })];
}
