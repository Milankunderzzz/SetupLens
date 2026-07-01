import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

const SAFE_APPLY_TYPES = new Set(['copy_file', 'append_lines', 'create_file']);

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function resolveInside(root, relative) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relative);
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Refusing to write outside repository: ${relative}`);
  }
  return resolved;
}

function uniqueBy(items, key) {
  const seen = new Set();
  const output = [];
  for (const item of items) {
    const value = key(item);
    if (seen.has(value)) continue;
    seen.add(value);
    output.push(item);
  }
  return output;
}

function envTemplateFix(index) {
  const template = index.files.find((file) => ['.env.example', '.env.sample', '.env.template'].includes(file.name));
  if (!template) return null;
  const directory = path.posix.dirname(template.relative);
  const target = directory === '.' ? '.env' : `${directory}/.env`;
  if (index.byRelative.has(target)) return null;
  return {
    id: `safe.copy-env.${template.relative}`,
    source: 'configuration',
    title: `Create local environment file from ${template.relative}`,
    description: `Copy ${template.relative} to ${target} without overwriting an existing file.`,
    safety: 'safe',
    confidence: 'high',
    apply: { type: 'copy_file', from: template.relative, to: target }
  };
}

function gitignoreEnvFix(index) {
  const gitignore = index.byRelative.get('.gitignore');
  const patterns = ['.env', '.env.*', '!.env.example', '!.env.sample', '!.env.template'];
  if (gitignore && fsSync.existsSync(gitignore.absolute)) {
    const text = fsSync.readFileSync(gitignore.absolute, 'utf8');
    const existing = new Set(text.split(/\r?\n/).map((line) => line.trim()));
    if (patterns.every((line) => existing.has(line))) return null;
  }
  return {
    id: 'safe.gitignore-env',
    source: 'security',
    title: 'Ignore local environment files',
    description: 'Append local environment file rules to .gitignore while keeping templates trackable.',
    safety: 'safe',
    confidence: gitignore ? 'high' : 'medium',
    apply: { type: 'append_lines', path: '.gitignore', lines: patterns }
  };
}

function rootPackage(index) {
  return index.byRelative.get('package.json');
}

function viteEntry(index) {
  const entry = index.files.find((file) => ['src/main.ts', 'src/main.tsx', 'src/main.js', 'src/main.jsx'].includes(file.relative));
  return entry?.relative ?? 'src/main.ts';
}

function issueRecipeFix(index, adapter, issue) {
  if (issue.type === 'typescript_missing_tsconfig' && !index.byRelative.has('tsconfig.json')) {
    return {
      id: 'safe.typescript.create-tsconfig',
      source: adapter.id,
      title: 'Create minimal tsconfig.json',
      description: 'Create a conservative TypeScript config for local framework checks without overwriting an existing file.',
      safety: 'safe',
      confidence: 'medium',
      reason: 'The file is missing and the recipe only creates a new project-local config.',
      apply: {
        type: 'create_file',
        path: 'tsconfig.json',
        contents: `${JSON.stringify({
          compilerOptions: {
            target: 'ES2022',
            module: 'ESNext',
            moduleResolution: 'Bundler',
            strict: true,
            jsx: 'preserve',
            noEmit: true,
            skipLibCheck: true
          },
          include: ['src', 'app', 'pages', '*.ts', '*.tsx']
        }, null, 2)}\n`
      }
    };
  }
  if (issue.type === 'vite_missing_index_html' && !index.byRelative.has('index.html')) {
    const entry = viteEntry(index);
    return {
      id: 'safe.vite.create-index-html',
      source: adapter.id,
      title: 'Create minimal Vite index.html',
      description: `Create index.html pointing to /${entry} without overwriting an existing file.`,
      safety: 'safe',
      confidence: 'medium',
      reason: 'Vite expects an HTML entry file and this recipe only creates the missing entry shell.',
      apply: {
        type: 'create_file',
        path: 'index.html',
        contents: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vite App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/${entry}"></script>
  </body>
</html>
`
      }
    };
  }
  if (issue.type === 'next_missing_scripts' && rootPackage(index)) {
    return {
      id: 'manual.next.scripts-patch',
      source: adapter.id,
      title: 'Review Next.js package scripts patch',
      description: 'Review adding dev/build/start scripts for Next.js. This is manual because package scripts may be organization-specific.',
      safety: 'manual',
      confidence: 'medium',
      reason: 'Changing package scripts can alter project behavior, so SetupLens only proposes the patch.',
      patch: {
        file: 'package.json',
        summary: 'Add scripts: "dev": "next dev", "build": "next build", "start": "next start".'
      }
    };
  }
  if (issue.type === 'vite_missing_scripts' && rootPackage(index)) {
    return {
      id: 'manual.vite.scripts-patch',
      source: adapter.id,
      title: 'Review Vite package scripts patch',
      description: 'Review adding dev/build/preview scripts for Vite. This is manual because package scripts may be organization-specific.',
      safety: 'manual',
      confidence: 'medium',
      reason: 'Changing package scripts can alter project behavior, so SetupLens only proposes the patch.',
      patch: {
        file: 'package.json',
        summary: 'Add scripts: "dev": "vite", "build": "vite build", "preview": "vite preview".'
      }
    };
  }
  if (issue.type === 'missing_env_reference') {
    const key = issue.title.match(/: ([A-Z][A-Z0-9_]{2,})$/)?.[1] ?? issue.evidence?.match(/\b([A-Z][A-Z0-9_]{2,})\b/)?.[1];
    if (!key) return null;
    const template = index.files.find((file) => ['.env.example', '.env.sample', '.env.template', '.env.local.example'].includes(file.name));
    return {
      id: `manual.env-template.${key}`,
      source: adapter.id,
      title: `Review env template entry for ${key}`,
      description: template
        ? `Review adding ${key}= to ${template.relative} so new clones know this configuration is required.`
        : `Review creating .env.example with ${key}= so new clones know this configuration is required.`,
      safety: 'manual',
      confidence: 'medium',
      reason: 'Environment values are project-specific, so SetupLens only proposes a template diff.',
      patch: {
        file: template?.relative ?? '.env.example',
        summary: `Add a documented ${key}= placeholder.`
      }
    };
  }
  return null;
}

