import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { classifyProbeResult } from './error-classifier.js';

const WINDOWS_SHIMS = new Set(['npm', 'pnpm', 'yarn', 'bun', 'npx', 'composer', 'bundle', 'rails', 'mvn', 'gradle']);
const MAX_OUTPUT = 1024 * 1024 * 4;

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

function appendOutput(current, chunk) {
  if (Buffer.byteLength(current, 'utf8') >= MAX_OUTPUT) return current;
  const next = `${current}${chunk.toString('utf8')}`;
  if (Buffer.byteLength(next, 'utf8') <= MAX_OUTPUT) return next;
  return next.slice(0, MAX_OUTPUT);
}

function killProcessTree(child, signal = 'SIGTERM') {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    return;
  }
  try {
    process.kill(-child.pid, signal);
  } catch {
    child.kill(signal);
  }
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
    safety: input.safety ?? (input.kind === 'startup' ? 'long_running' : 'read_only'),
    destructive: input.destructive === true
  };
}

export async function runProbe(root, probe, options = {}) {
  const timeoutMs = options.timeoutMs ?? 8000;
  const started = performance.now();
  const startedAt = new Date().toISOString();
  const cwd = path.resolve(root, probe.cwd);
  const platformCommand = commandForPlatform(probe.command, probe.args);
  let stdout = '';
  let stderr = '';
  let error = null;
  let timedOut = false;
  const child = spawn(platformCommand.command, platformCommand.args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
    detached: process.platform !== 'win32',
    env: {
      ...process.env,
      CI: process.env.CI ?? 'true',
      SETUPLENS_PROBE: '1'
    },
    shell: false
  });
  let forceKillTimer = null;
  const finished = new Promise((resolve) => {
    child.stdout?.on('data', (chunk) => { stdout = appendOutput(stdout, chunk); });
    child.stderr?.on('data', (chunk) => { stderr = appendOutput(stderr, chunk); });
    child.on('error', (err) => { error = err; });
    child.on('close', (code, signal) => resolve({ code, signal }));
  });
  const timer = setTimeout(() => {
    timedOut = true;
    killProcessTree(child);
    forceKillTimer = setTimeout(() => killProcessTree(child, 'SIGKILL'), 1000);
  }, timeoutMs);
  const result = await finished;
  clearTimeout(timer);
  if (forceKillTimer) clearTimeout(forceKillTimer);
  const durationMs = Math.max(1, Math.round(performance.now() - started));
  const rawStatus = timedOut ? 'timeout' : result.code === 0 ? 'pass' : 'fail';
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
    status: rawStatus,
    rawStatus,
    exitCode: result.code,
    signal: result.signal ?? null,
    durationMs,
    stdout: snippet(stdout),
    stderr: snippet(stderr),
    error: error && !timedOut ? error.message : null,
    trace: {
      policy: options.policy ?? 'safe',
      timeoutMs,
      startedAt,
      finishedAt: new Date().toISOString(),
      platformCommand: commandDisplay(platformCommand.command, platformCommand.args),
      outputBytes: {
        stdout: Buffer.byteLength(stdout, 'utf8'),
        stderr: Buffer.byteLength(stderr, 'utf8')
      },
      timedOut,
      readyDetected: false
    }
  };
  output.classification = classifyProbeResult(output);
  if (output.classification?.type === 'startup_appears_ready') {
    output.status = 'pass';
    output.trace.readyDetected = true;
  }
  return output;
}

function skippedProbe(probe, reason, recommendation, options = {}) {
  return {
    id: probe.id,
    adapter: probe.adapter,
    label: probe.label,
    kind: probe.kind,
    command: probe.command,
    args: probe.args,
    display: probe.display,
    cwd: probe.cwd,
    purpose: probe.purpose,
    status: 'skipped',
    rawStatus: 'skipped',
    exitCode: null,
    signal: null,
    durationMs: 0,
    stdout: '',
    stderr: '',
    error: reason,
    trace: {
      policy: options.policy ?? 'safe',
      timeoutMs: options.timeoutMs ?? 8000,
      startedAt: null,
      finishedAt: null,
      platformCommand: commandDisplay(probe.command, probe.args),
      outputBytes: { stdout: 0, stderr: 0 },
      timedOut: false,
      readyDetected: false,
      skippedByPolicy: true
    },
    classification: {
      type: 'probe_skipped',
      severity: 'info',
      title: 'Probe skipped',
      evidence: reason,
      subject: probe.display,
      recommendation
    }
  };
}

export function runProbes(root, probes, options = {}) {
  const results = [];
  const policy = options.includeStartup ? 'startup-enabled' : 'safe';
  for (const probe of probes) {
    if (probe.destructive) {
      results.push(skippedProbe(
        probe,
        'Probe marked destructive and was not executed.',
        'Run this command manually if you trust the project and want deeper validation.',
        { ...options, policy }
      ));
      continue;
    }
    if (probe.kind === 'startup' && !options.includeStartup) {
      results.push(skippedProbe(
        probe,
        'Startup probes are skipped by the default safe probe policy.',
        'Run setuplens doctor . --probe --probe-startup if you want to execute long-running startup commands.',
        { ...options, policy }
      ));
      continue;
    }
    results.push(runProbe(root, probe, { ...options, policy }));
  }
  return Promise.all(results);
}
