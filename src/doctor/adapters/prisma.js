import path from 'node:path';
import { findNamed, readText } from '../../lib/files.js';
import { createProbe } from '../probes.js';

function envKeys(text) {
  return [...text.matchAll(/env\(["']([A-Z][A-Z0-9_]{2,})["']\)/g)].map((match) => match[1]);
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
    schemaSignals.push({ path: file.relative, envKeys: keys });
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
  }

  const probes = schemaFiles.slice(0, 1).map((file) => createProbe({
    id: `prisma.validate.${file.relative}`.replaceAll('/', '.'),
    adapter: 'prisma',
    label: 'Prisma schema validation',
    command: 'npx',
    args: ['prisma', 'validate', '--schema', file.relative],
    cwd: '.',
    purpose: 'Validate Prisma schema and required environment references.',
    kind: 'verify',
    confidence: 'medium'
  }));

  return {
    id: 'prisma',
    title: 'Prisma adapter',
    confidence: schemaFiles.length > 0 ? 'high' : 'medium',
    signals: {
      schemaFiles: schemaSignals,
      packages: packages.map((pkg) => path.posix.dirname(pkg.file.relative))
    },
    actions: schemaFiles.map((file) => ({
      type: 'verify',
      command: `npx prisma validate --schema ${file.relative}`,
      cwd: '.',
      reason: `${file.relative} declares a Prisma schema.`,
      confidence: 'medium'
    })),
    probes,
    issues
  };
}
