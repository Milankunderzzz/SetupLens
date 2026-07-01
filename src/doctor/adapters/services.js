import path from 'node:path';
import { readText } from '../../lib/files.js';

const COMPOSE_NAMES = new Set(['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml']);
const SERVICE_IMAGE_HINTS = [
  ['postgres', 'PostgreSQL'],
  ['mysql', 'MySQL'],
  ['mariadb', 'MariaDB'],
  ['redis', 'Redis'],
  ['mongo', 'MongoDB'],
  ['elasticsearch', 'Elasticsearch'],
  ['opensearch', 'OpenSearch'],
  ['rabbitmq', 'RabbitMQ'],
  ['kafka', 'Kafka'],
  ['localstack', 'LocalStack'],
  ['minio', 'MinIO']
];

function cleanValue(value) {
  return value.trim().replace(/^['"]|['"]$/g, '').split(/\s+#/)[0];
}

function parseCompose(text, file) {
  const services = [];
  const ports = [];
  const envFiles = [];
  const lines = text.split(/\r?\n/);
  let inServices = false;
  let currentService = null;
  let currentServiceIndent = -1;
  let envFileIndent = -1;

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    const indent = raw.match(/^\s*/)[0].length;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (/^services:\s*$/.test(trimmed)) {
      inServices = true;
      continue;
    }
    if (!inServices) continue;
    if (indent === 0 && !/^services:\s*$/.test(trimmed)) {
      inServices = false;
      currentService = null;
      continue;
    }

    const serviceMatch = raw.match(/^(\s{2,})([A-Za-z0-9_.-]+):\s*$/);
    if (serviceMatch && serviceMatch[1].length === 2) {
      currentService = serviceMatch[2];
      currentServiceIndent = serviceMatch[1].length;
      services.push({ name: currentService, image: null });
      envFileIndent = -1;
      continue;
    }
    if (!currentService || indent <= currentServiceIndent) continue;

    const current = services.find((service) => service.name === currentService);
    const image = trimmed.match(/^image:\s*(.+)$/);
    if (image && current) current.image = cleanValue(image[1]);

    const port = trimmed.match(/^-\s*["']?(\d+):(\d+)/);
    if (port) ports.push({ service: currentService, host: port[1], container: port[2], line: index + 1 });

    if (/^env_file:\s*$/.test(trimmed)) {
      envFileIndent = indent;
      continue;
    }
    const inlineEnvFile = trimmed.match(/^env_file:\s*(.+)$/);
    if (inlineEnvFile) {
      envFiles.push({ service: currentService, value: cleanValue(inlineEnvFile[1]), line: index + 1 });
      continue;
    }
    if (envFileIndent >= 0 && indent > envFileIndent) {
      const listItem = trimmed.match(/^-\s*(.+)$/);
      if (listItem) envFiles.push({ service: currentService, value: cleanValue(listItem[1]), line: index + 1 });
    } else if (envFileIndent >= 0 && indent <= envFileIndent) {
      envFileIndent = -1;
    }
  }

  return { file: file.relative, services, ports, envFiles };
}

function serviceKinds(services) {
  const kinds = new Set();
  for (const service of services) {
    const value = `${service.name} ${service.image ?? ''}`.toLowerCase();
    for (const [hint, label] of SERVICE_IMAGE_HINTS) {
      if (value.includes(hint)) kinds.add(label);
    }
  }
  return [...kinds].sort();
}

export async function servicesAdapter({ index }) {
  const composeFiles = index.files.filter((file) => COMPOSE_NAMES.has(file.name));
  if (composeFiles.length === 0) return null;

  const compose = [];
  const issues = [];
  for (const file of composeFiles) {
    const text = await readText(file);
    if (!text) continue;
    const parsed = parseCompose(text, file);
    compose.push(parsed);
    const composeDir = path.posix.dirname(file.relative) === '.' ? '' : `${path.posix.dirname(file.relative)}/`;
    for (const envFile of parsed.envFiles) {
      if (envFile.value.includes('${')) continue;
      const relative = `${composeDir}${envFile.value}`.replace(/^\.\//, '');
      if (!index.byRelative.has(relative)) {
        issues.push({
          type: 'missing_compose_env_file',
          severity: 'fail',
          title: `Compose env_file is missing: ${envFile.value}`,
          evidence: `${file.relative}:${envFile.line} references ${envFile.value} for ${envFile.service}`,
          recommendation: `Create ${relative} or update the env_file path before starting Compose.`
        });
      }
    }
  }

  const services = compose.flatMap((item) => item.services);
  const kinds = serviceKinds(services);
  const composeFile = compose[0]?.file;

  return {
    id: 'services',
    title: 'Local services adapter',
    confidence: kinds.length > 0 ? 'high' : 'medium',
    signals: {
      compose,
      serviceKinds: kinds
    },
    actions: composeFile ? [
      {
        type: 'setup',
        command: `docker compose -f ${composeFile} up -d`,
        cwd: '.',
        reason: kinds.length > 0 ? `Compose defines local services: ${kinds.join(', ')}.` : `${composeFile} defines local services.`,
        confidence: 'medium'
      }
    ] : [],
    probes: [],
    issues
  };
}
