import { createProbe } from '../probes.js';

const COMPOSE_FILES = new Set(['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml']);

export async function dockerAdapter({ index, detection }) {
  if (!detection.stacks.includes('docker')) return null;

  const composeFiles = index.files.filter((file) => COMPOSE_FILES.has(file.name));
  const dockerfiles = index.files.filter((file) => file.name === 'Dockerfile');
  const actions = [];
  const probes = [
    createProbe({
      id: 'docker.version',
      adapter: 'docker',
      label: 'Docker CLI',
      command: 'docker',
      args: ['--version'],
      purpose: 'Verify that Docker is installed before validating Compose files.',
      confidence: 'high'
    })
  ];

  for (const file of composeFiles.slice(0, 3)) {
    actions.push({
      type: 'run',
      command: `docker compose -f ${file.relative} up --build`,
      cwd: '.',
      reason: `${file.relative} defines a Compose environment.`,
      confidence: 'high'
    });
    probes.push(createProbe({
      id: `docker.compose.config.${file.relative}`.replaceAll('/', '.'),
      adapter: 'docker',
      label: `Validate ${file.relative}`,
      command: 'docker',
      args: ['compose', '-f', file.relative, 'config'],
      purpose: 'Validate Compose syntax and path interpolation without starting containers.',
      kind: 'verify',
      confidence: 'high'
    }));
  }

  for (const file of dockerfiles.slice(0, 2)) {
    actions.push({
      type: 'verify',
      command: `docker build -f ${file.relative} .`,
      cwd: '.',
      reason: `${file.relative} can be built directly if Compose is not the intended entry point.`,
      confidence: 'medium'
    });
  }

  return {
    id: 'docker',
    title: 'Docker adapter',
    confidence: composeFiles.length > 0 ? 'high' : 'medium',
    signals: {
      composeFiles: composeFiles.map((file) => file.relative),
      dockerfiles: dockerfiles.map((file) => file.relative)
    },
    actions,
    probes,
    issues: []
  };
}
