import { createProbe } from '../probes.js';

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

  return {
    id: 'monorepo',
    title: 'Monorepo adapter',
    confidence: workspace ? 'high' : 'medium',
    signals: {
      packageManager: manager,
      tools,
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
    ],
    issues: []
  };
}
