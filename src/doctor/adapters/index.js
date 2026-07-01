import { dockerAdapter } from './docker.js';
import { dotnetAdapter } from './dotnet.js';
import { genericAdapter } from './generic.js';
import { goAdapter } from './go.js';
import { javaAdapter } from './java.js';
import { monorepoAdapter } from './monorepo.js';
import { nodeAdapter } from './node.js';
import { phpAdapter } from './php.js';
import { prismaAdapter } from './prisma.js';
import { pythonAdapter } from './python.js';
import { rubyAdapter } from './ruby.js';
import { rustAdapter } from './rust.js';
import { servicesAdapter } from './services.js';

const ADAPTERS = [
  nodeAdapter,
  monorepoAdapter,
  pythonAdapter,
  dockerAdapter,
  servicesAdapter,
  prismaAdapter,
  phpAdapter,
  rubyAdapter,
  javaAdapter,
  dotnetAdapter,
  goAdapter,
  rustAdapter,
  genericAdapter
];

export async function runAdapters(context) {
  const results = [];
  for (const adapter of ADAPTERS) {
    const result = await adapter(context);
    if (result) results.push(result);
  }
  return results;
}
