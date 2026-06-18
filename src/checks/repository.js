import path from 'node:path';
import { FINDING_SCOPES } from '../constants.js';
import { finding } from '../lib/utils.js';

function hasAny(index, names) {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  return index.files.some((file) => wanted.has(file.name.toLowerCase()));
}

export function repositoryFindings(index) {
  const readme = hasAny(index, ['README.md', 'README', 'README.rst']);
  const license = hasAny(index, ['LICENSE', 'LICENSE.md', 'COPYING']);
  const gitignore = Boolean(index.byRelative.get('.gitignore'));
  const ci = index.files.some((file) => file.relative.startsWith('.github/workflows/') && /\.ya?ml$/i.test(file.name));
  const tests = index.files.some((file) => /(^|\/)(test|tests|__tests__)(\/|$)/i.test(file.relative) || /\.(test|spec)\.[cm]?[jt]sx?$/i.test(file.name));

  return [
    finding({
      id: 'repository.readme', category: 'Repository', scope: FINDING_SCOPES.HYGIENE, status: readme ? 'pass' : 'fail', title: 'README',
      message: readme ? 'A README is present.' : 'No README was found.',
      recommendation: readme ? null : 'Add a README with a one-sentence value proposition and a copy-paste quick start.', weight: readme ? 0 : 10
    }),
    finding({
      id: 'repository.license', category: 'Repository', scope: FINDING_SCOPES.HYGIENE, status: license ? 'pass' : 'warn', title: 'License',
      message: license ? 'A license file is present.' : 'No license file was found.',
      recommendation: license ? null : 'Choose and add an explicit open-source license.', weight: license ? 0 : 4
    }),
    finding({
      id: 'repository.gitignore', category: 'Repository', scope: FINDING_SCOPES.HYGIENE, status: gitignore ? 'pass' : 'warn', title: '.gitignore',
      message: gitignore ? '.gitignore is present.' : '.gitignore is missing.',
      recommendation: gitignore ? null : 'Add ignore rules for dependencies, build artifacts, local configuration, and logs.', weight: gitignore ? 0 : 5
    }),
    finding({
      id: 'repository.ci', category: 'Repository', scope: FINDING_SCOPES.HYGIENE, status: ci ? 'pass' : 'warn', title: 'Continuous integration',
      message: ci ? 'A GitHub Actions workflow is present.' : 'No GitHub Actions workflow was found.',
      recommendation: ci ? null : 'Add a small cross-platform CI workflow that runs tests and SetupLens.', weight: ci ? 0 : 4
    }),
    finding({
      id: 'repository.tests', category: 'Repository', scope: FINDING_SCOPES.HYGIENE, status: tests ? 'pass' : 'warn', title: 'Automated tests',
      message: tests ? 'Test files or test directories are present.' : 'No conventional test files were found.',
      recommendation: tests ? null : 'Add a focused smoke test for the primary user workflow.', weight: tests ? 0 : 5
    }),
    finding({
      id: 'repository.index-limit', category: 'Repository', status: index.truncated ? 'warn' : 'pass', title: 'Repository scan coverage',
      message: index.truncated ? 'The file index reached its safety limit.' : `Indexed ${index.files.length} files without hitting safety limits.`,
      recommendation: index.truncated ? 'Use plugins or narrower scan roots for very large monorepos.' : null, weight: index.truncated ? 2 : 0
    })
  ];
}
