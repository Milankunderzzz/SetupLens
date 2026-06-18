import { findNamed, readText } from '../lib/files.js';
import { environmentCandidates, parseEnvKeys } from '../lib/environment.js';
import { finding, toPosix } from '../lib/utils.js';

export async function configurationFindings(index) {
  const examples = findNamed(index, ['.env.example', '.env.sample', '.env.template'])
    .concat(index.files.filter((file) => file.name.endsWith('.env.example')));
  const unique = [...new Map(examples.map((file) => [file.relative, file])).values()];
  const findings = [];

  if (unique.length === 0) {
    return [finding({
      id: 'configuration.env.examples',
      category: 'Configuration',
      status: 'info',
      title: 'Environment templates',
      message: 'No environment template was found.'
    })];
  }

  for (const example of unique) {
    const exampleText = await readText(example);
    const required = exampleText === null ? new Set() : parseEnvKeys(exampleText);
    const candidates = environmentCandidates(example).map(toPosix);
    const actual = candidates.map((candidate) => index.byRelative.get(candidate)).find(Boolean);
    const label = example.relative;

    if (!actual) {
      findings.push(finding({
        id: `configuration.env.missing.${label}`,
        category: 'Configuration',
        status: 'warn',
        title: `Local environment for ${label}`,
        message: `No local environment file was found for ${required.size} documented variables.`,
        evidence: candidates.length > 0 ? `Expected ${candidates.join(' or ')}` : null,
        recommendation: `Copy ${label} to a local environment file and fill in your own values.`,
        weight: 5
      }));
      continue;
    }

    const actualText = await readText(actual);
    const present = actualText === null ? new Set() : parseEnvKeys(actualText);
    const missing = [...required].filter((key) => !present.has(key));
    findings.push(finding({
      id: `configuration.env.keys.${label}`,
      category: 'Configuration',
      status: missing.length === 0 ? 'pass' : 'fail',
      title: `Environment variables for ${label}`,
      message: missing.length === 0
        ? `All ${required.size} documented variables are present in ${actual.relative}.`
        : `${actual.relative} is missing ${missing.length} variables: ${missing.slice(0, 6).join(', ')}${missing.length > 6 ? ', ...' : ''}.`,
      recommendation: missing.length === 0 ? null : `Add the missing keys using ${label} as the template.`,
      weight: missing.length === 0 ? 0 : 9
    }));
  }

  return findings;
}
