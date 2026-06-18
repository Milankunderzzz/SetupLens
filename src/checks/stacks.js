import path from 'node:path';
import { findNamed, readJson, readText } from '../lib/files.js';
import { isIncidentalPathRole } from '../lib/context.js';
import { finding } from '../lib/utils.js';

const SUPPORTED_STACKS = new Set(['node', 'python', 'docker', 'java', 'rust', 'go']);

function relativeDirectory(file) {
  const directory = path.posix.dirname(file.relative);
  return directory === '.' ? '.' : directory;
}

function isRootFile(file) {
  return relativeDirectory(file) === '.';
}

function evidenceScore(file, rootScore, nestedScore = 70) {
  if (isIncidentalPathRole(file.role)) return 10;
  return isRootFile(file) ? rootScore : nestedScore;
}

function nodeManifestScore(pkg) {
  if (isIncidentalPathRole(pkg.file.role)) return 10;
  if (pkg.relativeDirectory !== '.') return 70;

  const manifest = pkg.manifest;
  const hasProjectIdentity = Boolean(
    manifest.name || manifest.version || manifest.main || manifest.module
    || manifest.bin || manifest.exports || manifest.workspaces
  );
  const hasRuntimeShape = Boolean(
    manifest.main || manifest.module || manifest.bin || manifest.exports
    || manifest.workspaces || Object.keys(manifest.dependencies ?? {}).length
    || Object.keys(manifest.peerDependencies ?? {}).length
  );
  if (!hasProjectIdentity && hasRuntimeShape) return 75;
  return manifest.private && !hasRuntimeShape ? 55 : 100;
}

function workspacePatterns(manifest) {
  if (Array.isArray(manifest?.workspaces)) return manifest.workspaces;
  if (Array.isArray(manifest?.workspaces?.packages)) return manifest.workspaces.packages;
  return [];
}

function workspaceManager(index, rootPackage) {
  const declared = String(rootPackage?.manifest.packageManager ?? '').split('@')[0];
  if (declared) return declared;
  if (index.byRelative.has('pnpm-lock.yaml')) return 'pnpm';
  if (index.byRelative.has('yarn.lock')) return 'yarn';
  if (index.byRelative.has('bun.lock') || index.byRelative.has('bun.lockb')) return 'bun';
  return 'npm';
}

function detectWorkspace(index, packages) {
  const rootPackage = packages.find((pkg) => pkg.relativeDirectory === '.');
  if (!rootPackage) return null;

  const patterns = workspacePatterns(rootPackage.manifest);
  const pnpmWorkspace = index.byRelative.get('pnpm-workspace.yaml');
  const explicit = patterns.length > 0 || Boolean(pnpmWorkspace);
  if (!explicit || packages.length < 2) return null;

  return {
    rootPackage,
    packages,
    members: packages.filter((pkg) => pkg !== rootPackage),
    patterns,
    manifest: pnpmWorkspace?.relative ?? (patterns.length > 0 ? 'package.json' : null),
    manager: workspaceManager(index, rootPackage)
  };
}

async function pythonManifestScore(file) {
  if (file.name !== 'pyproject.toml') return evidenceScore(file, 90, 65);
  const text = await readText(file);
  const definesProject = /^\s*\[(?:project|tool\.(?:poetry|pdm|hatch))\]/m.test(text ?? '');
  return evidenceScore(file, definesProject ? 100 : 45, definesProject ? 70 : 30);
}

function summarizeEvidence(evidence) {
  const grouped = new Map();
  for (const item of evidence) {
    const current = grouped.get(item.stack) ?? {
      name: item.stack,
      supported: SUPPORTED_STACKS.has(item.stack),
      score: 0,
      files: []
    };
    current.score = Math.max(current.score, item.score);
    current.files.push(item.file.relative);
    grouped.set(item.stack, current);
  }

  const summaries = [...grouped.values()]
    .map((item) => ({ ...item, files: [...new Set(item.files)].slice(0, 8) }))
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name));
  const candidates = summaries.filter((item) => item.score >= 50);
  const highest = candidates[0]?.score ?? null;
  const primaryStacks = highest === null
    ? []
    : candidates.filter((item) => item.score === highest).map((item) => item.name);

  return summaries.map((item) => ({
    ...item,
    role: primaryStacks.includes(item.name) ? 'primary' : item.score >= 50 ? 'supporting' : 'incidental'
  }));
}

