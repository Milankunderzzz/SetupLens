import { createProbe } from '../probes.js';
import { readJson } from '../../lib/files.js';

function packageManager(index, detection) {
  if (detection.workspace?.manager) return detection.workspace.manager;
  if (index.byRelative.has('pnpm-lock.yaml') || index.byRelative.has('pnpm-workspace.yaml')) return 'pnpm';
  if (index.byRelative.has('yarn.lock')) return 'yarn';
  if (index.byRelative.has('bun.lock') || index.byRelative.has('bun.lockb')) return 'bun';
  return 'npm';
}

function managerInstall(manager) {
  if (manager === 'pnpm') return 'pnpm install';
  if (manager === 'yarn') return 'yarn install';
  if (manager === 'bun') return 'bun install';
  return 'npm install';
}

export async function monorepoAdapter({ index, detection }) {
  const toolFiles = {
    turbo: index.byRelative.get('turbo.json'),
    nx: index.byRelative.get('nx.json'),
    lerna: index.byRelative.get('lerna.json'),
    rush: index.byRelative.get('rush.json'),
    pnpm: index.byRelative.get('pnpm-workspace.yaml')
  };
  const tools = Object.entries(toolFiles).filter(([, file]) => Boolean(file)).map(([name]) => name);
  const workspace = detection.workspace;
  if (!workspace && tools.length === 0) return null;

  const manager = packageManager(index, detection);
  const rootPackage = detection.packages.find((pkg) => pkg.relativeDirectory === '.');
  const rootScripts = Object.keys(rootPackage?.manifest.scripts ?? {}).sort();
  const turboConfig = toolFiles.turbo ? await readJson(toolFiles.turbo) : null;
  const nxConfig = toolFiles.nx ? await readJson(toolFiles.nx) : null;
  const turboTasks = Object.keys(turboConfig?.tasks ?? turboConfig?.pipeline ?? {}).sort();
  const nxTargets = Object.keys(nxConfig?.targetDefaults ?? {}).sort();
  const actions = [
    {
      type: 'install',
      command: managerInstall(manager),
      cwd: '.',
      reason: workspace ? `${workspace.manifest} declares ${workspace.members.length} workspace members.` : `${tools.join(', ')} monorepo tooling was detected.`,
      confidence: 'high'
    }
  ];
  for (const script of ['dev', 'start', 'build', 'test']) {
    if (rootScripts.includes(script)) {
      actions.push({
        type: script === 'dev' || script === 'start' ? 'run' : 'verify',
        command: manager === 'yarn' ? `yarn ${script}` : `${manager} run ${script}`,
        cwd: '.',
        reason: `Root package defines "${script}" for the workspace.`,
        confidence: 'high'
      });
    }
  }
  if (tools.includes('turbo')) {
    for (const task of ['build', 'test', 'lint', 'dev'].filter((item) => turboTasks.includes(item) || rootScripts.includes(item))) {
      actions.push({
        type: task === 'dev' ? 'run' : 'verify',
        command: manager === 'yarn' ? `yarn turbo ${task}` : `${manager} exec turbo ${task}`,
        cwd: '.',
        reason: `Turbo task "${task}" is available for the workspace.`,
        confidence: 'medium'
      });
    }
  }
  if (tools.includes('nx')) {
    for (const target of ['build', 'test', 'lint', 'serve'].filter((item) => nxTargets.includes(item) || rootScripts.includes(item))) {
      actions.push({
        type: target === 'serve' ? 'run' : 'verify',
        command: manager === 'yarn' ? `yarn nx run-many -t ${target}` : `${manager} exec nx run-many -t ${target}`,
        cwd: '.',
        reason: `Nx target "${target}" is available for the workspace.`,
        confidence: 'medium'
      });
    }
  }

  return {
    id: 'monorepo',
    title: 'Monorepo adapter',
    confidence: workspace ? 'high' : 'medium',
    signals: {
      packageManager: manager,
      tools,
      turbo: turboConfig ? { tasks: turboTasks } : null,
      nx: nxConfig ? { targetDefaults: nxTargets, workspaceLayout: nxConfig.workspaceLayout ?? null } : null,
      workspace: workspace ? {
        manifest: workspace.manifest,
        members: workspace.members.map((pkg) => pkg.relativeDirectory)
      } : null,
      rootScripts
    },
    actions,
    probes: [
      createProbe({
        id: `monorepo.package-manager.${manager}`,
        adapter: 'monorepo',
        label: `${manager} workspace package manager`,
        command: manager,
        args: ['--version'],
        purpose: 'Verify that the workspace package manager is available.',
        confidence: 'high'
      })
    ].concat(tools.includes('turbo') ? [createProbe({
      id: 'monorepo.turbo.dry-run',
      adapter: 'monorepo',
      label: 'Turbo dry run',
      command: manager,
      args: ['exec', 'turbo', 'run', 'build', '--dry-run'],
      purpose: 'Ask Turbo to resolve the build graph without executing tasks.',
      kind: 'verify',
      confidence: 'medium'
    })] : [], tools.includes('nx') ? [createProbe({
      id: 'monorepo.nx.graph',
      adapter: 'monorepo',
      label: 'Nx project graph',
      command: manager,
      args: ['exec', 'nx', 'show', 'projects'],
      purpose: 'Ask Nx to resolve workspace projects without running targets.',
      kind: 'verify',
      confidence: 'medium'
    })] : []),
    issues: []
  };
}
