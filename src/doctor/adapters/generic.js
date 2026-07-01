import { extractReadmeCommands } from '../readme.js';

function knownToolFiles(index) {
  return index.files
    .filter((file) => [
      'Makefile',
      'makefile',
      'justfile',
      'Justfile',
      'Taskfile.yml',
      'Taskfile.yaml',
      'docker-compose.yml',
      'compose.yml',
      'devcontainer.json'
    ].includes(file.name) || file.relative.startsWith('.devcontainer/'))
    .map((file) => file.relative);
}

export async function genericAdapter({ index }) {
  const readmeCommands = await extractReadmeCommands(index);
  const toolFiles = knownToolFiles(index);
  if (readmeCommands.length === 0 && toolFiles.length === 0) return null;

  return {
    id: 'generic',
    title: 'Repository instruction adapter',
    confidence: readmeCommands.length > 0 ? 'medium' : 'low',
    signals: {
      readmeCommands,
      toolFiles
    },
    actions: readmeCommands.filter((item) => item.kind !== 'unknown').slice(0, 8).map((item) => ({
      type: item.kind,
      command: item.command,
      cwd: '.',
      reason: `README command at ${item.source}:${item.line}.`,
      confidence: item.inFence ? 'medium' : 'low'
    })),
    probes: [],
    issues: []
  };
}
