import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { doctor } from '../src/doctor.js';
import { classifyLog } from '../src/doctor/error-classifier.js';
import { renderDoctorTerminal } from '../src/reporters/doctor-terminal.js';

const cliPath = fileURLToPath(new URL('../bin/setuplens.js', import.meta.url));

async function fixture(files) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'setuplens-doctor-'));
  for (const [relative, contents] of Object.entries(files)) {
    const absolute = path.join(root, relative);
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, contents, 'utf8');
  }
  return root;
}

test('doctor identifies adapters, framework signals, README commands, and Prisma env gaps', async (t) => {
  const root = await fixture({
    'package.json': JSON.stringify({
      name: 'fullstack-app',
      scripts: { dev: 'next dev', check: 'node -e "process.exit(0)"' },
      dependencies: { next: '^15.0.0', react: '^19.0.0', '@prisma/client': '^6.0.0' },
      devDependencies: { prisma: '^6.0.0' }
    }),
    'prisma/schema.prisma': 'datasource db {\n  provider = "postgresql"\n  url = env("DATABASE_URL")\n}\n',
    'src/db.ts': 'export const url = process.env.DATABASE_URL;\n',
    'README.md': '# App\n\n```bash\nnpm install\nnpm run dev\n```\n'
  });
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const report = await doctor(root);
  const adapterIds = report.project.adapters.map((adapter) => adapter.id);
  const node = report.project.adapters.find((adapter) => adapter.id === 'node');
  const generic = report.project.adapters.find((adapter) => adapter.id === 'generic');

  assert.equal(report.schemaVersion, '2.0-doctor');
  assert.equal(report.status, 'needs_setup');
  assert.ok(adapterIds.includes('node'));
  assert.ok(adapterIds.includes('prisma'));
  assert.ok(adapterIds.includes('generic'));
  assert.ok(node.signals.frameworks.includes('Next.js'));
  assert.ok(node.signals.frameworks.includes('Prisma'));
  assert.ok(generic.signals.readmeCommands.some((item) => item.command === 'npm run dev'));
  assert.ok(report.diagnosis.rootCauses.some((item) => item.type === 'missing_prisma_env'));
  assert.ok(report.probes.planned.some((item) => item.id.includes('prisma.validate')));
  assert.match(renderDoctorTerminal(report, { color: false }), /Run setuplens doctor \. --probe/);
});

test('doctor probe classifies real startup failures into root causes', async (t) => {
  const root = await fixture({
    'package.json': JSON.stringify({
      name: 'probe-app',
      scripts: {
        dev: 'node server.js',
        check: 'node -e "process.exit(0)"'
      }
    }),
    'server.js': 'throw new Error("Missing required environment variable DATABASE_URL");\n'
  });
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const report = await doctor(root, { probe: true, timeoutMs: 3000 });
  const startupProbe = report.probes.results.find((item) => item.id.includes('node.script'));

  assert.equal(report.status, 'blocked');
  assert.equal(startupProbe.status, 'fail');
  assert.equal(startupProbe.classification.type, 'missing_env_var');
  assert.ok(report.diagnosis.rootCauses.some((item) => item.type === 'missing_env_var'));
  assert.ok(report.diagnosis.nextActions.some((item) => /DATABASE_URL/.test(item.description ?? '')));
});

test('doctor command supports machine-readable json output', async (t) => {
  const root = await fixture({
    'package.json': JSON.stringify({ name: 'cli-doctor', scripts: { start: 'node index.js' } }),
    'index.js': 'console.log("ok");\n'
  });
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const result = spawnSync(process.execPath, [cliPath, 'doctor', root, '--format', 'json', '--timeout', '3000'], {
    encoding: 'utf8',
    windowsHide: true
  });

  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.schemaVersion, '2.0-doctor');
  assert.equal(parsed.project.primaryStack, 'node');
  assert.ok(parsed.probes.planned.length >= 2);
});

