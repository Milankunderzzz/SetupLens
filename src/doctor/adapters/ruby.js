import fs from 'node:fs';
import path from 'node:path';
import { readText } from '../../lib/files.js';
import { createProbe } from '../probes.js';

function hasGem(text, name) {
  return new RegExp(`gem\\s+["']${name}["']`).test(text);
}

export async function rubyAdapter({ index }) {
  const gemfiles = index.files.filter((file) => file.name === 'Gemfile');
  const railsBins = index.files.filter((file) => file.relative.endsWith('bin/rails') || file.name === 'rails');
  const rackFiles = index.files.filter((file) => file.name === 'config.ru');
  if (gemfiles.length === 0 && railsBins.length === 0 && rackFiles.length === 0) return null;

  const frameworks = new Set();
  const projects = [];
  for (const file of gemfiles) {
    const text = await readText(file);
    const directory = path.posix.dirname(file.relative) === '.' ? '.' : path.posix.dirname(file.relative);
    if (text) {
      if (hasGem(text, 'rails')) frameworks.add('Rails');
      if (hasGem(text, 'sinatra')) frameworks.add('Sinatra');
      if (hasGem(text, 'jekyll')) frameworks.add('Jekyll');
    }
    projects.push({ path: file.relative, directory });
  }
  if (railsBins.length > 0) frameworks.add('Rails');

  const rootGemfile = gemfiles[0];
  const rootDirectory = rootGemfile ? (path.posix.dirname(rootGemfile.relative) === '.' ? '.' : path.posix.dirname(rootGemfile.relative)) : '.';
  const hasVendorBundle = fs.existsSync(path.join(index.root, rootDirectory, 'vendor', 'bundle'));
  const actions = [];
  if (gemfiles.length > 0 && !hasVendorBundle) {
    actions.push({
      type: 'install',
      command: 'bundle install',
      cwd: rootDirectory,
      reason: `${rootGemfile.relative} declares Ruby dependencies.`,
      confidence: 'high'
    });
  }
  if (frameworks.has('Rails')) {
    actions.push({
      type: 'run',
      command: 'bundle exec rails server',
      cwd: rootDirectory,
      reason: 'Rails evidence was detected.',
      confidence: 'high'
    });
  } else if (rackFiles.length > 0) {
    actions.push({
      type: 'run',
      command: 'bundle exec rackup',
      cwd: rootDirectory,
      reason: 'config.ru indicates a Rack application.',
      confidence: 'medium'
    });
  }

  const probes = [
    createProbe({
      id: 'ruby.runtime.version',
      adapter: 'ruby',
      label: 'Ruby runtime',
      command: 'ruby',
      args: ['--version'],
      purpose: 'Verify that Ruby is available before running bundle commands.',
      confidence: 'high'
    })
  ];
  if (gemfiles.length > 0) {
    probes.push(createProbe({
      id: 'ruby.bundle.version',
      adapter: 'ruby',
      label: 'Bundler',
      command: 'bundle',
      args: ['--version'],
      cwd: rootDirectory,
      purpose: 'Verify that Bundler is available for Ruby dependency installation.',
      confidence: 'high'
    }));
  }
  if (frameworks.has('Rails')) {
    probes.push(createProbe({
      id: 'ruby.rails.version',
      adapter: 'ruby',
      label: 'Rails',
      command: 'bundle',
      args: ['exec', 'rails', '--version'],
      cwd: rootDirectory,
      purpose: 'Verify that Rails can load through Bundler.',
      kind: 'verify',
      confidence: 'medium'
    }));
  }

  return {
    id: 'ruby',
    title: 'Ruby project adapter',
    confidence: frameworks.size > 0 ? 'high' : 'medium',
    signals: {
      frameworks: [...frameworks].sort(),
      projects,
      rackFiles: rackFiles.map((file) => file.relative)
    },
    actions,
    probes,
    issues: []
  };
}
