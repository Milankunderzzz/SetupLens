import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { doctor } from '../src/doctor.js';
import { doctorSuite } from '../src/doctor-suite.js';
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

  const safeReport = await doctor(root, { probe: true, timeoutMs: 3000 });
  const skippedStartup = safeReport.probes.results.find((item) => item.id.includes('node.script'));
  assert.equal(skippedStartup.status, 'skipped');
  assert.equal(skippedStartup.trace.skippedByPolicy, true);
  assert.ok(safeReport.diagnosis.unknowns.some((item) => /Startup probes were skipped/.test(item)));

  const report = await doctor(root, { probe: true, probeStartup: true, timeoutMs: 3000 });
  const startupProbe = report.probes.results.find((item) => item.id.includes('node.script'));

  assert.equal(report.status, 'blocked');
  assert.equal(startupProbe.status, 'fail');
  assert.equal(startupProbe.trace.policy, 'startup-enabled');
  assert.equal(startupProbe.classification.type, 'missing_env_var');
  assert.ok(report.diagnosis.rootCauses.some((item) => item.type === 'missing_env_var'));
  assert.ok(report.diagnosis.fixPlan.fixes.some((item) => item.id === 'manual.probe.env.DATABASE_URL'));
  assert.ok(report.diagnosis.nextActions.some((item) => /DATABASE_URL/.test(item.description ?? '')));
  assert.equal(report.diagnosis.actionPanel.topRootCause.type, 'missing_env_var');
});

test('startup probe treats ready output before timeout as a pass signal', async (t) => {
  const root = await fixture({
    'package.json': JSON.stringify({ scripts: { dev: 'node ready.js' } }),
    'ready.js': 'console.log("server ready and listening on http://localhost:3000"); setInterval(() => {}, 1000);\n'
  });
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const report = await doctor(root, { probe: true, probeStartup: true, timeoutMs: 1200 });
  const startupProbe = report.probes.results.find((item) => item.id.includes('node.script'));

  assert.equal(startupProbe.rawStatus, 'timeout');
  assert.equal(startupProbe.status, 'pass');
  assert.equal(startupProbe.classification.type, 'startup_appears_ready');
  assert.equal(startupProbe.trace.readyDetected, true);
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
  assert.ok(parsed.diagnosis.confidence.score >= 0);
  assert.ok(parsed.diagnosis.readiness);
  assert.ok(parsed.diagnosis.actionPanel);
});

test('doctor command writes an HTML action panel report', async (t) => {
  const root = await fixture({
    'package.json': JSON.stringify({ name: 'html-doctor', scripts: { start: 'node index.js' } }),
    'index.js': 'console.log("ok");\n'
  });
  const output = path.join(root, 'doctor.html');
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const result = spawnSync(process.execPath, [cliPath, 'doctor', root, '--format', 'html', '--output', output, '--timeout', '3000'], {
    encoding: 'utf8',
    windowsHide: true
  });

  assert.equal(result.status, 0, result.stderr);
  const html = await fs.readFile(output, 'utf8');
  assert.match(html, /Action Panel/);
  assert.match(html, /Readiness/);
  assert.match(html, /Diagnosis Confidence/);
  assert.match(html, /SetupLens Doctor/);
});

