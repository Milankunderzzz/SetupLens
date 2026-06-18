import fs from 'node:fs';
import path from 'node:path';
import { findNamed, readText } from '../lib/files.js';
import { finding, lineNumberAt, toPosix } from '../lib/utils.js';

function cleanYamlValue(value) {
  return value.trim().replace(/^['"]|['"]$/g, '').split(/\s+#/)[0];
}

function composeReferences(text, composeDirectory) {
  const references = [];
  const lines = text.split(/\r?\n/);
  let currentContext = '.';
  let buildIndent = -1;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const indent = line.match(/^\s*/)[0].length;
    const trimmed = line.trim();

    if (/^build:\s*$/.test(trimmed)) {
      buildIndent = indent;
      currentContext = '.';
      continue;
    }
    if (buildIndent >= 0 && indent <= buildIndent && trimmed && !trimmed.startsWith('#')) {
      buildIndent = -1;
      currentContext = '.';
    }
    if (buildIndent >= 0) {
      const contextMatch = trimmed.match(/^context:\s*(.+)$/);
      if (contextMatch) currentContext = cleanYamlValue(contextMatch[1]);
      const dockerfileMatch = trimmed.match(/^dockerfile:\s*(.+)$/);
      if (dockerfileMatch) {
        const value = cleanYamlValue(dockerfileMatch[1]);
        if (!value.includes('${')) {
          references.push({
            type: 'Dockerfile',
            value,
            absolute: path.resolve(composeDirectory, currentContext, value),
            line: index + 1
          });
        }
      }
    }

    const volumeMatch = trimmed.match(/^[-]\s+(.+?):(?:\/|[A-Za-z]:\\)/);
    if (volumeMatch) {
      const value = cleanYamlValue(volumeMatch[1]);
      if ((value.startsWith('.') || value.startsWith('/')) && !value.includes('${')) {
        references.push({
          type: 'volume path',
          value,
          absolute: path.resolve(composeDirectory, value),
          line: index + 1
        });
      }
    }
  }

  return references;
}

async function composeFindings(index) {
  const composeFiles = findNamed(index, ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml']);
  const findings = [];

  for (const file of composeFiles) {
    const text = await readText(file);
    if (text === null) continue;
    const references = composeReferences(text, path.dirname(file.absolute));
    const missing = references.filter((reference) => !fs.existsSync(reference.absolute));

    findings.push(finding({
      id: `paths.compose.${file.relative}`,
      category: 'Paths',
      status: missing.length === 0 ? 'pass' : 'fail',
      title: `Compose paths: ${file.relative}`,
      message: missing.length === 0
        ? `Validated ${references.length} local path references.`
        : `${missing.length} of ${references.length} local path references do not exist.`,
      evidence: missing.length === 0
        ? null
        : missing.slice(0, 5).map((item) => `${item.value} (line ${item.line})`).join(', '),
      recommendation: missing.length === 0 ? null : 'Correct the paths or restore the referenced files before running Docker Compose.',
      weight: missing.length === 0 ? 0 : 12
    }));

    if (/^\s*version\s*:/m.test(text)) {
      findings.push(finding({
        id: `paths.compose.version.${file.relative}`,
        category: 'Paths',
        status: 'warn',
        title: `Compose schema: ${file.relative}`,
        message: 'The top-level version key is obsolete in modern Docker Compose.',
        recommendation: 'Remove the version key after confirming compatibility.',
        weight: 2
      }));
    }
  }
  return findings;
}

async function makefileFindings(index, detection) {
  const files = findNamed(index, ['Makefile', 'makefile']);
  const findings = [];

  for (const file of files) {
    const text = await readText(file);
    if (text === null) continue;
    const issues = [];
    const commandPattern = /cd\s+([^\s;&]+)\s*&&\s*(npm|pnpm|yarn|bun)\s+run\s+([\w:-]+)/g;
    for (const match of text.matchAll(commandPattern)) {
      const relativeDirectory = toPosix(match[1].replace(/^['"]|['"]$/g, ''));
      const packageManager = match[2];
      const script = match[3];
      const line = lineNumberAt(text, match.index);
      const command = `${packageManager} run ${script}`;
      const pkg = detection.packages.find((item) => item.relativeDirectory === relativeDirectory);
      if (!pkg) {
        issues.push(`line ${line}: ${command} uses missing directory ${relativeDirectory}`);
      } else if (!pkg.manifest.scripts?.[script]) {
        const manifest = relativeDirectory === '.' ? 'package.json' : `${relativeDirectory}/package.json`;
        const available = Object.keys(pkg.manifest.scripts ?? {}).sort();
        const suffix = available.length > 0
          ? `; available scripts: ${available.join(', ')}`
          : '; no scripts are currently defined';
        issues.push(`line ${line}: ${command} is not defined in ${manifest}${suffix}`);
      }
    }

    findings.push(finding({
      id: `paths.makefile.${file.relative}`,
      category: 'Paths',
      status: issues.length === 0 ? 'pass' : 'fail',
      title: `Makefile commands: ${file.relative}`,
      message: issues.length === 0
        ? 'Referenced package scripts and directories are valid.'
        : `${issues.length} Makefile command ${issues.length === 1 ? 'is' : 'are'} invalid.`,
      evidence: issues.slice(0, 5).join(', ') || null,
      recommendation: issues.length === 0 ? null : 'Define the missing script or update the Makefile command to use an available script.',
      weight: issues.length === 0 ? 0 : 9
    }));
  }
  return findings;
}

export async function pathFindings(index, detection) {
  return [
    ...(await composeFindings(index)),
    ...(await makefileFindings(index, detection))
  ];
}