function fixFromIssue(adapter, issue) {
  if (!issue.safeFix) return null;
  return {
    id: issue.safeFix.id ?? `safe.${adapter.id}.${issue.type}`,
    source: adapter.id,
    title: issue.safeFix.title ?? issue.title,
    description: issue.safeFix.description ?? issue.recommendation,
    safety: issue.safeFix.safety ?? 'safe',
    confidence: issue.safeFix.confidence ?? adapter.confidence,
    reason: issue.safeFix.reason ?? 'Adapter marked this repair as safe for local application.',
    apply: issue.safeFix.apply
  };
}

function fixFromCause(cause) {
  if (!cause?.type) return null;
  if (cause.type === 'missing_env_var') {
    const key = cause.evidence?.match(/\b([A-Z][A-Z0-9_]{2,})\b/)?.[1] ?? cause.subject;
    return {
      id: `manual.probe.env.${key ?? 'required'}`,
      source: cause.source,
      title: key ? `Set required environment variable ${key}` : 'Set required environment variable',
      description: cause.recommendation,
      safety: 'manual',
      confidence: cause.confidence ?? 'medium',
      reason: 'Runtime values are environment-specific and cannot be safely guessed.'
    };
  }
  if (cause.type === 'port_in_use') {
    return {
      id: 'manual.probe.port-in-use',
      source: cause.source,
      title: 'Free or change the occupied port',
      description: cause.recommendation,
      safety: 'manual',
      confidence: cause.confidence ?? 'medium',
      reason: 'Stopping processes or changing ports requires user context.'
    };
  }
  if (['database_unreachable', 'database_migration_required'].includes(cause.type)) {
    return {
      id: `manual.probe.${cause.type}`,
      source: cause.source,
      title: cause.title,
      description: cause.recommendation,
      safety: 'manual',
      confidence: cause.confidence ?? 'medium',
      reason: 'Database startup and migrations can affect external state, so SetupLens does not apply them automatically.'
    };
  }
  if (cause.type === 'module_not_found') {
    return {
      id: 'manual.probe.module-not-found',
      source: cause.source,
      title: 'Install or restore the missing module',
      description: cause.recommendation,
      safety: 'manual',
      confidence: cause.confidence ?? 'medium',
      reason: 'Installing packages changes dependency state and should follow the project package manager policy.'
    };
  }
  if (cause.type === 'laravel_missing_app_key') {
    return {
      id: 'manual.laravel.key-generate',
      source: cause.source,
      title: 'Generate local Laravel APP_KEY',
      description: cause.recommendation,
      safety: 'manual',
      confidence: cause.confidence ?? 'medium',
      reason: 'Key generation mutates environment state and should only happen for local development.'
    };
  }
  return null;
}