test('doctor command shows terminal fix plan only when requested', async (t) => {
  const root = await fixture({
    'package.json': JSON.stringify({ name: 'cli-fix-plan', scripts: { start: 'node index.js' } }),
    'index.js': 'console.log("ok");\n',
    '.env.example': 'DATABASE_URL=\n'
  });
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const plain = spawnSync(process.execPath, [cliPath, 'doctor', root, '--no-color', '--timeout', '3000'], {
    encoding: 'utf8',
    windowsHide: true
  });
  const planned = spawnSync(process.execPath, [cliPath, 'doctor', root, '--fix-plan', '--no-color', '--timeout', '3000'], {
    encoding: 'utf8',
    windowsHide: true
  });

  assert.equal(plain.status, 0, plain.stderr);
  assert.doesNotMatch(plain.stdout, /Fix plan/);
  assert.equal(planned.status, 0, planned.stderr);
  assert.match(planned.stdout, /Fix plan/);
  assert.match(planned.stdout, /Create local environment file/);
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
  assert.equal(classifyLog("Error: Couldn't find any `pages` or `app` directory.").type, 'next_missing_routes');
  assert.equal(classifyLog('Prisma error P1001: Cannot reach database server at localhost:5432').type, 'prisma_database_unreachable');
  assert.equal(classifyLog('django.core.exceptions.ImproperlyConfigured: Requested setting INSTALLED_APPS, but settings are not configured').type, 'django_settings_error');
  assert.equal(classifyLog('APPLICATION FAILED TO START\nFailed to configure a DataSource').type, 'spring_datasource_config');
  assert.equal(classifyLog('error: package demo does not have feature postgres').type, 'rust_feature_mismatch');
  assert.equal(classifyLog('npm error npx canceled due to missing packages and no YES option: ["next@16.2.9"]').type, 'node_dependencies_missing');
  assert.equal(classifyLog("*** Error compiling './__MACOSX/app/._main.py'...\nSyntaxError: source code string cannot contain null bytes").type, 'macos_resource_fork_files');
});

test('doctor classifies missing local Node binaries as dependency installation gaps', async (t) => {
  const root = await fixture({
    'package.json': JSON.stringify({
      name: 'node-bin-missing',
      scripts: { lint: 'next lint' },
      dependencies: { next: '^14.0.0', react: '^18.2.0', 'react-dom': '^18.2.0' }
    }),
    'app/page.tsx': 'export default function Page() { return <main />; }\n'
  });
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const report = await doctor(root, { probe: true, timeoutMs: 3000 });
  const failedLint = report.probes.results.find((item) => item.id.includes('node.verify') && item.status === 'fail');

  assert.equal(failedLint.classification.type, 'node_dependencies_missing');
  assert.equal(report.diagnosis.rootCauses[0].type, 'node_dependencies_missing');
  assert.ok(report.diagnosis.fixPlan.fixes.some((item) => item.id.startsWith('manual.node.dependencies')));
});

test('doctor separates readiness score from diagnosis confidence and recommends safe next command', async (t) => {
  const root = await fixture({
    'package.json': JSON.stringify({ name: 'env-app', scripts: { start: 'node index.js' } }),
    'index.js': 'console.log(process.env.DATABASE_URL);\n',
    '.env.example': 'DATABASE_URL=\n'
  });
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const report = await doctor(root);

  assert.equal(report.status, 'needs_setup');
  assert.equal(report.diagnosis.actionPanel.nextCommand.type, 'safe_fix');
  assert.match(report.diagnosis.actionPanel.nextCommand.command, /--apply safe/);
  assert.ok(report.diagnosis.readiness.score < 100);
  assert.notEqual(report.diagnosis.readiness.score, report.diagnosis.confidence.score);
});

test('doctor reports macOS archive metadata as the Python compile blocker', async (t) => {
  const root = await fixture({
    'requirements.txt': 'fastapi\n',
    'main.py': 'print("ok")\n',
    '__MACOSX/app/._main.py': '\u0000metadata\n'
  });
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const report = await doctor(root, { probe: true, timeoutMs: 3000 });
  const compileProbe = report.probes.results.find((item) => item.id === 'python.compileall');

  assert.equal(compileProbe.classification.type, 'macos_resource_fork_files');
  assert.ok(report.diagnosis.rootCauses.some((item) => item.type === 'macos_resource_fork_files'));
  assert.match(compileProbe.classification.evidence, /__MACOSX/);
});

test('doctor warns when duplicate package copies look like repeated project snapshots', async (t) => {
  const root = await fixture({
    'copy-a/package.json': JSON.stringify({ name: 'cmms-web', scripts: { dev: 'next dev' }, dependencies: { next: '^14.0.0' } }),
    'copy-b/package.json': JSON.stringify({ name: 'cmms-web', scripts: { dev: 'next dev' }, dependencies: { next: '^14.0.0' } })
  });
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const report = await doctor(root);

  assert.ok(report.diagnosis.rootCauses.some((item) => item.type === 'duplicate_project_copies'));
  assert.ok(report.project.adapters.find((adapter) => adapter.id === 'node').signals.duplicatePackages.length > 0);
});

