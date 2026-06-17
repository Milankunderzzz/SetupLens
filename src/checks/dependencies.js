import fs from 'node:fs';
import path from 'node:path';
import { finding } from '../lib/utils.js';

const LOCKFILES = ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb'];

export function dependencyFindings(index, detection) {
  const findings = [];

  for (const pkg of detection.packages) {
    const label = pkg.relativeDirectory === '.' ? 'root package' : pkg.relativeDirectory;
    const dependencyCount = Object.keys(pkg.manifest.dependencies ?? {}).length
      + Object.keys(pkg.manifest.devDependencies ?? {}).length;
    if (dependencyCount === 0) {
      findings.push(finding({
        id: `dependencies.node.empty.${pkg.file.relative}`,
        category: 'Dependencies',
        status: 'pass',
        title: `Node dependencies: ${label}`,
        message: 'The package has no declared dependencies.'
      }));
      continue;
    }

    const installed = fs.existsSync(path.join(pkg.directory, 'node_modules'));
    findings.push(finding({
      id: `dependencies.node.installed.${pkg.file.relative}`,
      category: 'Dependencies',
      status: installed ? 'pass' : 'warn',
      title: `Node dependencies: ${label}`,
      message: installed ? 'node_modules is present.' : `node_modules is missing for ${dependencyCount} declared dependencies.`,
      recommendation: installed ? null : `Run the package manager install command in ${label}.`,
      weight: installed ? 0 : 5
    }));

    const lockfile = LOCKFILES.find((name) => fs.existsSync(path.join(pkg.directory, name)));
    findings.push(finding({
      id: `dependencies.node.lockfile.${pkg.file.relative}`,
      category: 'Dependencies',
      status: lockfile ? 'pass' : 'warn',
      title: `Dependency lockfile: ${label}`,
      message: lockfile ? `Found ${lockfile}.` : 'No supported lockfile was found.',
      recommendation: lockfile ? null : 'Commit a lockfile for reproducible installs.',
      weight: lockfile ? 0 : 4
    }));
  }

  if (detection.stacks.includes('python')) {
    const hasVirtualEnvironment = ['.venv', 'venv', 'backend/.venv', 'backend/venv']
      .some((relative) => fs.existsSync(path.join(index.root, relative)));
    findings.push(finding({
      id: 'dependencies.python.venv',
      category: 'Dependencies',
      status: hasVirtualEnvironment ? 'pass' : 'warn',
      title: 'Python virtual environment',
      message: hasVirtualEnvironment ? 'A local virtual environment is present.' : 'No local Python virtual environment was found.',
      recommendation: hasVirtualEnvironment ? null : 'Create a project-local virtual environment before installing packages.',
      weight: hasVirtualEnvironment ? 0 : 4
    }));
  }

  return findings;
}
