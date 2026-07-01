import path from 'node:path';
import { findNamed, readText } from '../../lib/files.js';
import { createProbe } from '../probes.js';

function envKeys(text) {
  return [...text.matchAll(/env\(["']([A-Z][A-Z0-9_]{2,})["']\)/g)].map((match) => match[1]);
}

function prismaBlocks(text, keyword) {
  return [...text.matchAll(new RegExp(`\\b${keyword}\\s+([A-Za-z0-9_-]+)\\s*{([\\s\\S]*?)}`, 'g'))]
    .map((match) => ({ name: match[1], body: match[2] }));
}

function blockProviders(text, keyword) {
  return prismaBlocks(text, keyword)
    .map((block) => block.body.match(/\bprovider\s*=\s*["']([^"']+)["']/)?.[1])
    .filter(Boolean);
}

function generators(text) {
  return prismaBlocks(text, 'generator').map((block) => block.name);
}

async function envFileKeys(index) {
  const keys = new Set();
  for (const file of index.files.filter((item) => /^\.env(?:\.|$)/.test(item.name))) {
    const text = await readText(file);
    if (!text) continue;
    for (const match of text.matchAll(/^\s*([A-Z][A-Z0-9_]{2,})\s*=/gm)) keys.add(match[1]);
  }
  return keys;
}

export async function prismaAdapter({ index, detection }) {
  const schemaFiles = index.files.filter((file) => file.relative.endsWith('prisma/schema.prisma') || file.name === 'schema.prisma');
  const packages = detection.packages.filter((pkg) => {
    const deps = {
      ...pkg.manifest.dependencies,
      ...pkg.manifest.devDependencies
    };
    return deps.prisma || deps['@prisma/client'];
  });
  if (schemaFiles.length === 0 && packages.length === 0) return null;

  const availableEnv = await envFileKeys(index);
  const schemaSignals = [];
  const issues = [];
  for (const file of schemaFiles) {
    const text = await readText(file);
    const keys = text ? [...new Set(envKeys(text))] : [];
    const providers = text ? [...new Set(blockProviders(text, 'datasource'))] : [];
    schemaSignals.push({
      path: file.relative,
      envKeys: keys,
      providers,
      generators: text ? [...new Set(generators(text))] : [],
      generatorProviders: text ? [...new Set(blockProviders(text, 'generator'))] : [],
      migrations: index.files.filter((item) => item.relative.startsWith(`${path.posix.dirname(file.relative)}/migrations/`)).length
    });
    for (const key of keys) {
      if (!availableEnv.has(key)) {
        issues.push({
          type: 'missing_prisma_env',
          severity: 'warn',
          title: `Prisma environment variable may be missing: ${key}`,
          evidence: `${file.relative} uses env("${key}")`,
          recommendation: `Define ${key} in .env before running Prisma or starting the app.`
        });
      }
    }
    if (providers.length > 0 && !providers.includes('sqlite') && !index.files.some((item) => item.relative.startsWith(`${path.posix.dirname(file.relative)}/migrations/`))) {
      issues.push({
        type: 'prisma_missing_migrations',
        severity: 'warn',
        title: 'Prisma migrations were not found',
        evidence: `${file.relative} uses ${providers.join(', ')} but no migrations directory was indexed.`,
        recommendation: 'Confirm whether this project uses db push, introspection, or an external migration workflow before startup.'
      });
    }
  }

  const probes = schemaFiles.slice(0, 1).map((file) => createProbe({
    id: `prisma.validate.${file.relative}`.replaceAll('/', '.'),
    adapter: 'prisma',
    label: 'Prisma schema validation',
    command: 'npx',
    args: ['--no-install', 'prisma', 'validate', '--schema', file.relative],
    cwd: '.',
    purpose: 'Validate Prisma schema and required environment references.',
    kind: 'verify',
    confidence: 'medium'
  }));
  for (const file of schemaFiles.slice(0, 1)) {
    probes.push(createProbe({
      id: `prisma.generate.${file.relative}`.replaceAll('/', '.'),
      adapter: 'prisma',
      label: 'Prisma client generation',
      command: 'npx',
      args: ['--no-install', 'prisma', 'generate', '--schema', file.relative],
      cwd: '.',
      purpose: 'Verify Prisma generator configuration without applying database migrations.',
      kind: 'verify',
      confidence: 'medium'
    }));
    probes.push(createProbe({
      id: `prisma.migrate.status.${file.relative}`.replaceAll('/', '.'),
      adapter: 'prisma',
      label: 'Prisma migration status',
      command: 'npx',
      args: ['--no-install', 'prisma', 'migrate', 'status', '--schema', file.relative],
      cwd: '.',
      purpose: 'Check migration state without applying migrations.',
      kind: 'verify',
      confidence: 'medium'
    }));
  }

  return {
    id: 'prisma',
    title: 'Prisma adapter',
    confidence: schemaFiles.length > 0 ? 'high' : 'medium',
    signals: {
      schemaFiles: schemaSignals,
      packages: packages.map((pkg) => path.posix.dirname(pkg.file.relative))
    },
    actions: schemaFiles.flatMap((file) => [
      {
        type: 'verify',
        command: `npx --no-install prisma validate --schema ${file.relative}`,
        cwd: '.',
        reason: `${file.relative} declares a Prisma schema.`,
        confidence: 'medium'
      },
      {
        type: 'setup',
        command: `npx --no-install prisma generate --schema ${file.relative}`,
        cwd: '.',
        reason: 'Prisma Client generation is commonly required before app startup.',
        confidence: 'medium'
      }
    ]),
    probes,
    issues
  };
}