test('doctor adds deep Next, Vite, Prisma, and TypeScript rules', async (t) => {
  const root = await fixture({
    'package.json': JSON.stringify({
      name: 'web-stack',
      scripts: { dev: 'next dev', build: 'vite build' },
      dependencies: { next: '^15.0.0', vite: '^7.0.0', react: '^19.0.0', '@prisma/client': '^6.0.0' },
      devDependencies: { typescript: '^5.0.0', prisma: '^6.0.0' }
    }),
    'next.config.mjs': 'export default {};\n',
    'vite.config.ts': 'export default {};\n',
    'prisma/schema.prisma': 'generator client { provider = "prisma-client-js" }\ndatasource db { provider = "postgresql" url = env("DATABASE_URL") }\n'
  });
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const report = await doctor(root);
  const node = report.project.adapters.find((adapter) => adapter.id === 'node');
  const prisma = report.project.adapters.find((adapter) => adapter.id === 'prisma');

  assert.equal(node.signals.deep.next.configFiles[0], 'next.config.mjs');
  assert.equal(node.signals.deep.vite.hasIndexHtml, false);
  assert.equal(node.signals.deep.typescript.hasTsconfig, false);
  assert.ok(report.diagnosis.rootCauses.some((item) => item.type === 'next_missing_routes'));
  assert.ok(report.diagnosis.rootCauses.some((item) => item.type === 'vite_missing_index_html'));
  assert.ok(report.diagnosis.rootCauses.some((item) => item.type === 'typescript_missing_tsconfig'));
  assert.equal(prisma.signals.schemaFiles[0].providers[0], 'postgresql');
  assert.ok(report.probes.planned.some((item) => item.id.includes('prisma.generate')));
  assert.ok(report.probes.planned.some((item) => item.id === 'node.next.info'));
});

test('doctor adds deep FastAPI and Django rules', async (t) => {
  const root = await fixture({
    'requirements.txt': 'fastapi\ndjango\n',
    'main.py': 'from fastapi import FastAPI\napp = FastAPI()\n',
    'manage.py': 'print("manage")\n',
    'project/settings.py': 'SECRET_KEY = "x"\n'
  });
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const report = await doctor(root);
  const python = report.project.adapters.find((adapter) => adapter.id === 'python');

  assert.ok(python.signals.deep.fastApiEntrypoints.some((item) => item.module === 'main'));
  assert.ok(python.signals.deep.django.settings.includes('project/settings.py'));
  assert.ok(report.diagnosis.nextActions.some((item) => /uvicorn main:app/.test(item.command ?? '')));
  assert.ok(report.diagnosis.rootCauses.some((item) => item.type === 'fastapi_missing_uvicorn'));
  assert.ok(report.probes.planned.some((item) => item.id === 'python.compileall'));
  assert.ok(report.probes.planned.some((item) => item.id === 'python.django.migrations'));
});

test('safe fix plan can create local env files and compose env placeholders', async (t) => {
  const root = await fixture({
    'composer.json': JSON.stringify({ require: { 'laravel/framework': '^11.0' } }),
    'artisan': '<?php echo "Laravel";\n',
    '.env.example': 'APP_KEY=\nDB_DATABASE=local\n',
    'compose.yaml': 'services:\n  app:\n    image: php:8.3\n    env_file: .env.compose\n'
  });
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const planned = await doctor(root);
  assert.ok(planned.diagnosis.fixPlan.fixes.some((item) => item.id.startsWith('safe.laravel.copy-env')));
  assert.ok(planned.diagnosis.fixPlan.fixes.some((item) => item.id === 'safe.compose-env.env.compose'));

  const applied = await doctor(root, { apply: 'safe' });
  assert.ok(applied.diagnosis.fixPlan.applied.some((item) => item.id.startsWith('safe.laravel.copy-env') && item.status === 'applied'));
  assert.equal(await fs.readFile(path.join(root, '.env'), 'utf8'), 'APP_KEY=\nDB_DATABASE=local\n');
  assert.equal(await fs.readFile(path.join(root, '.env.compose'), 'utf8'), '# Local Compose environment values\n');
});

