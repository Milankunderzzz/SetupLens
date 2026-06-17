import path from 'node:path';
import { spawnSync } from 'node:child_process';

export function toPosix(value) {
  return value.split(path.sep).join('/');
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function gradeForScore(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function parseVersion(value) {
  const match = String(value).match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)];
}

export function minimumVersion(requirement) {
  const match = String(requirement ?? '').match(/(?:>=|\^|~)?\s*(\d+)\.(\d+)(?:\.(\d+))?/);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)] : null;
}

export function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] > right[index]) return 1;
    if (left[index] < right[index]) return -1;
  }
  return 0;
}

export function formatVersion(version) {
  return version ? version.join('.') : 'unknown';
}

export function commandVersion(command, args = ['--version']) {
  const usesCommandShim = process.platform === 'win32' && ['npm', 'pnpm', 'yarn', 'bun'].includes(command);
  const executable = usesCommandShim ? (process.env.ComSpec || 'cmd.exe') : command;
  const commandArgs = usesCommandShim
    ? ['/d', '/s', '/c', `${command}.cmd ${args.join(' ')}`]
    : args;
  const result = spawnSync(executable, commandArgs, {
    encoding: 'utf8',
    timeout: 4000,
    windowsHide: true,
    shell: false
  });

  if (result.error || result.status !== 0) return null;
  return `${result.stdout ?? ''}${result.stderr ?? ''}`.trim().split(/\r?\n/)[0] || null;
}

export function isPlaceholder(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return true;
  if (['password', 'passwd', 'secret', 'token', 'example', 'sample', 'placeholder', 'changeme', 'development'].includes(normalized)) {
    return true;
  }
  return [
    'change-me', 'change_me', 'replace-me', 'replace_me', 'your-', 'your_',
    '<password>', '<secret>', '<token>', '${', 'xxx', 'dev-only', 'dev_only'
  ].some((part) => normalized.includes(part));
}

export function lineNumberAt(text, index) {
  return text.slice(0, index).split('\n').length;
}

export function finding(input) {
  return {
    id: input.id,
    category: input.category,
    status: input.status,
    title: input.title,
    message: input.message,
    evidence: input.evidence ?? null,
    recommendation: input.recommendation ?? null,
    weight: input.weight ?? 0
  };
}

export function uniqueBy(items, key) {
  const seen = new Set();
  return items.filter((item) => {
    const value = key(item);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}
