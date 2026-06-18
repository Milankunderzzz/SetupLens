import path from 'node:path';

export function parseEnvKeys(text) {
  const keys = new Set();
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/);
    if (match) keys.add(match[1]);
  }
  return keys;
}

export function environmentCandidates(example) {
  const directory = path.posix.dirname(example.relative);
  const prefix = directory === '.' ? '' : `${directory}/`;
  const name = example.name;

  if (name === '.env.example') return [`${prefix}.env`, `${prefix}.env.local`];
  if (name.endsWith('.example')) return [`${prefix}${name.slice(0, -'.example'.length)}`];
  return [];
}