test('safe fix recipes create tsconfig and Vite index without overwriting', async (t) => {
  const root = await fixture({
    'package.json': JSON.stringify({
      scripts: { dev: 'vite' },
      dependencies: { vite: '^7.0.0', typescript: '^5.0.0' }
    }),
    'src/main.ts': 'console.log("boot");\n'
  });
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const planned = await doctor(root);
  assert.ok(planned.diagnosis.fixPlan.fixes.some((item) => item.id === 'safe.typescript.create-tsconfig'));
  assert.ok(planned.diagnosis.fixPlan.fixes.some((item) => item.id === 'safe.vite.create-index-html'));

  await doctor(root, { apply: 'safe' });
  assert.match(await fs.readFile(path.join(root, 'tsconfig.json'), 'utf8'), /"moduleResolution": "Bundler"/);
  assert.match(await fs.readFile(path.join(root, 'index.html'), 'utf8'), /src\/main\.ts/);
});

test('doctor adds deep Laravel, Rails, Spring, and .NET web rules', async (t) => {
  const root = await fixture({
    'composer.json': JSON.stringify({ require: { 'laravel/framework': '^11.0' } }),
    'artisan': '<?php echo "Laravel";\n',
    '.env': 'APP_KEY=\n',
    'Gemfile': 'source "https://rubygems.org"\ngem "rails"\n',
    'config/credentials.yml.enc': 'encrypted\n',
    'pom.xml': '<project><dependencies><dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-web</artifactId></dependency></dependencies></project>',
    'web.csproj': '<Project Sdk="Microsoft.NET.Sdk.Web"><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>'
  });
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const report = await doctor(root);
  const php = report.project.adapters.find((adapter) => adapter.id === 'php');
  const ruby = report.project.adapters.find((adapter) => adapter.id === 'ruby');
  const java = report.project.adapters.find((adapter) => adapter.id === 'java');
  const dotnet = report.project.adapters.find((adapter) => adapter.id === 'dotnet');

  assert.ok(php.signals.frameworks.includes('Laravel'));
  assert.ok(report.diagnosis.rootCauses.some((item) => item.type === 'laravel_missing_app_key'));
  assert.ok(report.probes.planned.some((item) => item.id === 'php.laravel.migrate-status'));
  assert.ok(report.diagnosis.nextActions.some((item) => item.command === 'php artisan migrate:status'));
  assert.ok(ruby.signals.frameworks.includes('Rails'));
  assert.equal(ruby.signals.credentials, 'config/credentials.yml.enc');
  assert.ok(report.diagnosis.rootCauses.some((item) => item.type === 'rails_missing_master_key'));
  assert.ok(report.diagnosis.rootCauses.some((item) => item.type === 'rails_missing_database_config'));
  assert.ok(report.probes.planned.some((item) => item.id === 'ruby.rails.db-version'));
  assert.deepEqual(java.signals.frameworks, ['Spring Boot']);
  assert.deepEqual(java.signals.spring.files, []);
  assert.ok(report.diagnosis.rootCauses.some((item) => item.type === 'spring_missing_application_config'));
  assert.ok(report.probes.planned.some((item) => item.id === 'java.maven.compile'));
  assert.ok(dotnet.signals.projects.some((project) => project.kind === 'web' && project.targetFrameworks.includes('net8.0')));
  assert.ok(report.diagnosis.rootCauses.some((item) => item.type === 'dotnet_missing_appsettings'));
  assert.ok(report.probes.planned.some((item) => item.id === 'dotnet.build.web.csproj'));
});

