import path from 'node:path';
import { readText } from '../../lib/files.js';
import { createProbe } from '../probes.js';

export async function goAdapter({ index, detection }) {
  const goMods = index.files.filter((file) => file.name === 'go.mod');
  if (!detection.stacks.includes('go') && goMods.length === 0) return null;

  const modules = [];
  for (const file of goMods) {
    const text = await readText(file);
    const moduleName = text?.match(/^\s*module\s+(.+)$/m)?.[1]?.trim() ?? null;
    modules.push({ path: file.relative, directory: path.posix.dirname(file.relative) === '.' ? '.' : path.posix.dirname(file.relative), module: moduleName });
  }
  const root = modules.find((item) => item.directory === '.') ?? modules[0];
  const commandDirs = index.files
    .filter((file) => file.relative.startsWith('cmd/') && file.name === 'main.go')
    .map((file) => path.posix.dirname(file.relative));
  const runTarget = commandDirs[0] ? `./${commandDirs[0]}` : './...';

  return {
    id: 'go',
    title: 'Go project adapter',
    confidence: commandDirs.length > 0 ? 'high' : 'medium',
    signals: {
      modules,
      commandDirs
    },
    actions: [
      {
        type: 'install',
        command: 'go mod download',
        cwd: root?.directory ?? '.',
        reason: `${root?.path ?? 'go.mod'} declares Go module dependencies.`,
        confidence: 'high'
      },
      {
        type: commandDirs.length > 0 ? 'run' : 'verify',
        command: commandDirs.length > 0 ? `go run ${runTarget}` : 'go test ./...',
        cwd: root?.directory ?? '.',
        reason: commandDirs.length > 0 ? `${commandDirs[0]} contains main.go.` : 'No cmd/*/main.go was found; go test is the safest verification path.',
        confidence: commandDirs.length > 0 ? 'high' : 'medium'
      }
    ],
    probes: [
      createProbe({
        id: 'go.runtime.version',
        adapter: 'go',
        label: 'Go runtime',
        command: 'go',
        args: ['version'],
        purpose: 'Verify that Go is available.',
        confidence: 'high'
      }),
      createProbe({
        id: 'go.test',
        adapter: 'go',
        label: 'Go tests',
        command: 'go',
        args: ['test', './...'],
        cwd: root?.directory ?? '.',
        purpose: 'Compile and test all Go packages.',
        kind: 'verify',
        confidence: 'medium'
      })
    ],
    issues: []
  };
}
