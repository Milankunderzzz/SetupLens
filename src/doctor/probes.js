import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { classifyProbeResult } from './error-classifier.js';

const WINDOWS_SHIMS = new Set(['npm', 'pnpm', 'yarn', 'bun', 'npx', 'composer', 'bundle', 'rails', 'mvn', 'gradle']);

function quoteWindowsArg(value) {
  const text = String(value);
  if (!/[\s"]/u.test(text)) return text;
  return `"${text.replaceAll('"', '\\"')}"`;
}

function commandForPlatform(command, args) {
  if (process.platform === 'win32' && (WINDOWS_SHIMS.has(command) || /\.(?:bat|cmd)$/i.test(command) || command.startsWith('./'))) {
    return {
      command: process.env.ComSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', [command.replace(/^\.\//, ''), ...args].map(quoteWindowsArg).join(' ')]
    };
  }
  return { command, args };
}

function snippet(value, max = 5000) {
  const text = String(value ?? '').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n[output truncated]`;
}

export function commandDisplay(command, args = []) {
  return [command, ...args].join(' ');
}

export function createProbe(input) {
  return {
    id: input.id,
    adapter: input.adapter,
    label: input.label,
    kind: input.kind ?? 'diagnostic',
    command: input.command,
    args: input.args ?? [],
    cwd: input.cwd ?? '.',
    display: input.display ?? commandDisplay(input.command, input.args ?? []),
    purpose: input.purpose,
    confidence: input.confidence ?? 'medium',
    destructive: input.destructive === true
  };
}

export function runProbe(root, probe, options = {}) {
  const timeoutMs = options.timeoutMs ?? 8000;
  const started = performance.now();
  const cwd = path.resolve(root, probe.cwd);
  const platformCommand = commandForPlatform(probe.command, probe.args);
  const result = spawnSync(platformCommand.command, platformCommand.args, {
    cwd,
    encoding: 'utf8',
    timeout: timeoutMs,
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 4,
    env: {
      ...process.env,
      CI: process.env.CI ?? 'true',
      SETUPLENS_PROBE: '1'
    },
    shell: false
  });
  const durationMs = Math.max(1, Math.round(performance.now() - started));
  const timedOut = result.error?.code === 'ETIMEDOUT' || result.signal === 'SIGTERM';
  const status = timedOut ? 'timeout' : result.status === 0 ? 'pass' : 'fail';
  const output = {
    id: probe.id,
    adapter: probe.adapter,
    label: probe.label,
    kind: probe.kind,
    command: probe.command,
    args: probe.args,
    display: probe.display,
    cwd: probe.cwd,
    purpose: probe.purpose,
    status,
    exitCode: result.status,
    signal: result.signal ?? null,
    durationMs,
    stdout: snippet(result.stdout),
    stderr: snippet(result.stderr),
    error: result.error && !timedOut ? result.error.message : null
  };
  output.classification = classifyProbeResult(output);
  return output;
}

export function runProbes(root, probes, options = {}) {
  const results = [];
  for (const probe of probes) {
    if (probe.destructive) {
      results.push({
        id: probe.id,
        adapter: probe.adapter,
        label: probe.label,
        kind: probe.kind,
        display: probe.display,
        cwd: probe.cwd,
        purpose: probe.purpose,
        status: 'skipped',
        exitCode: null,
        signal: null,
        durationMs: 0,
        stdout: '',
        stderr: '',
        error: 'Probe marked destructive and was not executed.',
        classification: {
          type: 'probe_skipped',
          severity: 'info',
          title: 'Probe skipped',
          evidence: null,
          subject: probe.display,
          recommendation: 'Run this command manually if you trust the project and want deeper validation.'
        }
      });
      continue;
    }
    results.push(runProbe(root, probe, options));
  }
  return results;
}