test('doctor adds deep Turbo and Nx workspace rules', async (t) => {
  const root = await fixture({
    'package.json': JSON.stringify({
      private: true,
      workspaces: ['apps/*'],
      scripts: { build: 'turbo build', test: 'nx run-many -t test' },
      devDependencies: { turbo: '^2.0.0', nx: '^20.0.0' }
    }),
    'apps/web/package.json': JSON.stringify({ scripts: { dev: 'vite' }, dependencies: { vite: '^7.0.0' } }),
    'turbo.json': JSON.stringify({ tasks: { build: {}, test: {} } }),
    'nx.json': JSON.stringify({ targetDefaults: { build: {}, test: {} } }),
    'pnpm-workspace.yaml': "packages:\n  - 'apps/*'\n"
  });
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const report = await doctor(root);
  const monorepo = report.project.adapters.find((adapter) => adapter.id === 'monorepo');

  assert.ok(monorepo.signals.tools.includes('turbo'));
  assert.ok(monorepo.signals.tools.includes('nx'));
  assert.deepEqual(monorepo.signals.turbo.tasks, ['build', 'test']);
  assert.deepEqual(monorepo.signals.nx.targetDefaults, ['build', 'test']);
  assert.ok(report.probes.planned.some((item) => item.id === 'monorepo.turbo.dry-run'));
  assert.ok(report.probes.planned.some((item) => item.id === 'monorepo.nx.graph'));
});

test('doctor deepens Go service and Rust binary signals', async (t) => {
  const root = await fixture({
    'go.mod': 'module example.com/service\n\ngo 1.22\n',
    'internal/server/server.go': 'package server\nimport "net/http"\nfunc Run() { _ = http.ListenAndServe(":8080", nil) }\n',
    'Cargo.toml': '[package]\nname = "worker"\nversion = "0.1.0"\nedition = "2021"\n',
    'src/bin/worker.rs': 'fn main() { let _ = std::env::var("DATABASE_URL"); }\n'
  });
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const report = await doctor(root);
  const go = report.project.adapters.find((adapter) => adapter.id === 'go');
  const rust = report.project.adapters.find((adapter) => adapter.id === 'rust');

  assert.ok(go.signals.serviceSignals.httpServerFiles.includes('internal/server/server.go'));
  assert.ok(report.diagnosis.rootCauses.some((item) => item.type === 'go_service_missing_cmd_entry'));
  assert.deepEqual(rust.signals.binTargets, ['src/bin/worker.rs']);
  assert.ok(rust.signals.serviceSignals.envKeys.includes('DATABASE_URL'));
  assert.ok(report.diagnosis.nextActions.some((item) => item.command === 'cargo run --bin worker'));
});

test('doctor-suite summarizes repositories, ecosystems, and failure types', async (t) => {
  const root = await fixture({
    'app-one/package.json': JSON.stringify({
      scripts: { dev: 'vite' },
      dependencies: { vite: '^7.0.0', typescript: '^5.0.0' }
    }),
    'app-one/src/main.ts': 'console.log("one");\n',
    'app-two/go.mod': 'module example.com/service\n\ngo 1.22\n',
    'app-two/internal/server/server.go': 'package server\nimport "net/http"\nfunc Run() { _ = http.ListenAndServe(":8080", nil) }\n'
  });
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const report = await doctorSuite(root);
  const failureTypes = report.summary.failureTypeDistribution.map((item) => item.name);
  const ecosystems = report.summary.ecosystemCoverage.map((item) => item.name);

  assert.equal(report.schemaVersion, '1.0-doctor-suite');
  assert.equal(report.summary.total, 2);
  assert.ok(ecosystems.includes('Vite'));
  assert.ok(ecosystems.includes('go'));
  assert.ok(failureTypes.includes('vite_missing_index_html'));
  assert.ok(failureTypes.includes('go_service_missing_cmd_entry'));

  const cli = spawnSync(process.execPath, [cliPath, 'doctor-suite', root, '--format', 'json', '--timeout', '3000'], {
    encoding: 'utf8',
    windowsHide: true
  });
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(JSON.parse(cli.stdout).summary.total, 2);
});
