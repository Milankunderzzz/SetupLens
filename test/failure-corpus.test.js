import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateCorpus } from '../scripts/evaluate-failure-corpus.js';

test('failure corpus cases reproduce expected doctor diagnoses', async () => {
  const { results, passed } = await evaluateCorpus({ timeoutMs: 3000 });
  const failures = results
    .filter((result) => !result.passed)
    .flatMap((result) => result.failures.map((failure) => `${result.id}: ${failure}`));
  const ecosystems = new Set(results.flatMap((result) => result.ecosystems));

  assert.equal(passed, true, failures.join('\n'));
  assert.ok(results.some((result) => result.source.kind === 'private_real_project'));
  for (const ecosystem of ['next', 'vite', 'prisma', 'django', 'fastapi', 'laravel', 'rails', 'spring', 'dotnet', 'go', 'rust', 'turbo', 'nx']) {
    assert.ok(ecosystems.has(ecosystem), `Missing failure corpus ecosystem: ${ecosystem}`);
  }
});
