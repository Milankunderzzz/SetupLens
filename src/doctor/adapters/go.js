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
  const sourceTexts = [];
  for (const file of index.files.filter((item) => item.extension === '.go' && item.size < 512 * 1024)) {
    const text = await readText(file);
    if (text) sourceTexts.push({ file: file.relative, text });
  }
  const serviceSignals = {
    httpServerFiles: sourceTexts.filter((item) => /http\.ListenAndServe|gin\.Default|echo\.New|fiber\.New|grpc\.NewServer/.test(item.text)).map((item) => item.file),
    envKeys: [...new Set(sourceTexts.flatMap((item) => [...item.text.matchAll(/os\.Getenv\(["']([A-Z][A-Z0-9_]{2,})["']\)/g)].map((match) => match[1])))].sort(),
    configFiles: index.files.filter((file) => /(^|\/)(config|configs)\/.+\.(?:ya?ml|json|toml)$/.test(file.relative)).map((file) => file.relative)
  };
  const issues = [];
  if (serviceSignals.httpServerFiles.length > 0 && commandDirs.length === 0) {
    issues.push({
      type: 'go_service_missing_cmd_entry',
      severity: 'warn',
      title: 'Go service entrypoint was not found under cmd/',
      evidence: `${serviceSignals.httpServerFiles[0]} starts an HTTP/gRPC server, but no cmd/*/main.go was indexed.`,
      recommendation: 'Document the go run target or add a conventional cmd/<service>/main.go entrypoint.'
    });
  }

  return {
    id: 'go',
    title: 'Go project adapter',
    confidence: commandDirs.length > 0 ? 'high' : 'medium',
    signals: {
      modules,
      commandDirs,
      serviceSignals
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
    issues
  };
}
