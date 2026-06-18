import fs from 'node:fs';
import path from 'node:path';
import { commandVersion, compareVersions, finding, formatVersion, minimumVersion, parseVersion } from '../lib/utils.js';

function runtimeFinding({ id, title, available, version, required, recommendation, weight = 10 }) {
  if (!available) {
    return finding({
      id,
      category: 'Runtime',
      status: 'fail',
      title,
      message: 'Required runtime was not found on PATH.',
      recommendation,
      weight
    });
  }

  const parsed = parseVersion(version);
  if (required && parsed && compareVersions(parsed, required) < 0) {
    return finding({
      id,
      category: 'Runtime',
      status: 'fail',
      title,
      message: `Found ${version}; the project requires ${formatVersion(required)} or newer.`,
      recommendation,
      weight
    });
  }

  return finding({
    id,
    category: 'Runtime',
    status: 'pass',
    title,
    message: `${version}${required ? ` satisfies >=${formatVersion(required)}` : ''}.`
  });
}

function packageManager(detection) {
  if (detection.workspace?.manager) return detection.workspace.manager;
  for (const pkg of detection.packages) {
    const manager = String(pkg.manifest.packageManager ?? '').split('@')[0];
    if (manager) return manager;
    if (fs.existsSync(path.join(pkg.directory, 'pnpm-lock.yaml'))) return 'pnpm';
    if (fs.existsSync(path.join(pkg.directory, 'yarn.lock'))) return 'yarn';
    if (fs.existsSync(path.join(pkg.directory, 'bun.lockb')) || fs.existsSync(path.join(pkg.directory, 'bun.lock'))) return 'bun';
  }
  return 'npm';
}

function detectPython() {
  const candidates = process.platform === 'win32'
    ? [['py', ['-3', '--version']], ['python', ['--version']]]
    : [['python3', ['--version']], ['python', ['--version']]];
  for (const [command, args] of candidates) {
    const version = commandVersion(command, args);
    if (version) return { command, version };
  }
  return null;
}

export function runtimeFindings(index, detection) {
  const findings = [];

  if (detection.stacks.includes('node')) {
    const requirements = detection.packages
      .map((pkg) => minimumVersion(pkg.manifest.engines?.node))
      .filter(Boolean)
      .sort(compareVersions);
    const required = requirements.at(-1) ?? null;
    findings.push(runtimeFinding({
      id: 'runtime.node',
      title: 'Node.js runtime',
      available: true,
      version: process.version,
      required,
      recommendation: 'Install a compatible Node.js LTS release from https://nodejs.org.'
    }));

    const manager = packageManager(detection);
    const version = commandVersion(manager);
    findings.push(runtimeFinding({
      id: `runtime.package-manager.${manager}`,
      title: `${manager} package manager`,
      available: Boolean(version),
      version: version ?? '',
      recommendation: manager === 'npm'
        ? 'Install npm with Node.js or ensure npm is on PATH.'
        : `Enable Corepack or install ${manager}.`,
      weight: 8
    }));
  }

  if (detection.stacks.includes('python')) {
    const python = detectPython();
    findings.push(runtimeFinding({
      id: 'runtime.python',
      title: 'Python runtime',
      available: Boolean(python),
      version: python?.version ?? '',
      recommendation: 'Install the Python version declared by pyproject.toml or project documentation.'
    }));
  }

  if (detection.stacks.includes('docker')) {
    const docker = commandVersion('docker');
    findings.push(runtimeFinding({
      id: 'runtime.docker',
      title: 'Docker CLI',
      available: Boolean(docker),
      version: docker ?? '',
      recommendation: 'Install and start Docker Desktop or a compatible Docker engine.'
    }));

    const compose = commandVersion('docker', ['compose', 'version']);
    findings.push(runtimeFinding({
      id: 'runtime.docker-compose',
      title: 'Docker Compose',
      available: Boolean(compose),
      version: compose ?? '',
      recommendation: 'Install the Docker Compose plugin.',
      weight: 8
    }));
  }

  const gitDirectory = path.join(index.root, '.git');
  if (fs.existsSync(gitDirectory)) {
    const git = commandVersion('git');
    findings.push(runtimeFinding({
      id: 'runtime.git',
      title: 'Git runtime',
      available: Boolean(git),
      version: git ?? '',
      recommendation: 'Install Git and make it available on PATH.',
      weight: 6
    }));
  }

  return findings;
}
