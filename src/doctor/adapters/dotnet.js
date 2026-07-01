import path from 'node:path';
import { readText } from '../../lib/files.js';
import { createProbe } from '../probes.js';

async function projectKind(file) {
  const text = await readText(file);
  if (!text) return 'unknown';
  if (/Microsoft\.NET\.Sdk\.Web|<Project\s+Sdk=["']Microsoft\.NET\.Sdk\.Web/i.test(text)) return 'web';
  if (/<OutputType>\s*Exe\s*<\/OutputType>/i.test(text)) return 'executable';
  return 'library';
}

export async function dotnetAdapter({ index }) {
  const projectFiles = index.files.filter((file) => /\.(?:csproj|fsproj|vbproj)$/i.test(file.name));
  const solutionFiles = index.files.filter((file) => /\.(?:sln|slnx)$/i.test(file.name));
  if (projectFiles.length === 0 && solutionFiles.length === 0) return null;

  const projects = [];
  for (const file of projectFiles) projects.push({ path: file.relative, kind: await projectKind(file) });
  const runnable = projects.find((project) => project.kind === 'web' || project.kind === 'executable') ?? projects[0];
  const cwd = runnable ? (path.posix.dirname(runnable.path) === '.' ? '.' : path.posix.dirname(runnable.path)) : '.';
  const actions = [
    {
      type: 'install',
      command: 'dotnet restore',
      cwd: '.',
      reason: solutionFiles[0] ? `${solutionFiles[0].relative} declares a .NET solution.` : `${projectFiles[0].relative} declares a .NET project.`,
      confidence: 'high'
    }
  ];
  if (runnable) {
    actions.push({
      type: 'run',
      command: `dotnet run --project ${runnable.path}`,
      cwd: '.',
      reason: runnable.kind === 'web' ? `${runnable.path} uses the Web SDK.` : `${runnable.path} appears runnable.`,
      confidence: runnable.kind === 'library' ? 'low' : 'high'
    });
  }

  const probes = [
    createProbe({
      id: 'dotnet.sdk.info',
      adapter: 'dotnet',
      label: '.NET SDK',
      command: 'dotnet',
      args: ['--info'],
      purpose: 'Verify that the .NET SDK is available.',
      confidence: 'high'
    })
  ];
  if (runnable) {
    probes.push(createProbe({
      id: `dotnet.build.${runnable.path}`.replaceAll('/', '.'),
      adapter: 'dotnet',
      label: '.NET build',
      command: 'dotnet',
      args: ['build', runnable.path, '--no-restore'],
      purpose: 'Compile the selected .NET project without restoring packages.',
      kind: 'verify',
      confidence: 'medium'
    }));
  }

  return {
    id: 'dotnet',
    title: '.NET project adapter',
    confidence: runnable?.kind === 'web' || runnable?.kind === 'executable' ? 'high' : 'medium',
    signals: {
      projects,
      solutions: solutionFiles.map((file) => file.relative)
    },
    actions,
    probes,
    issues: []
  };
}
