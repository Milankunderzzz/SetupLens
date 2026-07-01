import fs from 'node:fs';
import path from 'node:path';
import { isIncidentalPathRole } from '../../lib/context.js';
import { readText } from '../../lib/files.js';
import { createProbe } from '../probes.js';

const START_SCRIPT_PRIORITY = ['dev', 'start', 'serve', 'preview'];
const VERIFY_SCRIPT_PRIORITY = ['doctor', 'check', 'typecheck', 'lint', 'test', 'build'];
const COMMON_ENV_KEYS = new Set(['CI', 'NODE_ENV', 'PORT', 'HOST', 'HOME', 'PATH', 'PWD', 'USER', 'USERNAME']);
const FRAMEWORK_PACKAGES = [
  ['next', 'Next.js'],
  ['vite', 'Vite'],
  ['nuxt', 'Nuxt'],
  ['astro', 'Astro'],
  ['@sveltejs/kit', 'SvelteKit'],
  ['@nestjs/core', 'NestJS'],
  ['express', 'Express'],
  ['fastify', 'Fastify'],
  ['react', 'React'],
  ['vue', 'Vue'],
  ['svelte', 'Svelte'],
  ['typescript', 'TypeScript'],
  ['prisma', 'Prisma'],
  ['@prisma/client', 'Prisma'],
  ['drizzle-orm', 'Drizzle'],
  ['sequelize', 'Sequelize'],
  ['typeorm', 'TypeORM']
];

function dependencies(pkg) {
  return {
    ...pkg.manifest.dependencies,
    ...pkg.manifest.devDependencies,
    ...pkg.manifest.peerDependencies,
    ...pkg.manifest.optionalDependencies
  };
}

