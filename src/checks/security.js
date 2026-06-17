import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { readText } from '../lib/files.js';
import { finding, isPlaceholder, lineNumberAt } from '../lib/utils.js';

const SECRET_PATTERNS = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g, 'Private key material'],
  ['github-token', /(?:github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,})/g, 'GitHub access token'],
  ['openai-key', /sk-[A-Za-z0-9_-]{20,}/g, 'OpenAI-style API key'],
  ['aws-key', /AKIA[0-9A-Z]{16}/g, 'AWS access key'],
  ['supabase-secret', /sb_secret_[A-Za-z0-9_-]{20,}/g, 'Supabase secret key'],
  ['database-url', /postgres(?:ql)?(?:\+asyncpg)?:\/\/[^:\s"']+:([^@\s"']+)@[^\s"']+/gi, 'Credentialed PostgreSQL URL']
];

const ASSIGNMENT_PATTERN = /\b(JWT_SECRET_KEY|SECRET_KEY|API_KEY|DATABASE_PASSWORD|DB_PASSWORD)\b\s*[:=]\s*["']([^"']+)["']/gi;

function trackedFiles(root) {
  const result = spawnSync('git', ['ls-files', '-z'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 4000,
    windowsHide: true
  });
  if (result.status !== 0) return new Set();
  return new Set(result.stdout.split('\0').filter(Boolean).map((item) => item.replaceAll('\\', '/')));
}

function ignoreSecretMatch(id, match) {
  if (id === 'database-url') return isPlaceholder(match[1]);
  return isPlaceholder(match[0]);
}

function isSuppressed(text, index) {
  const lineStart = text.lastIndexOf('\n', index) + 1;
  const lineEnd = text.indexOf('\n', index);
  const line = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd);
  return line.includes('setuplens: allow-secret');
}

export async function securityFindings(index) {
  const findings = [];
  const tracked = trackedFiles(index.root);
  const actualEnvFiles = index.files.filter((file) => /^\.env(?:\.|$)/.test(file.name) && !/\.(?:example|sample|template)$/.test(file.name));
  const trackedEnv = actualEnvFiles.filter((file) => tracked.has(file.relative));

  findings.push(finding({
    id: 'security.tracked-env',
    category: 'Security',
    status: trackedEnv.length === 0 ? 'pass' : 'fail',
    title: 'Tracked environment files',
    message: trackedEnv.length === 0 ? 'No local environment files are tracked by Git.' : `${trackedEnv.length} local environment files are tracked by Git.`,
    evidence: trackedEnv.map((file) => file.relative).join(', ') || null,
    recommendation: trackedEnv.length === 0 ? null : 'Remove local environment files from Git history and rotate exposed credentials.',
    weight: trackedEnv.length === 0 ? 0 : 18
  }));

  const matches = [];
  for (const file of index.files) {
    if (matches.length >= 20 || file.name.endsWith('.lock') || file.name === 'package-lock.json') continue;
    const text = await readText(file);
    if (text === null) continue;

    for (const [id, pattern, label] of SECRET_PATTERNS) {
      pattern.lastIndex = 0;
      for (const match of text.matchAll(pattern)) {
        if (ignoreSecretMatch(id, match) || isSuppressed(text, match.index)) continue;
        matches.push({ id, label, file: file.relative, line: lineNumberAt(text, match.index) });
        if (matches.length >= 20) break;
      }
    }

    ASSIGNMENT_PATTERN.lastIndex = 0;
    for (const match of text.matchAll(ASSIGNMENT_PATTERN)) {
      if (isPlaceholder(match[2]) || match[2].length < 12 || isSuppressed(text, match.index)) continue;
      matches.push({ id: 'hardcoded-secret', label: `Hardcoded ${match[1]}`, file: file.relative, line: lineNumberAt(text, match.index) });
      if (matches.length >= 20) break;
    }
  }

  findings.push(finding({
    id: 'security.secret-scan',
    category: 'Security',
    status: matches.length === 0 ? 'pass' : 'fail',
    title: 'Credential patterns',
    message: matches.length === 0 ? 'No high-confidence credential patterns were found.' : `${matches.length} possible credential exposures were found. Values are never printed.`,
    evidence: matches.slice(0, 8).map((item) => `${item.label} at ${item.file}:${item.line}`).join(', ') || null,
    recommendation: matches.length === 0 ? null : 'Move credentials to local environment files, purge Git history, and rotate affected secrets.',
    weight: matches.length === 0 ? 0 : 20
  }));

  const gitignore = index.byRelative.get('.gitignore');
  if (actualEnvFiles.length > 0 || gitignore) {
    let ignoresEnv = false;
    if (gitignore) {
      const text = await readText(gitignore);
      ignoresEnv = /(^|\n)\s*\.env(?:\*|\s|$)/m.test(text ?? '');
    }
    findings.push(finding({
      id: 'security.gitignore-env',
      category: 'Security',
      status: ignoresEnv ? 'pass' : 'warn',
      title: 'Environment ignore rule',
      message: ignoresEnv ? '.gitignore protects local environment files.' : '.gitignore does not clearly ignore .env files.',
      recommendation: ignoresEnv ? null : 'Add .env and local variants to .gitignore while keeping example templates tracked.',
      weight: ignoresEnv ? 0 : 6
    }));
  }

  return findings;
}
