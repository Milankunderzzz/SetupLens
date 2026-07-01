import fs from 'node:fs';
import path from 'node:path';
import { readJson } from '../../lib/files.js';
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
    issues: []
  };
}