test('doctor diagnoses unsupported scan stacks when a doctor adapter exists', async (t) => {
  const root = await fixture({
    'composer.json': JSON.stringify({ require: { php: '^8.3', 'laravel/framework': '^11.0' } }),
    'artisan': '<?php echo "Laravel";\n'
  });
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const report = await doctor(root);
  const php = report.project.adapters.find((adapter) => adapter.id === 'php');

  assert.equal(report.scan.scorable, false);
  assert.equal(report.project.primaryStack, 'php');
  assert.notEqual(report.status, 'unsupported');
  assert.ok(php.signals.frameworks.includes('Laravel'));
  assert.ok(report.diagnosis.nextActions.some((item) => item.command === 'php artisan serve'));
  assert.equal(report.diagnosis.rootCauses.some((item) => item.title === 'Primary stack not supported'), false);
});

test('doctor reports missing Compose env_file as a startup blocker', async (t) => {
  const root = await fixture({
    'compose.yaml': 'services:\n  db:\n    image: postgres:16\n    env_file:\n      - .env.db\n    ports:\n      - "5432:5432"\n'
  });
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const report = await doctor(root);
  const services = report.project.adapters.find((adapter) => adapter.id === 'services');

  assert.equal(report.status, 'blocked');
  assert.ok(services.signals.serviceKinds.includes('PostgreSQL'));
  assert.ok(report.diagnosis.rootCauses.some((item) => item.type === 'missing_compose_env_file'));
  assert.ok(report.diagnosis.nextActions.some((item) => /Create \.env\.db/.test(item.description ?? '')));
});

test('doctor recognizes Java, dotnet, Go, and Rust adapters', async (t) => {
  const root = await fixture({
    'pom.xml': '<project><dependencies><dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-web</artifactId></dependency></dependencies></project>',
    'app.csproj': '<Project Sdk="Microsoft.NET.Sdk.Web"><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>',
    'go.mod': 'module example.com/app\n\ngo 1.22\n',
    'cmd/api/main.go': 'package main\nfunc main() {}\n',
    'Cargo.toml': '[package]\nname = "demo"\nversion = "0.1.0"\nedition = "2021"\n',
    'src/main.rs': 'fn main() {}\n'
  });
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const report = await doctor(root);
  const ids = report.project.adapters.map((adapter) => adapter.id);
  const java = report.project.adapters.find((adapter) => adapter.id === 'java');
  const dotnet = report.project.adapters.find((adapter) => adapter.id === 'dotnet');
  const go = report.project.adapters.find((adapter) => adapter.id === 'go');
  const rust = report.project.adapters.find((adapter) => adapter.id === 'rust');

  assert.ok(ids.includes('java'));
  assert.ok(ids.includes('dotnet'));
  assert.ok(ids.includes('go'));
  assert.ok(ids.includes('rust'));
  assert.ok(java.signals.frameworks.includes('Spring Boot'));
  assert.ok(dotnet.signals.projects.some((project) => project.kind === 'web'));
  assert.ok(go.signals.commandDirs.includes('cmd/api'));
  assert.equal(rust.signals.hasMain, true);
});

test('error classifier recognizes broad setup failure families', () => {
  assert.equal(classifyLog('npm ERR! code ERESOLVE unable to resolve dependency tree').type, 'dependency_resolution');
  assert.equal(classifyLog('Error: listen EADDRINUSE: address already in use :::3000').type, 'port_in_use');
  assert.equal(classifyLog('Prisma Migrate found pending migrations').type, 'database_migration_required');
  assert.equal(classifyLog('SELF_SIGNED_CERT_IN_CHAIN certificate verify failed').type, 'tls_certificate');
  assert.equal(classifyLog('gyp ERR! stack Error: not found: make').type, 'native_build_tools_missing');
  assert.equal(classifyLog('NETSDK1045: The current .NET SDK does not support targeting .NET 9.0').type, 'unsupported_runtime_version');
});
