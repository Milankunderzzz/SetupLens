import fs from 'node:fs/promises';
import path from 'node:path';
import { SKIPPED_DIRECTORIES, TEXT_EXTENSIONS } from '../constants.js';
import { classifyPathRole } from './context.js';
import { toPosix } from './utils.js';

const MAX_FILES = 20000;
const MAX_DEPTH = 8;
const MAX_TEXT_SIZE = 1024 * 1024;

export async function indexRepository(root) {
  const files = [];
  let truncated = false;

  async function walk(directory, depth) {
    if (depth > MAX_DEPTH || files.length >= MAX_FILES) {
      truncated = true;
      return;
    }

    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (files.length >= MAX_FILES) {
        truncated = true;
        break;
      }

      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) await walk(absolute, depth + 1);
        continue;
      }
      if (!entry.isFile() && !entry.isSymbolicLink()) continue;

      try {
        const stat = await fs.stat(absolute);
        const relative = toPosix(path.relative(root, absolute));
        files.push({
          absolute,
          relative,
          name: entry.name,
          extension: path.extname(entry.name).toLowerCase(),
          size: stat.size,
          role: classifyPathRole(relative)
        });
      } catch {
        // Files can disappear during a scan; the remaining repository is still useful.
      }
    }
  }

  await walk(root, 0);
  const byRelative = new Map(files.map((file) => [file.relative, file]));
  return { root, files, byRelative, truncated };
}

export async function readText(file) {
  if (!file || file.size > MAX_TEXT_SIZE) return null;
  if (!TEXT_EXTENSIONS.has(file.extension) && !file.name.startsWith('.env') && !file.name.includes('.env.')) return null;
  try {
    const buffer = await fs.readFile(file.absolute);
    if (buffer.includes(0)) return null;
    return buffer.toString('utf8');
  } catch {
    return null;
  }
}

export async function readJson(file) {
  const text = await readText(file);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function findNamed(index, names) {
  const wanted = new Set(Array.isArray(names) ? names : [names]);
  return index.files.filter((file) => wanted.has(file.name));
}

export function findRelative(index, relative) {
  return index.byRelative.get(toPosix(relative)) ?? null;
}
