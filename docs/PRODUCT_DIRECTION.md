# Product Direction

SetupLens should be useful before it is impressive.

The product goal is not to score a repository for being open-source ready. The goal is to help a developer answer:

> I cloned this repository. What should I run, and what will stop it from starting?

## Current Product Priority

The v0.2 line focuses on startup diagnosis:

1. Detect the main stack and refuse misleading scores for unsupported projects.
2. Identify high-impact startup blockers such as missing runtimes, missing installed dependencies, missing local environment files, broken Docker Compose paths, invalid Makefile/package scripts, and exposed credentials.
3. Produce a short startup plan with prepare commands and run commands.
4. Keep repository hygiene visible but secondary.

## What Should Feel Different

The default terminal output should not feel like a long checklist. It should feel like a practical handoff:

```text
Verdict BLOCKED

Prepare
  npm install
  python -m venv .venv

Run
  npm run dev

Startup blockers
  Compose paths are missing
  Makefile calls an npm script that does not exist
```

The full audit list remains available with `--show-all`, but most users should not need it during the first minute.

## Near-Term Roadmap

### v0.2.0-alpha.1

Product preview for the startup diagnosis redesign.

- Default terminal report centered on startup verdicts.
- Detected prepare and run commands.
- Blockers and safety risks separated from low-value repository hygiene.
- HTML and GitHub Action summaries aligned with the new model.

### v0.2.0-beta

Make detected startup plans more trustworthy.

- Improve framework entry-point detection for common Node.js and Python projects.
- Add safer command confidence labels.
- Add optional dry-run/probe design for commands that can be checked without mutating the project.
- Add more real-world fixtures from projects that failed to start.

### v0.2.0

Ship the first product-oriented release.

- Keep the startup diagnosis contract stable enough for users and GitHub Actions.
- Publish a clean demo showing before/after diagnosis on real setup failures.
- Prepare npm distribution so users can run `npx setuplens scan .`.

## Explicit Non-Goals For Now

- Deep Java, Go, Rust, or C++ startup support.
- Auto-repair that changes user files.
- AI-only diagnosis without deterministic evidence.
- Replacing vulnerability scanners, package managers, IDEs, or Docker itself.