export function buildFixPlan({ index, adapters, rootCauses = [] }) {
  const adapterFixes = adapters.flatMap((adapter) => (adapter.issues ?? [])
    .flatMap((issue) => [fixFromIssue(adapter, issue), issueRecipeFix(index, adapter, issue)])
    .filter(Boolean));
  const causeFixes = rootCauses.map(fixFromCause).filter(Boolean);
  const genericFixes = [envTemplateFix(index), gitignoreEnvFix(index)].filter(Boolean);
  const fixes = uniqueBy([...adapterFixes, ...causeFixes, ...genericFixes], (fix) => {
    if (fix.apply?.type === 'copy_file') return `copy:${fix.apply.to}`;
    if (fix.apply?.type === 'append_lines') return `append:${fix.apply.path}`;
    if (fix.apply?.type === 'create_file') return `create:${fix.apply.path}`;
    return fix.id;
  })
    .map((fix) => ({
      ...fix,
      canApply: fix.safety === 'safe' && SAFE_APPLY_TYPES.has(fix.apply?.type)
    }));

  return {
    safeCount: fixes.filter((fix) => fix.canApply).length,
    manualCount: fixes.filter((fix) => !fix.canApply).length,
    fixes,
    applied: []
  };
}

async function copyFile(root, apply) {
  const from = resolveInside(root, apply.from);
  const to = resolveInside(root, apply.to);
  if (!fsSync.existsSync(from)) return { status: 'skipped', message: `Source does not exist: ${apply.from}` };
  if (fsSync.existsSync(to)) return { status: 'skipped', message: `Target already exists: ${apply.to}` };
  await fs.mkdir(path.dirname(to), { recursive: true });
  await fs.copyFile(from, to);
  return { status: 'applied', message: `Created ${toPosix(path.relative(root, to))}` };
}

async function appendLines(root, apply) {
  const target = resolveInside(root, apply.path);
  const existing = fsSync.existsSync(target) ? await fs.readFile(target, 'utf8') : '';
  const existingLines = new Set(existing.split(/\r?\n/).map((line) => line.trim()));
  const missing = apply.lines.filter((line) => !existingLines.has(line.trim()));
  if (missing.length === 0) return { status: 'skipped', message: `${apply.path} already contains the requested lines` };
  await fs.mkdir(path.dirname(target), { recursive: true });
  const prefix = existing && !existing.endsWith('\n') ? '\n' : '';
  await fs.appendFile(target, `${prefix}${missing.join('\n')}\n`, 'utf8');
  return { status: 'applied', message: `Updated ${apply.path}` };
}

async function createFile(root, apply) {
  const target = resolveInside(root, apply.path);
  if (fsSync.existsSync(target)) return { status: 'skipped', message: `Target already exists: ${apply.path}` };
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, apply.contents ?? '', 'utf8');
  return { status: 'applied', message: `Created ${apply.path}` };
}

export async function applySafeFixes(root, fixPlan) {
  const applied = [];
  for (const fix of fixPlan.fixes) {
    if (!fix.canApply) continue;
    let result;
    if (fix.apply.type === 'copy_file') result = await copyFile(root, fix.apply);
    else if (fix.apply.type === 'append_lines') result = await appendLines(root, fix.apply);
    else if (fix.apply.type === 'create_file') result = await createFile(root, fix.apply);
    else result = { status: 'skipped', message: `Unsupported safe fix type: ${fix.apply.type}` };
    applied.push({ id: fix.id, title: fix.title, ...result });
  }
  return { ...fixPlan, applied };
}
