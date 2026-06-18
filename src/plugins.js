import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { FINDING_SCOPES } from './constants.js';
import { finding } from './lib/utils.js';

export async function runPlugins(pluginPaths, context) {
  const findings = [];
  const loaded = [];

  for (const pluginPath of pluginPaths) {
    const absolute = path.resolve(process.cwd(), pluginPath);
    const module = await import(pathToFileURL(absolute).href);
    const plugin = module.default ?? module;
    if (!plugin || typeof plugin.name !== 'string' || typeof plugin.run !== 'function') {
      throw new Error(`Plugin ${pluginPath} must export { name, run(context) }.`);
    }

    const pluginContext = Object.freeze({
      root: context.root,
      stacks: Object.freeze([...context.stacks]),
      primaryStack: context.primaryStack,
      files: Object.freeze(context.files.map((file) => file.relative)),
      readText: async (relative) => fs.readFile(path.resolve(context.root, relative), 'utf8')
    });
    const output = await plugin.run(pluginContext);
    if (!Array.isArray(output)) throw new Error(`Plugin ${plugin.name} must return an array of findings.`);

    for (const item of output) {
      if (!item?.id || !item?.title || !['pass', 'warn', 'fail', 'info'].includes(item?.status)) {
        throw new Error(`Plugin ${plugin.name} returned an invalid finding.`);
      }
      if (item.scope && !Object.values(FINDING_SCOPES).includes(item.scope)) {
        throw new Error(`Plugin ${plugin.name} returned an invalid finding scope.`);
      }
      findings.push(finding({ ...item, id: `plugin.${plugin.name}.${item.id}`, category: item.category ?? plugin.name }));
    }
    loaded.push(plugin.name);
  }

  return { findings, loaded };
}