export async function detectStacks(index) {
  const packageFiles = findNamed(index, 'package.json');
  const packages = [];

  for (const file of packageFiles) {
    const manifest = await readJson(file);
    if (!manifest) continue;
    packages.push({
      file,
      directory: path.dirname(file.absolute),
      relativeDirectory: relativeDirectory(file),
      manifest
    });
  }
  packages.sort((left, right) => {
    if (left.relativeDirectory === '.') return -1;
    if (right.relativeDirectory === '.') return 1;
    return left.relativeDirectory.localeCompare(right.relativeDirectory);
  });

  const evidence = packages.map((pkg) => ({ stack: 'node', file: pkg.file, score: nodeManifestScore(pkg) }));
  const addNamed = (stack, names, rootScore, nestedScore) => {
    for (const file of findNamed(index, names)) {
      evidence.push({ stack, file, score: evidenceScore(file, rootScore, nestedScore) });
    }
  };

  for (const file of findNamed(index, ['requirements.txt', 'pyproject.toml', 'Pipfile'])) {
    evidence.push({ stack: 'python', file, score: await pythonManifestScore(file) });
  }
  addNamed('docker', ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'], 90, 65);
  addNamed('docker', ['Dockerfile'], 75, 60);
  addNamed('java', ['pom.xml', 'build.gradle', 'build.gradle.kts'], 100, 70);
  addNamed('rust', ['Cargo.toml'], 100, 70);
  addNamed('go', ['go.mod'], 100, 70);
  addNamed('php', ['composer.json'], 110, 70);
  addNamed('ruby', ['Gemfile'], 110, 70);
  addNamed('dart', ['pubspec.yaml'], 110, 70);
  for (const file of index.files.filter((item) => /\.(?:sln|slnx|csproj)$/i.test(item.name))) {
    evidence.push({ stack: 'dotnet', file, score: evidenceScore(file, 110, 70) });
  }

  const stackEvidence = summarizeEvidence(evidence);
  const primaryStacks = stackEvidence.filter((item) => item.role === 'primary').map((item) => item.name);
  const stacks = stackEvidence
    .filter((item) => item.supported && item.role !== 'incidental')
    .map((item) => item.name);

  return {
    stacks,
    primaryStack: primaryStacks[0] ?? null,
    primaryStacks,
    stackEvidence,
    packages,
    workspace: detectWorkspace(index, packages)
  };
}

export function stackFindings(index, detection) {
  const primary = detection.stackEvidence.filter((item) => item.role === 'primary');
  const supportedPrimary = primary.filter((item) => item.supported);
  const supporting = detection.stackEvidence.filter((item) => item.role === 'supporting');
  const evidence = detection.stackEvidence
    .filter((item) => item.role !== 'incidental')
    .map((item) => `${item.name}: ${item.files.slice(0, 3).join(', ')}`)
    .join('; ') || null;

  if (primary.length === 0) {
    return [finding({
      id: 'stack.detected', category: 'Stack', status: 'warn', title: 'Project stack detected',
      message: `No primary project stack was identified across ${index.files.length} indexed files.`,
      recommendation: 'Add a supported root manifest or a SetupLens plugin.', weight: 4
    })];
  }

  if (supportedPrimary.length === 0) {
    return [finding({
      id: 'stack.detected', category: 'Stack', status: 'warn', title: 'Primary stack not supported',
      message: `Primary stack appears to be ${detection.primaryStacks.join(', ')}. Supporting stacks are not treated as the main project.`,
      evidence,
      recommendation: 'Use a trusted plugin for the primary ecosystem; supporting stack checks remain advisory.',
      weight: 4
    })];
  }

  const primaryLabel = detection.primaryStacks.join(', ');
  const supportingLabel = supporting.length > 0 ? ` Supporting evidence: ${supporting.map((item) => item.name).join(', ')}.` : '';
  return [finding({
    id: 'stack.detected', category: 'Stack', status: 'pass', title: 'Project stack detected',
    message: `Primary stack: ${primaryLabel}.${supportingLabel}`,
    evidence
  })];
}
