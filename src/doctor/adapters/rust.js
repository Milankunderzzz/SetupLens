import path from 'node:path';
import { readText } from '../../lib/files.js';
import { createProbe } from '../probes.js';

async function cargoInfo(file) {
  const text = await readText(file);
  return {
    path: file.relative,
    directory: path.posix.dirname(file.relative) === '.' ? '.' : path.posix.dirname(file.relative),
    packageName: text?.match(/^\s*name\s*=\s*["']([^"']+)["']/m)?.[1] ?? null,
    workspace: /^\s*\[workspace\]/m.test(text ?? '')
  };
}

export async function rustAdapter({ index, detection }) {
  const cargoFiles = index.files.filter((file) => file.name === 'Cargo.toml');
  if (!detection.stacks.includes('rust') && cargoFiles.length === 0) return null;

  const manifests = [];
  for (const file of cargoFiles) manifests.push(await cargoInfo(file));
  const root = manifests.find((item) => item.directory === '.') ?? manifests[0];
  const hasMain = index.files.some((file) => file.relative === 'src/main.rs' || file.relative.endsWith('/src/main.rs'));
  const binTargets = index.files
    .filter((file) => /(?:^|\/)src\/bin\/.+\.rs$/.test(file.relative))
    .map((file) => file.relative);
  const sourceTexts = [];
  for (const file of index.files.filter((item) => item.extension === '.rs' && item.size < 512 * 1024)) {
    const text = await readText(file);
    if (text) sourceTexts.push({ file: file.relative, text });
  }
  const serviceSignals = {
    webFrameworks: [
      sourceTexts.some((item) => /actix_web|HttpServer::new/.test(item.text)) ? 'Actix Web' : null,
      sourceTexts.some((item) => /axum|Router::new/.test(item.text)) ? 'Axum' : null,
      sourceTexts.some((item) => /rocket::/.test(item.text)) ? 'Rocket' : null
    ].filter(Boolean),
    envKeys: [...new Set(sourceTexts.flatMap((item) => [...item.text.matchAll(/(?:std::env::var|env::var)\(["']([A-Z][A-Z0-9_]{2,})["']\)/g)].map((match) => match[1])))].sort()
  };
  const runCommand = binTargets.length > 0
    ? `cargo run --bin ${path.posix.basename(binTargets[0], '.rs')}`
    : 'cargo run';

  return {
    id: 'rust',
    title: 'Rust project adapter',
    confidence: hasMain ? 'high' : 'medium',
    signals: {
      manifests,
      hasMain,
      binTargets,
      serviceSignals
    },
    actions: [
      {
        type: 'install',
        command: 'cargo fetch',
        cwd: root?.directory ?? '.',
        reason: `${root?.path ?? 'Cargo.toml'} declares Rust dependencies.`,
        confidence: 'high'
      },
      {
        type: hasMain ? 'run' : 'verify',
        command: hasMain || binTargets.length > 0 ? runCommand : 'cargo test',
        cwd: root?.directory ?? '.',
        reason: hasMain ? 'src/main.rs indicates a runnable binary.' : binTargets.length > 0 ? `${binTargets[0]} indicates a runnable binary target.` : 'No Rust binary target was found; cargo test is the safest verification path.',
        confidence: hasMain || binTargets.length > 0 ? 'high' : 'medium'
      }
    ],
    probes: [
      createProbe({
        id: 'rust.cargo.version',
        adapter: 'rust',
        label: 'Cargo',
        command: 'cargo',
        args: ['--version'],
        purpose: 'Verify that Cargo is available.',
        confidence: 'high'
      }),
      createProbe({
        id: 'rust.cargo.check',
        adapter: 'rust',
        label: 'Cargo check',
        command: 'cargo',
        args: ['check'],
        cwd: root?.directory ?? '.',
        purpose: 'Type-check the Rust project without producing final binaries.',
        kind: 'verify',
        confidence: 'medium'
      })
    ],
    issues: []
  };
}
