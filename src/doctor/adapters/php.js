import fs from 'node:fs';
import path from 'node:path';
import { readJson, readText } from '../../lib/files.js';
import { createProbe } from '../probes.js';

function dependencies(manifest) {
  return {
    ...manifest.require,
    ...manifest['require-dev']
  };
}

function commandIn(directory, command) {
  return directory === '.' ? command : `cd ${directory} && ${command}`;
}

export async function phpAdapter({ index }) {
  const composerFiles = index.files.filter((file) => file.name === 'composer.json');
  const artisanFiles = index.files.filter((file) => file.name === 'artisan');
  const phpEntrypoints = index.files.filter((file) => ['index.php', 'public/index.php'].includes(file.relative));
  if (composerFiles.length === 0 && artisanFiles.length === 0 && phpEntrypoints.length === 0) return null;

  const projects = [];
  const frameworks = new Set();
  for (const file of composerFiles) {
    const manifest = await readJson(file);
    const directory = path.posix.dirname(file.relative) === '.' ? '.' : path.posix.dirname(file.relative);
    const deps = manifest ? dependencies(manifest) : {};
    if (deps['laravel/framework'] || artisanFiles.some((item) => path.posix.dirname(item.relative) === directory)) frameworks.add('Laravel');
    if (deps['symfony/framework-bundle'] || deps['symfony/http-kernel']) frameworks.add('Symfony');
    if (deps['drupal/core']) frameworks.add('Drupal');
    if (deps['wordpress/wordpress']) frameworks.add('WordPress');
    projects.push({ path: file.relative, directory, dependencies: Object.keys(deps).sort().slice(0, 12) });
  }

  const rootComposer = composerFiles.find((file) => path.posix.dirname(file.relative) === '.') ?? composerFiles[0];
  const rootDirectory = rootComposer ? (path.posix.dirname(rootComposer.relative) === '.' ? '.' : path.posix.dirname(rootComposer.relative)) : '.';
  const hasVendor = fs.existsSync(path.join(index.root, rootDirectory, 'vendor'));
  const envExample = index.byRelative.get(rootDirectory === '.' ? '.env.example' : `${rootDirectory}/.env.example`);
  const envFile = index.byRelative.get(rootDirectory === '.' ? '.env' : `${rootDirectory}/.env`);
  const actions = [];
  if (composerFiles.length > 0 && !hasVendor) {
    actions.push({
      type: 'install',
      command: commandIn(rootDirectory, 'composer install'),
      cwd: rootDirectory,
      reason: `${rootComposer.relative} declares PHP dependencies and vendor/ is not indexed.`,
      confidence: 'high'
    });
  }

  const artisan = artisanFiles[0];
  if (artisan) {
    const directory = path.posix.dirname(artisan.relative) === '.' ? '.' : path.posix.dirname(artisan.relative);
    actions.push({
      type: 'run',
      command: commandIn(directory, 'php artisan serve'),
      cwd: directory,
      reason: 'artisan indicates a Laravel application.',
      confidence: 'high'
    });
    actions.push({
      type: 'setup',
      command: commandIn(directory, 'php artisan migrate:status'),
      cwd: directory,
      reason: 'Laravel database migration status is commonly required before startup.',
      confidence: 'medium'
    });
  } else if (phpEntrypoints.length > 0) {
    actions.push({
      type: 'run',
      command: 'php -S localhost:8000 -t public',
      cwd: '.',
      reason: 'A PHP front controller was detected.',
      confidence: phpEntrypoints.some((file) => file.relative === 'public/index.php') ? 'medium' : 'low'
    });
  }

  const probes = [
    createProbe({
      id: 'php.runtime.version',
      adapter: 'php',
      label: 'PHP runtime',
      command: 'php',
      args: ['--version'],
      purpose: 'Verify that PHP is available before running framework commands.',
      confidence: 'high'
    })
  ];
  if (composerFiles.length > 0) {
    probes.push(createProbe({
      id: 'php.composer.version',
      adapter: 'php',
      label: 'Composer',
      command: 'composer',
      args: ['--version'],
      cwd: rootDirectory,
      purpose: 'Verify that Composer is available for PHP dependency installation.',
      confidence: 'high'
    }));
  }
  if (artisan) {
    probes.push(createProbe({
      id: 'php.laravel.version',
      adapter: 'php',
      label: 'Laravel artisan',
      command: 'php',
      args: ['artisan', '--version'],
      cwd: path.posix.dirname(artisan.relative) === '.' ? '.' : path.posix.dirname(artisan.relative),
      purpose: 'Verify that Laravel can bootstrap enough to report its version.',
      kind: 'verify',
      confidence: 'medium'
    }));
    probes.push(createProbe({
      id: 'php.laravel.migrate-status',
      adapter: 'php',
      label: 'Laravel migration status',
      command: 'php',
      args: ['artisan', 'migrate:status'],
      cwd: path.posix.dirname(artisan.relative) === '.' ? '.' : path.posix.dirname(artisan.relative),
      purpose: 'Inspect Laravel migration state without applying migrations.',
      kind: 'verify',
      confidence: 'medium'
    }));
  }

  const issues = [];
  if (frameworks.has('Laravel') && envExample && !envFile) {
    const target = rootDirectory === '.' ? '.env' : `${rootDirectory}/.env`;
    issues.push({
      type: 'laravel_missing_env',
      severity: 'warn',
      title: 'Laravel .env file is missing',
      evidence: `${envExample.relative} exists but ${target} was not found.`,
      recommendation: `Copy ${envExample.relative} to ${target} and fill in local values.`,
      safeFix: {
        id: `safe.laravel.copy-env.${envExample.relative}`,
        title: 'Create Laravel .env from template',
        description: `Copy ${envExample.relative} to ${target} without overwriting an existing file.`,
        apply: { type: 'copy_file', from: envExample.relative, to: target }
      }
    });
  }
  if (frameworks.has('Laravel') && envFile) {
    const envText = await readText(envFile);
    if (!/^APP_KEY=base64:/m.test(envText ?? '')) {
      issues.push({
        type: 'laravel_missing_app_key',
        severity: 'warn',
        title: 'Laravel APP_KEY is not configured',
        evidence: `${envFile.relative} does not contain a base64 APP_KEY.`,
        recommendation: 'Run php artisan key:generate after confirming this is a local development environment.'
      });
    }
  }

  return {
    id: 'php',
    title: 'PHP project adapter',
    confidence: frameworks.size > 0 ? 'high' : 'medium',
    signals: {
      frameworks: [...frameworks].sort(),
      projects,
      entrypoints: phpEntrypoints.map((file) => file.relative)
    },
    actions,
    probes,
    issues
  };
}
