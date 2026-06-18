import fs from 'node:fs';
import path from 'node:path';
import { finding } from '../lib/utils.js';

const LOCKFILES = ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb'];

function declaredDependencyCount(pkg) {
  return Object.keys(pkg.manifest.dependencies ?? {}).length
    + Object.keys(pkg.manifest.devDependencies ?? {}).length
    + Object.keys(pkg.manifest.optionalDependencies ?? {}).length;
}

function nodePackageFindings(pkg) {
  const findings = [];
  const label = pkg.relativeDirectory === '.' ? 'root package' : pkg.relativeDirectory;
  const dependencyCount = declaredDependencyCount(pkg);
  if (dependencyCount === 0) {
    findings.push(finding({
      id: `dependencies.node.empty.${pkg.file.relative}`,
      category: 'Dependencies',
      status: 'pass',
      title: `Node dependencies: ${label}`,
      message: 'The package has no declared dependencies.'
    }));
    return findings;
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
  return findings;
}

function workspaceFindings(index, workspace) {
  const dependencyCount = workspace.packages.reduce((total, pkg) => total + declaredDependencyCount(pkg), 0);
  const installed = fs.existsSync(path.join(index.root, 'node_modules'));
  const lockfile = LOCKFILES.find((name) => fs.existsSync(path.join(index.root, name)));
  const packageLabel = `${workspace.packages.length} workspace packages`;

  return [
    finding({
      id: 'dependencies.node.workspace-installed',
      category: 'Dependencies',
      status: dependencyCount === 0 || installed ? 'pass' : 'warn',
      title: 'Node workspace dependencies',
      message: dependencyCount === 0
        ? `${packageLabel} declare no dependencies.`
        : installed
          ? `Root node_modules is present for ${packageLabel}.`
          : `Root node_modules is missing for ${packageLabel} with ${dependencyCount} declared dependencies.`,
      evidence: `Workspace declared by ${workspace.manifest}; package manager: ${workspace.manager}`,
      recommendation: dependencyCount === 0 || installed ? null : `Run ${workspace.manager} install at the workspace root.`,
      weight: dependencyCount === 0 || installed ? 0 : 6
    }),
    finding({
      id: 'dependencies.node.workspace-lockfile',
      category: 'Dependencies',
      status: lockfile ? 'pass' : 'warn',
      title: 'Node workspace lockfile',
      message: lockfile ? `Root ${lockfile} covers ${packageLabel}.` : `No root lockfile was found for ${packageLabel}.`,
      recommendation: lockfile ? null : `Create and commit the ${workspace.manager} lockfile at the workspace root.`,
      weight: lockfile ? 0 : 5
    })
  ];
}

export function dependencyFindings(index, detection) {
  const findings = [];

  if (detection.workspace) {
    findings.push(...workspaceFindings(index, detection.workspace));
  } else {
    for (const pkg of detection.packages) findings.push(...nodePackageFindings(pkg));
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
