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

function fixFromIssue(adapter, issue) {
  if (!issue.safeFix) return null;
  return {
    id: issue.safeFix.id ?? `safe.${adapter.id}.${issue.type}`,
    source: adapter.id,
    title: issue.safeFix.title ?? issue.title,
    description: issue.safeFix.description ?? issue.recommendation,
    safety: issue.safeFix.safety ?? 'safe',
    confidence: issue.safeFix.confidence ?? adapter.confidence,
    apply: issue.safeFix.apply
  };
}

export function buildFixPlan({ index, adapters }) {
  const adapterFixes = adapters.flatMap((adapter) => (adapter.issues ?? [])
    .map((issue) => fixFromIssue(adapter, issue))
    .filter(Boolean));
  const genericFixes = [envTemplateFix(index), gitignoreEnvFix(index)].filter(Boolean);
  const fixes = uniqueBy([...adapterFixes, ...genericFixes], (fix) => {
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
