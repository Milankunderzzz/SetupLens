# Failure Corpus

The failure corpus is the path from "SetupLens understands this stack" to
"SetupLens can recognize a high-probability root cause and suggest the next
repair." Each case captures one setup failure as a small, reproducible fixture
with expected doctor output.

## What a Case Contains

Each entry in `cases.json` has:

- `id`: stable kebab-case case id.
- `ecosystems`: affected stack or tool labels.
- `source`: where the failure came from.
- `fixture.files`: the smallest file tree needed to reproduce the diagnosis.
- `logSamples`: optional command output snippets that should classify to a root cause.
- `expect`: required doctor status, adapters, root causes, probes, next actions, and safe fixes.

Source kinds currently used:

- `private_real_project`: observed in a real local project, then sanitized and minimized.
- `public_real_project`: observed in a public repository or issue, with a source link.
- `public_scan_distilled_pattern`: distilled from public failure-dataset scan evidence into a synthetic minimal fixture without copying third-party source.
- `seeded_failure_pattern`: a small seed fixture for a known failure family while real evidence is being collected.

The corpus must always contain at least one real-project case. Seed cases are allowed, but they should be replaced or reinforced with real evidence over time.

The current corpus includes 56 cases. Two CMMS-derived real-project boundaries are represented: broken Compose/Makefile references, and a nested-copy report that exposed missing local Node dependencies plus macOS `__MACOSX`/`._*` archive metadata being treated as Python source. The alpha.3 public scan pass adds distilled minimal fixtures for Next.js, Vite, Prisma, Django, FastAPI, Laravel, Rails, Spring Boot, .NET, Go, Rust, Docker Compose, Turbo, Nx, and monorepo setup failures.

## How to Add a Real Failure

1. Reproduce the failing project locally.
2. Record the failed command, relevant log lines, framework/tool versions, and the file or manifest that explains the failure.
3. Reduce the project to the smallest file tree that still triggers the same SetupLens diagnosis.
4. Remove secrets, private URLs, customer names, tokens, and proprietary source code.
5. Add a case to `cases.json` with `source.kind` set to `private_real_project` or `public_real_project`.
6. Run:

```bash
npm run corpus
npm test
```

If SetupLens cannot yet classify the failure, keep the case expectation strict and improve the adapter or classifier until the corpus passes.

## Safe Fix Expectations

Only low-risk, local, non-overwriting repairs belong in `applySafe` expectations:

- Copying `.env.example`, `.env.sample`, or `.env.template` to a missing `.env`.
- Appending local env ignore rules to `.gitignore`.
- Creating empty Compose `env_file` placeholders inside the repository.
- Creating conservative missing `tsconfig.json` and Vite `index.html` files.

Anything that changes application logic, overwrites an existing file, applies migrations, installs packages, or talks to external services must stay manual.

## Evaluation

`scripts/evaluate-failure-corpus.js` builds each fixture in a temporary directory,
runs `doctor()`, checks the expected root causes/actions/probes/fixes, and then
deletes the fixture. It also classifies any stored log samples.

The evaluator reports:

- diagnostic hit rate
- whether the expected root cause is ranked first
- safe-fix generation rate
- false blocker count/rate
- ecosystem coverage

Run all cases:

```bash
npm run corpus
```

Run all cases as JSON:

```bash
npm run corpus -- --format json
```

Promote public scan patterns into sanitized synthetic fixtures after reviewing
`.setuplens/failure-dataset/review.json`:

```bash
npm run corpus:promote-public
```

Run one case:

```bash
node ./scripts/evaluate-failure-corpus.js --case cmms-compose-paths-and-make-script
node ./scripts/evaluate-failure-corpus.js --case cmms-nested-copies-node-python-artifacts
```

Keep generated fixtures for debugging:

```bash
node ./scripts/evaluate-failure-corpus.js --case next-prisma-env-template-missing-local-env --keep
```
