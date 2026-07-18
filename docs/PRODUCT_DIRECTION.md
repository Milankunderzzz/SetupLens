# Product Direction

SetupLens should be powerful because it is useful, not because it is noisy.

The product goal is not to score a repository for being open-source ready. The goal is to help a developer answer:

> I cloned this repository. What is it, what should I run, what can SetupLens safely try, and what is the most likely reason it fails?

## Current Product Priority

The v0.2 line now has two layers:

1. `scan`: deterministic setup readiness for CI-style use.
2. `doctor`: broader local diagnosis with adapters, startup plans, optional probes, failure classification, and next actions.

The product priority is to grow `doctor` until it can handle unfamiliar repositories across many ecosystems without pretending static rules can explain every failure.

## What Should Feel Different

The doctor output should not feel like a long checklist. It should feel like a practical handoff:

```text
Verdict BLOCKED

Likely root causes
  Missing environment variable DATABASE_URL
  Docker daemon unavailable

Next actions
  Copy .env.example to .env
  Start Docker Desktop
  npm run dev

Probe results
  npm run dev -> classified as missing_env_var
```

The full scan audit list remains available with `scan --show-all`, but most users should start with `doctor`.

## Near-Term Roadmap

### v0.2.0-alpha.1

Product preview for the startup diagnosis redesign.

- Default terminal report centered on startup verdicts.
- Detected prepare and run commands.
- Blockers and safety risks separated from low-value repository hygiene.
- HTML and GitHub Action summaries aligned with the new model.

### v0.2.0-alpha.2

Turn the startup scanner into a broader, evidence-backed repository doctor.

- Add `setuplens doctor`.
- Add adapter-driven signals, actions, issues, and probes.
- Add optional `--probe` execution with timeouts.
- Add failure classification for common command-output families.
- Add Prisma, PHP, Ruby, Java, .NET, Go, Rust, monorepo, local service, and README instruction adapters.
- Add failure-dataset review scorecards so public scans report diagnostic hit rate, root-cause-first rate when labels exist, safe-fix generation, false-blocker risk, and ecosystem coverage.

### v0.2.0-alpha.3

Turn public scan evidence into a repeatable corpus promotion loop.

- Add `setuplens failure-dataset promote` for corpus case drafts with provenance, expected diagnosis, missing-evidence notes, and human review checklists.
- Keep draft fixture files empty until a maintainer sanitizes and minimizes public source evidence.
- Add `setuplens failure-dataset clean` so cloned public repositories can be removed after review while manifests and reports remain reproducible.

### v0.2.0-alpha.4

Turn repeated public scan reviews into a measurable regression history.

- Add `setuplens failure-dataset review --history <file>` for scorecard snapshots.
- Compare each review against the previous snapshot so diagnostic metrics, safe-fix yield, false-blocker risk, unclassified logs, rule gaps, and manual-fix volume show as improved, regressed, unchanged, or not comparable.
- Keep history local by default under `.setuplens/failure-dataset` until aggregate evidence is intentionally published.

### v0.2.0-beta

Make doctor mode more trustworthy across real repositories.

- Improve framework entry-point detection for common Node.js, Python, PHP, Ruby, Java, .NET, Go, and Rust projects.
- Expand probe safety labels and let users choose verification-only versus startup probes.
- Add more dry-run probes for package managers, ORMs, build tools, and monorepo runners.
- Add more real-world fixtures from projects that failed to start.

### v0.2.0

Ship the first product-oriented release.

- Keep the scan and doctor contracts stable enough for users and GitHub Actions.
- Publish demos showing static diagnosis, probe diagnosis, and classified real failures.
- Prepare npm distribution so users can run `npx setuplens doctor .`.

## Explicit Non-Goals For Now

- Auto-repair that changes user files without explicit approval.
- AI-only diagnosis without deterministic evidence.
- Replacing vulnerability scanners, package managers, IDEs, or Docker itself.