function managerForPackage(index, detection, pkg) {
  if (detection.workspace?.manager) return detection.workspace.manager;
  const declared = String(pkg?.manifest.packageManager ?? '').split('@')[0];
  if (declared) return declared;
  if (fs.existsSync(path.join(pkg.directory, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(pkg.directory, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(pkg.directory, 'bun.lock')) || fs.existsSync(path.join(pkg.directory, 'bun.lockb'))) return 'bun';
  if (fs.existsSync(path.join(index.root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(index.root, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(index.root, 'bun.lock')) || fs.existsSync(path.join(index.root, 'bun.lockb'))) return 'bun';
  return 'npm';
}

function installCommand(manager) {
  if (manager === 'yarn') return { command: 'yarn', args: ['install'] };
  if (manager === 'pnpm') return { command: 'pnpm', args: ['install'] };
  if (manager === 'bun') return { command: 'bun', args: ['install'] };
  return { command: 'npm', args: ['install'] };
}

function runScriptCommand(manager, script) {
  if (manager === 'yarn') return { command: 'yarn', args: [script] };
  if (manager === 'bun') return { command: 'bun', args: ['run', script] };
  return { command: manager, args: ['run', script] };
}

function commandText({ command, args }) {
  return [command, ...args].join(' ');
}

function declaredDependencyCount(pkg) {
  return Object.keys(pkg.manifest.dependencies ?? {}).length
    + Object.keys(pkg.manifest.devDependencies ?? {}).length
    + Object.keys(pkg.manifest.optionalDependencies ?? {}).length;
}

function scriptNames(pkg) {
  return Object.keys(pkg.manifest.scripts ?? {}).sort();
}

function shouldIgnoreEnvKey(key) {
  return COMMON_ENV_KEYS.has(key)
    || key.startsWith('GITHUB_')
    || key.startsWith('INPUT_')
    || key.startsWith('RUNNER_')
    || key.startsWith('npm_');
}

function frameworkSignals(packages) {
  const names = new Set();
  for (const pkg of packages) {
    const deps = dependencies(pkg);
    for (const [dependency, label] of FRAMEWORK_PACKAGES) {
      if (deps[dependency]) names.add(label);
    }
  }
  return [...names].sort();
}

async function envReferences(index) {
  const refs = new Map();
  for (const file of index.files) {
    if (!['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'].includes(file.extension)) continue;
    if (isIncidentalPathRole(file.role)) continue;
    if (file.size > 512 * 1024) continue;
    const text = await readText(file);
    if (!text) continue;
    for (const match of text.matchAll(/process\.env\.([A-Z][A-Z0-9_]{2,})/g)) {
      const key = match[1];
      if (shouldIgnoreEnvKey(key)) continue;
      const current = refs.get(key) ?? { key, files: [] };
      current.files.push(file.relative);
      refs.set(key, current);
    }
  }
  return [...refs.values()].map((item) => ({ ...item, files: [...new Set(item.files)].slice(0, 5) }));
}

async function localEnvKeys(index) {
  const keys = new Set();
  const files = index.files.filter((file) => /^\.env(?:\.|$)/.test(file.name) && !/\.(?:example|sample|template)$/.test(file.name));
  for (const file of files) {
    const text = await readText(file);
    if (!text) continue;
    for (const match of text.matchAll(/^\s*([A-Z][A-Z0-9_]{2,})\s*=/gm)) keys.add(match[1]);
  }
  return keys;
}

export async function nodeAdapter({ index, detection }) {
  if (!detection.stacks.includes('node') && detection.packages.length === 0) return null;

  const rootPackage = detection.packages.find((pkg) => pkg.relativeDirectory === '.') ?? detection.packages[0];
  const manager = managerForPackage(index, detection, rootPackage);
  const packages = detection.workspace
    ? [detection.workspace.rootPackage, ...detection.workspace.members]
    : detection.packages;
  const dependencyCount = packages.reduce((total, pkg) => total + declaredDependencyCount(pkg), 0);
  const install = installCommand(manager);
  const frameworks = frameworkSignals(packages);
  const refs = await envReferences(index);
  const availableEnv = await localEnvKeys(index);
  const missingEnvRefs = refs.filter((ref) => !availableEnv.has(ref.key));
  const installed = detection.workspace
    ? fs.existsSync(path.join(index.root, 'node_modules'))
    : fs.existsSync(path.join(rootPackage.directory, 'node_modules'));
  const actions = [];
  const probes = [
    createProbe({
      id: 'node.runtime.version',
      adapter: 'node',
      label: 'Node.js runtime',
      command: 'node',
      args: ['--version'],
      purpose: 'Verify that Node.js is available before probing project commands.',
      confidence: 'high'
    }),
    createProbe({
      id: `node.package-manager.${manager}`,
      adapter: 'node',
      label: `${manager} package manager`,
      command: manager,
      args: ['--version'],
      purpose: 'Verify that the selected package manager is installed.',
      confidence: 'high'
    })
  ];

  if (dependencyCount > 0 && !installed) {
    actions.push({
      type: 'install',
      command: commandText(install),
      cwd: detection.workspace ? '.' : rootPackage.relativeDirectory,
      reason: `${dependencyCount} Node dependencies are declared across ${packages.length} package manifest${packages.length === 1 ? '' : 's'}.`,
      confidence: 'high'
    });
  }

  const scriptActions = [];
  for (const pkg of packages) {
    const scripts = scriptNames(pkg);
    const startScript = START_SCRIPT_PRIORITY.find((script) => scripts.includes(script));
    if (startScript) {
      const command = runScriptCommand(manager, startScript);
      scriptActions.push({
        type: 'run',
        command: commandText(command),
        cwd: pkg.relativeDirectory,
        reason: `${pkg.relativeDirectory === '.' ? 'Root package' : pkg.relativeDirectory} defines "${startScript}".`,
        confidence: 'high',
        probe: createProbe({
          id: `node.script.${pkg.relativeDirectory}.${startScript}`.replaceAll('/', '.'),
          adapter: 'node',
          label: `Run ${startScript}`,
          command: command.command,
          args: command.args,
          cwd: pkg.relativeDirectory,
          purpose: 'Probe the most likely startup command and classify early failure output.',
          kind: 'startup',
          confidence: 'medium'
        })
      });
    }

    const verifyScript = VERIFY_SCRIPT_PRIORITY.find((script) => scripts.includes(script));
    if (verifyScript) {
      const command = runScriptCommand(manager, verifyScript);
      probes.push(createProbe({
        id: `node.verify.${pkg.relativeDirectory}.${verifyScript}`.replaceAll('/', '.'),
        adapter: 'node',
        label: `Verify ${verifyScript}`,
        command: command.command,
        args: command.args,
        cwd: pkg.relativeDirectory,
        purpose: 'Run a project-defined verification command before trying to start the app.',
        kind: 'verify',
        confidence: 'high'
      }));
    }
  }
  actions.push(...scriptActions.slice(0, 5));
  probes.push(...scriptActions.slice(0, 2).map((item) => item.probe));

  const issues = missingEnvRefs.map((ref) => ({
    type: 'missing_env_reference',
    severity: 'warn',
    title: `Environment variable may be required: ${ref.key}`,
    evidence: `${ref.key} is referenced in ${ref.files.join(', ')}`,
    recommendation: `Document ${ref.key} in an environment template and provide a local value before startup.`
  }));

  return {
    id: 'node',
    title: 'Node.js project adapter',
    confidence: rootPackage ? 'high' : 'medium',
    signals: {
      packageManager: manager,
      packages: packages.map((pkg) => ({
        path: pkg.file.relative,
        directory: pkg.relativeDirectory,
        scripts: scriptNames(pkg)
      })),
      frameworks,
      workspace: detection.workspace ? {
        manager: detection.workspace.manager,
        manifest: detection.workspace.manifest,
        members: detection.workspace.members.map((pkg) => pkg.relativeDirectory)
      } : null,
      envReferences: refs
    },
    actions,
    probes,
    issues
  };
}
