import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { doctor } from '../src/doctor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CORPUS_PATH = path.resolve(__dirname, '../docs/failure-corpus/cases.json');
const REVIEW_PATH = path.resolve(__dirname, '../.setuplens/failure-dataset/review.json');
const REVIEW_DOC = 'docs/failure-dataset/scan-review-2026-07-09.md';
const GENERATED_KIND = 'public_scan_distilled_pattern';

function renderFile(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'json' in value) return `${JSON.stringify(value.json, null, 2)}\n`;
  if (value && typeof value === 'object' && 'text' in value) return String(value.text);
  throw new Error('Fixture file values must be strings, { text }, or { json }.');
}

async function writeFixture(root, files) {
  for (const [relative, contents] of Object.entries(files)) {
    const target = path.join(root, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, renderFile(contents), 'utf8');
  }
}

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function pickEvidence(review, template) {
  const candidates = asArray(review?.promotionCandidates);
  const byRoot = candidates.find((candidate) => asArray(candidate.scan?.rootCauseTypes).includes(template.rootType));
  const byEcosystem = candidates.find((candidate) => asArray(candidate.scan?.ecosystems).some((item) => template.ecosystems.includes(String(item).toLowerCase())));
  const candidate = byRoot ?? byEcosystem ?? candidates[0] ?? null;
  return candidate ? {
    sourceId: candidate.id,
    project: candidate.source?.fullName ?? null,
    htmlUrl: candidate.source?.htmlUrl ?? null,
    rootCauseType: candidate.scan?.topRootCause?.type ?? template.rootType,
    status: candidate.scan?.status ?? null
  } : {
    sourceId: null,
    project: null,
    htmlUrl: null,
    rootCauseType: template.rootType,
    status: null
  };
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function topExpectedRootCauses(report, fallback) {
  const actual = report.diagnosis.rootCauses.map((cause) => cause.type);
  if (fallback && actual.includes(fallback)) {
    return unique([fallback, ...actual.filter((type) => type !== fallback)]).slice(0, 4);
  }
  return actual.slice(0, 4);
}

async function buildCase(template, review) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `setuplens-public-pattern-${template.id}-`));
  try {
    await writeFixture(root, template.files);
    const report = await doctor(root, { timeoutMs: 3000 });
    const safeFixTitles = asArray(report.diagnosis.fixPlan?.fixes)
      .filter((fix) => fix.canApply)
      .map((fix) => fix.title)
      .slice(0, 3);
    const evidence = pickEvidence(review, template);
    return {
      id: `public-alpha3-${template.id}`,
      ecosystems: template.ecosystems,
      source: {
        kind: GENERATED_KIND,
        label: template.label,
        reference: REVIEW_DOC,
        sanitized: true,
        provenance: {
          derivedFrom: 'failure-dataset review and promotion candidates',
          sourceId: evidence.sourceId,
          project: evidence.project,
          url: evidence.htmlUrl,
          observedRootCauseType: evidence.rootCauseType,
          observedStatus: evidence.status
        }
      },
      fixture: { files: template.files },
      expect: {
        status: report.status,
        adapters: report.project.adapters.map((adapter) => adapter.id),
        rootCauseTypes: topExpectedRootCauses(report, template.rootType),
        safeFixTitles
      }
    };
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

function pkg(name, extra = {}) {
  return { json: { name, version: '0.0.0', private: true, ...extra } };
}

const templates = [
  {
    id: 'next-missing-routes',
    label: 'Distilled public scan pattern: Next.js package without route roots',
    ecosystems: ['next', 'node'],
    rootType: 'next_missing_routes',
    files: {
      'package.json': pkg('next-missing-routes', {
        scripts: { dev: 'next dev', build: 'next build' },
        dependencies: { next: '^15.0.0', react: '^19.0.0', 'react-dom': '^19.0.0' }
      })
    }
  },
  {
    id: 'next-missing-scripts',
    label: 'Distilled public scan pattern: Next.js app without npm scripts',
    ecosystems: ['next', 'node'],
    rootType: 'next_missing_scripts',
    files: {
      'package.json': pkg('next-missing-scripts', {
        dependencies: { next: '^15.0.0', react: '^19.0.0', 'react-dom': '^19.0.0' }
      }),
      'app/page.tsx': 'export default function Page() { return <main>hello</main>; }\n'
    }
  },
  {
    id: 'next-typescript-no-tsconfig',
    label: 'Distilled public scan pattern: TypeScript Next.js app without tsconfig',
    ecosystems: ['next', 'node', 'typescript'],
    rootType: 'typescript_missing_tsconfig',
    files: {
      'package.json': pkg('next-typescript-no-tsconfig', {
        scripts: { dev: 'next dev', build: 'next build' },
        dependencies: { next: '^15.0.0', react: '^19.0.0', 'react-dom': '^19.0.0' },
        devDependencies: { typescript: '^5.0.0' }
      }),
      'app/page.tsx': 'export default function Page() { return <main>{process.env.NEXT_PUBLIC_SITE_NAME}</main>; }\n'
    }
  },
  {
    id: 'next-env-reference',
    label: 'Distilled public scan pattern: Next.js source references undocumented env',
    ecosystems: ['next', 'node'],
    rootType: 'missing_env_reference',
    files: {
      'package.json': pkg('next-env-reference', {
        scripts: { dev: 'next dev' },
        dependencies: { next: '^15.0.0', react: '^19.0.0', 'react-dom': '^19.0.0' }
      }),
      'app/page.tsx': 'export default function Page() { return <main>{process.env.NEXT_PUBLIC_API_URL}</main>; }\n'
    }
  },
  {
    id: 'next-prisma-postgres',
    label: 'Distilled public scan pattern: Next.js Prisma app missing env and migrations',
    ecosystems: ['next', 'prisma', 'node'],
    rootType: 'missing_prisma_env',
    files: {
      'package.json': pkg('next-prisma-postgres', {
        scripts: { dev: 'next dev', build: 'next build' },
        dependencies: { next: '^15.0.0', react: '^19.0.0', '@prisma/client': '^6.0.0' },
        devDependencies: { prisma: '^6.0.0', typescript: '^5.0.0' }
      }),
      'app/page.tsx': 'export default function Page() { return <main>db</main>; }\n',
      'prisma/schema.prisma': 'generator client { provider = "prisma-client-js" }\ndatasource db { provider = "postgresql" url = env("DATABASE_URL") }\n'
    }
  },
  {
    id: 'vite-missing-index',
    label: 'Distilled public scan pattern: Vite app without index.html',
    ecosystems: ['vite', 'node'],
    rootType: 'vite_missing_index_html',
    files: {
      'package.json': pkg('vite-missing-index', {
        scripts: { dev: 'vite', build: 'vite build' },
        dependencies: { vite: '^7.0.0' }
      }),
      'src/main.ts': 'console.log("missing html");\n'
    }
  },
  {
    id: 'vite-missing-scripts',
    label: 'Distilled public scan pattern: Vite dependency without runnable scripts',
    ecosystems: ['vite', 'node'],
    rootType: 'vite_missing_scripts',
    files: {
      'package.json': pkg('vite-missing-scripts', {
        dependencies: { vite: '^7.0.0' }
      }),
      'index.html': '<div id="app"></div><script type="module" src="/src/main.ts"></script>\n',
      'src/main.ts': 'console.log("no scripts");\n'
    }
  },
  {
    id: 'vite-typescript-no-tsconfig',
    label: 'Distilled public scan pattern: Vite TypeScript app without tsconfig',
    ecosystems: ['vite', 'node', 'typescript'],
    rootType: 'typescript_missing_tsconfig',
    files: {
      'package.json': pkg('vite-typescript-no-tsconfig', {
        scripts: { dev: 'vite', build: 'vite build' },
        dependencies: { vite: '^7.0.0' },
        devDependencies: { typescript: '^5.0.0' }
      }),
      'index.html': '<div id="app"></div><script type="module" src="/src/main.ts"></script>\n',
      'src/main.ts': 'const root: HTMLElement | null = document.querySelector("#app"); console.log(root);\n'
    }
  },
  {
    id: 'vite-env-reference',
    label: 'Distilled public scan pattern: Vite app with missing environment reference',
    ecosystems: ['vite', 'node'],
    rootType: 'missing_env_reference',
    files: {
      'package.json': pkg('vite-env-reference', {
        scripts: { dev: 'vite' },
        dependencies: { vite: '^7.0.0' }
      }),
      'index.html': '<div id="app"></div><script type="module" src="/src/main.js"></script>\n',
      'src/main.js': 'console.log(process.env.PUBLIC_API_BASE);\n'
    }
  },
  {
    id: 'prisma-missing-env',
    label: 'Distilled public scan pattern: Prisma schema references missing env',
    ecosystems: ['prisma', 'node'],
    rootType: 'missing_prisma_env',
    files: {
      'package.json': pkg('prisma-missing-env', {
        dependencies: { '@prisma/client': '^6.0.0' },
        devDependencies: { prisma: '^6.0.0' }
      }),
      'prisma/schema.prisma': 'generator client { provider = "prisma-client-js" }\ndatasource db { provider = "mysql" url = env("DATABASE_URL") }\n'
    }
  },
  {
    id: 'prisma-missing-migrations',
    label: 'Distilled public scan pattern: Prisma non-sqlite datasource without migrations',
    ecosystems: ['prisma', 'node'],
    rootType: 'prisma_missing_migrations',
    files: {
      'package.json': pkg('prisma-missing-migrations', {
        dependencies: { '@prisma/client': '^6.0.0' },
        devDependencies: { prisma: '^6.0.0' }
      }),
      '.env': 'DATABASE_URL=postgresql://localhost:5432/app\n',
      'prisma/schema.prisma': 'generator client { provider = "prisma-client-js" }\ndatasource db { provider = "postgresql" url = env("DATABASE_URL") }\n'
    }
  },
  {
    id: 'fastapi-requirements-no-uvicorn',
    label: 'Distilled public scan pattern: FastAPI app without uvicorn dependency',
    ecosystems: ['fastapi', 'python'],
    rootType: 'fastapi_missing_uvicorn',
    files: {
      'requirements.txt': 'fastapi==0.115.0\n',
      'main.py': 'from fastapi import FastAPI\napp = FastAPI()\n'
    }
  },
  {
    id: 'fastapi-pyproject-no-uvicorn',
    label: 'Distilled public scan pattern: pyproject FastAPI service without ASGI server',
    ecosystems: ['fastapi', 'python'],
    rootType: 'fastapi_missing_uvicorn',
    files: {
      'pyproject.toml': '[project]\nname = "fastapi-pyproject-no-uvicorn"\ndependencies = ["fastapi"]\n',
      'app.py': 'from fastapi import FastAPI\napp = FastAPI()\n'
    }
  },
  {
    id: 'django-missing-settings',
    label: 'Distilled public scan pattern: Django manage.py without settings module',
    ecosystems: ['django', 'python'],
    rootType: 'django_missing_settings',
    files: {
      'requirements.txt': 'django==5.0.0\n',
      'manage.py': 'import os\nfrom django.core.management import execute_from_command_line\nexecute_from_command_line()\n'
    }
  },
  {
    id: 'django-nested-missing-settings',
    label: 'Distilled public scan pattern: nested Django app without settings module',
    ecosystems: ['django', 'python'],
    rootType: 'django_missing_settings',
    files: {
      'api/requirements.txt': 'django==5.0.0\n',
      'api/manage.py': 'from django.core.management import execute_from_command_line\nexecute_from_command_line()\n'
    }
  },
  {
    id: 'laravel-missing-env',
    label: 'Distilled public scan pattern: Laravel template exists but local .env is missing',
    ecosystems: ['laravel', 'php'],
    rootType: 'laravel_missing_env',
    files: {
      'composer.json': { json: { require: { 'laravel/framework': '^11.0' } } },
      'artisan': '#!/usr/bin/env php\n<?php\n',
      '.env.example': 'APP_NAME=Laravel\nAPP_KEY=\n'
    }
  },
  {
    id: 'laravel-missing-app-key',
    label: 'Distilled public scan pattern: Laravel .env exists without APP_KEY',
    ecosystems: ['laravel', 'php'],
    rootType: 'laravel_missing_app_key',
    files: {
      'composer.json': { json: { require: { 'laravel/framework': '^11.0' } } },
      'artisan': '#!/usr/bin/env php\n<?php\n',
      '.env': 'APP_NAME=Laravel\nAPP_KEY=\n'
    }
  },
  {
    id: 'laravel-nested-missing-env',
    label: 'Distilled public scan pattern: nested Laravel app missing .env',
    ecosystems: ['laravel', 'php'],
    rootType: 'laravel_missing_env',
    files: {
      'backend/composer.json': { json: { require: { 'laravel/framework': '^11.0' } } },
      'backend/artisan': '#!/usr/bin/env php\n<?php\n',
      'backend/.env.example': 'APP_NAME=Backend\nAPP_KEY=\n'
    }
  },
  {
    id: 'rails-missing-master-key',
    label: 'Distilled public scan pattern: Rails encrypted credentials without master key',
    ecosystems: ['rails', 'ruby'],
    rootType: 'rails_missing_master_key',
    files: {
      'Gemfile': 'source "https://rubygems.org"\ngem "rails"\n',
      'bin/rails': '#!/usr/bin/env ruby\n',
      'config/credentials.yml.enc': 'encrypted\n',
      'config/database.yml': 'development:\n  adapter: sqlite3\n'
    }
  },
  {
    id: 'rails-missing-database-yml',
    label: 'Distilled public scan pattern: Rails app without database.yml',
    ecosystems: ['rails', 'ruby'],
    rootType: 'rails_missing_database_config',
    files: {
      'Gemfile': 'source "https://rubygems.org"\ngem "rails"\n',
      'bin/rails': '#!/usr/bin/env ruby\n'
    }
  },
  {
    id: 'rails-credentials-and-database',
    label: 'Distilled public scan pattern: Rails credentials and database config gaps',
    ecosystems: ['rails', 'ruby'],
    rootType: 'rails_missing_master_key',
    files: {
      'Gemfile': 'source "https://rubygems.org"\ngem "rails"\n',
      'bin/rails': '#!/usr/bin/env ruby\n',
      'config/credentials.yml.enc': 'encrypted\n'
    }
  },
  {
    id: 'spring-maven-missing-config',
    label: 'Distilled public scan pattern: Spring Boot Maven app without application config',
    ecosystems: ['spring', 'java'],
    rootType: 'spring_missing_application_config',
    files: {
      'pom.xml': '<project><dependencies><dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-web</artifactId></dependency></dependencies></project>\n',
      'src/main/java/demo/App.java': 'package demo; class App {}\n'
    }
  },
  {
    id: 'spring-gradle-missing-config',
    label: 'Distilled public scan pattern: Spring Boot Gradle app without application config',
    ecosystems: ['spring', 'java'],
    rootType: 'spring_missing_application_config',
    files: {
      'build.gradle': 'plugins { id "org.springframework.boot" version "3.3.0" }\ndependencies { implementation "org.springframework.boot:spring-boot-starter-web" }\n',
      'src/main/java/demo/App.java': 'package demo; class App {}\n'
    }
  },
  {
    id: 'dotnet-web-missing-appsettings',
    label: 'Distilled public scan pattern: .NET Web SDK project without appsettings',
    ecosystems: ['dotnet'],
    rootType: 'dotnet_missing_appsettings',
    files: {
      'Web.csproj': '<Project Sdk="Microsoft.NET.Sdk.Web"><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>\n',
      'Program.cs': 'var builder = WebApplication.CreateBuilder(args);\n'
    }
  },
  {
    id: 'dotnet-nested-web-missing-appsettings',
    label: 'Distilled public scan pattern: nested .NET web project without appsettings',
    ecosystems: ['dotnet'],
    rootType: 'dotnet_missing_appsettings',
    files: {
      'src/Web/Web.csproj': '<Project Sdk="Microsoft.NET.Sdk.Web"><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>\n',
      'src/Web/Program.cs': 'var builder = WebApplication.CreateBuilder(args);\n'
    }
  },
  {
    id: 'go-service-missing-cmd',
    label: 'Distilled public scan pattern: Go HTTP service without cmd entrypoint',
    ecosystems: ['go'],
    rootType: 'go_service_missing_cmd_entry',
    files: {
      'go.mod': 'module example.com/service\n\ngo 1.22\n',
      'internal/server/server.go': 'package server\nimport "net/http"\nfunc Run() { _ = http.ListenAndServe(":8080", nil) }\n'
    }
  },
  {
    id: 'go-service-env-no-cmd',
    label: 'Distilled public scan pattern: Go service env config without conventional command',
    ecosystems: ['go'],
    rootType: 'go_service_missing_cmd_entry',
    files: {
      'go.mod': 'module example.com/envservice\n\ngo 1.22\n',
      'server.go': 'package envservice\nimport ("net/http"; "os")\nfunc Run() { _ = os.Getenv("DATABASE_URL"); _ = http.ListenAndServe(":8080", nil) }\n'
    }
  },
  {
    id: 'rust-main-env-service',
    label: 'Distilled public scan pattern: Rust binary with runtime environment dependency',
    ecosystems: ['rust'],
    rootType: null,
    files: {
      'Cargo.toml': '[package]\nname = "rust-main-env-service"\nversion = "0.1.0"\nedition = "2021"\n',
      'src/main.rs': 'fn main() { let _ = std::env::var("DATABASE_URL").unwrap(); }\n'
    }
  },
  {
    id: 'rust-bin-target',
    label: 'Distilled public scan pattern: Rust project with explicit bin target',
    ecosystems: ['rust'],
    rootType: null,
    files: {
      'Cargo.toml': '[package]\nname = "rust-bin-target"\nversion = "0.1.0"\nedition = "2021"\n',
      'src/bin/api.rs': 'fn main() { println!("api"); }\n'
    }
  },
  {
    id: 'compose-missing-env-file',
    label: 'Distilled public scan pattern: Compose env_file missing',
    ecosystems: ['docker', 'services'],
    rootType: 'missing_compose_env_file',
    files: {
      'docker-compose.yml': 'services:\n  db:\n    image: postgres:16\n    env_file:\n      - .env.db\n'
    }
  },
  {
    id: 'compose-multiple-missing-env-files',
    label: 'Distilled public scan pattern: Compose service group missing env files',
    ecosystems: ['docker', 'services'],
    rootType: 'missing_compose_env_file',
    files: {
      'compose.yml': 'services:\n  api:\n    image: node:22\n    env_file: api.env\n  worker:\n    image: node:22\n    env_file:\n      - worker.env\n'
    }
  },
  {
    id: 'compose-broken-dockerfile-path',
    label: 'Distilled public scan pattern: Compose build references missing Dockerfile',
    ecosystems: ['docker'],
    rootType: 'paths.compose.docker-compose.yml',
    files: {
      'docker-compose.yml': 'services:\n  api:\n    build:\n      context: .\n      dockerfile: infra/Dockerfile.api\n',
      'src/index.js': 'console.log("api");\n'
    }
  },
  {
    id: 'compose-broken-volume-path',
    label: 'Distilled public scan pattern: Compose volume references missing local file',
    ecosystems: ['docker'],
    rootType: 'paths.compose.docker-compose.yml',
    files: {
      'docker-compose.yml': 'services:\n  nginx:\n    image: nginx:alpine\n    volumes:\n      - ./infra/nginx.conf:/etc/nginx/nginx.conf:ro\n'
    }
  },
  {
    id: 'makefile-bad-npm-script',
    label: 'Distilled public scan pattern: Makefile references missing npm script',
    ecosystems: ['node'],
    rootType: 'paths.makefile.Makefile',
    files: {
      'Makefile': 'format:\n\tcd web && npm run format\n',
      'web/package.json': pkg('makefile-web', { scripts: { dev: 'vite', build: 'vite build' }, dependencies: { vite: '^7.0.0' } })
    }
  },
  {
    id: 'node-env-reference',
    label: 'Distilled public scan pattern: Node app references undocumented env',
    ecosystems: ['node'],
    rootType: 'missing_env_reference',
    files: {
      'package.json': pkg('node-env-reference', { scripts: { start: 'node src/index.js' } }),
      'src/index.js': 'console.log(process.env.API_SECRET);\n'
    }
  },
  {
    id: 'node-env-template-missing-local',
    label: 'Distilled public scan pattern: Node env template exists but local env is missing',
    ecosystems: ['node'],
    rootType: 'configuration.env.missing..env.example',
    files: {
      'package.json': pkg('node-env-template-missing-local', { scripts: { start: 'node index.js' } }),
      '.env.example': 'API_SECRET=\n',
      'index.js': 'console.log(process.env.API_SECRET);\n'
    }
  },
  {
    id: 'node-duplicate-package-copies',
    label: 'Distilled public scan pattern: duplicated package copies in one checkout',
    ecosystems: ['node'],
    rootType: 'duplicate_project_copies',
    files: {
      'package.json': pkg('duplicated-app', { scripts: { start: 'node index.js' } }),
      'index.js': 'console.log("root");\n',
      'copy/package.json': pkg('duplicated-app', { scripts: { start: 'node index.js' } }),
      'copy/index.js': 'console.log("copy");\n'
    }
  },
  {
    id: 'npm-workspace-missing-install',
    label: 'Distilled public scan pattern: npm workspace missing root install',
    ecosystems: ['node', 'monorepo'],
    rootType: 'dependencies.node.workspace-installed',
    files: {
      'package.json': pkg('workspace-root', { workspaces: ['apps/*'], scripts: { build: 'npm -w apps/web run build' } }),
      'apps/web/package.json': pkg('workspace-web', { scripts: { build: 'vite build' }, dependencies: { vite: '^7.0.0' } }),
      'apps/web/index.html': '<div id="app"></div>\n'
    }
  },
  {
    id: 'turbo-workspace-missing-install',
    label: 'Distilled public scan pattern: Turbo workspace missing install',
    ecosystems: ['turbo', 'monorepo', 'node'],
    rootType: 'dependencies.node.workspace-installed',
    files: {
      'package.json': pkg('turbo-root', { workspaces: ['apps/*'], scripts: { build: 'turbo run build', dev: 'turbo run dev' }, devDependencies: { turbo: '^2.0.0' } }),
      'turbo.json': { json: { tasks: { build: { outputs: ['dist/**'] }, dev: { cache: false } } } },
      'apps/web/package.json': pkg('turbo-web', { scripts: { build: 'vite build', dev: 'vite' }, dependencies: { vite: '^7.0.0' } }),
      'apps/web/index.html': '<div id="app"></div>\n'
    }
  },
  {
    id: 'nx-workspace-missing-install',
    label: 'Distilled public scan pattern: Nx workspace missing install',
    ecosystems: ['nx', 'monorepo', 'node'],
    rootType: 'dependencies.node.workspace-installed',
    files: {
      'package.json': pkg('nx-root', { workspaces: ['apps/*'], scripts: { build: 'nx run-many -t build' }, devDependencies: { nx: '^21.0.0' } }),
      'nx.json': { json: { targetDefaults: { build: { cache: true }, test: { cache: true } } } },
      'apps/api/package.json': pkg('nx-api', { scripts: { build: 'node build.js' } }),
      'apps/api/build.js': 'console.log("build");\n'
    }
  },
  {
    id: 'compose-node-env-combo',
    label: 'Distilled public scan pattern: Compose env file plus Node env reference',
    ecosystems: ['docker', 'services', 'node'],
    rootType: 'missing_compose_env_file',
    files: {
      'package.json': pkg('compose-node-env-combo', { scripts: { start: 'node src/index.js' } }),
      'src/index.js': 'console.log(process.env.DATABASE_URL);\n',
      'docker-compose.yml': 'services:\n  api:\n    build: .\n    env_file:\n      - .env.local\n'
    }
  },
  {
    id: 'vite-prisma-env-combo',
    label: 'Distilled public scan pattern: Vite frontend with Prisma env gap',
    ecosystems: ['vite', 'prisma', 'node'],
    rootType: 'missing_prisma_env',
    files: {
      'package.json': pkg('vite-prisma-env-combo', {
        scripts: { dev: 'vite', build: 'vite build' },
        dependencies: { vite: '^7.0.0', '@prisma/client': '^6.0.0' },
        devDependencies: { prisma: '^6.0.0' }
      }),
      'index.html': '<div id="app"></div><script type="module" src="/src/main.js"></script>\n',
      'src/main.js': 'console.log("vite");\n',
      'prisma/schema.prisma': 'generator client { provider = "prisma-client-js" }\ndatasource db { provider = "postgresql" url = env("DATABASE_URL") }\n'
    }
  },
  {
    id: 'dotnet-solution-web-missing-appsettings',
    label: 'Distilled public scan pattern: .NET solution with web project missing appsettings',
    ecosystems: ['dotnet'],
    rootType: 'dotnet_missing_appsettings',
    files: {
      'App.sln': 'Microsoft Visual Studio Solution File, Format Version 12.00\n',
      'src/App/App.csproj': '<Project Sdk="Microsoft.NET.Sdk.Web"><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>\n'
    }
  }
];

async function main() {
  const corpus = await readJson(CORPUS_PATH);
  const review = await readJson(REVIEW_PATH, {});
  const handwritten = asArray(corpus.cases).filter((item) => item.source?.kind !== GENERATED_KIND);
  const generated = [];
  for (const template of templates) generated.push(await buildCase(template, review));
  const nextCorpus = {
    ...corpus,
    description: `${corpus.description} Public alpha.3 scan patterns are distilled into sanitized minimal fixtures after review.`,
    cases: [...handwritten, ...generated]
  };
  await fs.writeFile(CORPUS_PATH, `${JSON.stringify(nextCorpus, null, 2)}\n`, 'utf8');
  process.stdout.write(`Promoted ${generated.length} distilled public scan patterns. Corpus cases: ${nextCorpus.cases.length}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
