<div align="center">

# SetupLens

**Diagnose why unfamiliar repositories fail to install, configure, or start.**

[中文](README.zh-CN.md) | [Roadmap](ROADMAP.md) | [Product direction](docs/PRODUCT_DIRECTION.md) | [Why I built it](ARCHITECTURE.md) | [Plugin API](docs/PLUGIN_API.md) | [Example report](docs/demo-report.html) | [alpha.3 capability report](docs/failure-dataset/alpha3-capability-report.html)

[![CI](https://github.com/Milankunderzzz/SetupLens/actions/workflows/ci.yml/badge.svg)](https://github.com/Milankunderzzz/SetupLens/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/Milankunderzzz/SetupLens?sort=semver)](https://github.com/Milankunderzzz/SetupLens/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-1769aa.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.17-147a45.svg)](package.json)
[![Runtime dependencies](https://img.shields.io/badge/runtime_dependencies-0-147a45.svg)](package.json)

</div>

**A real setup failure, explained:** after Docker Compose could not find its build path, SetupLens identified four broken Compose paths and one missing npm script in 810 ms.

![A failed Docker Compose run followed by SetupLens finding five confirmed setup blockers in 810 milliseconds](docs/assets/demo.gif)

SetupLens is an early personal open-source project for a problem I keep meeting: a repository looks complete, but it does not run after cloning. The project is moving from a fast static scanner toward a repository doctor: it identifies the project shape, builds a startup plan, optionally probes commands, classifies failure logs, and turns the evidence into concrete next actions.

I am building it in public and still keeping the core deterministic and local-first. The current adapters cover Node.js, Python, Docker, Prisma, PHP/Laravel, Ruby/Rails, Java/Spring, .NET, Go, Rust, monorepos, local services, README-driven setup instructions, and common JavaScript framework signals. Repository hygiene checks still exist, but the product direction now prioritizes broad startup diagnosis over a simple speed promise. The reasoning behind the scope and code structure is in [ARCHITECTURE.md](ARCHITECTURE.md), and the product plan is in [docs/PRODUCT_DIRECTION.md](docs/PRODUCT_DIRECTION.md).

## Current Development Status

SetupLens is an early research prototype and usable MVP, not yet a product whose effectiveness has been established. The current `main` branch includes:

- 77 automated tests, executed in CI on Windows, Linux, and macOS with Node.js 18 and 22;
- context-aware file classification, workspace-level dependency reporting, and primary-stack ranking;
- `Unsupported / Not scored` results for empty repositories, unknown stacks, and unsupported primary stacks instead of misleading numeric grades;
- startup diagnosis with `ready`, `needs_setup`, `blocked`, and `unsupported` verdicts;
- detected prepare and run commands for common Node.js, Python, and Docker projects;
- `doctor` mode with adapters, planned probes, real command probing, failure-log classification, and next-action ranking;
- Node/Prisma/README instruction signals such as framework packages, `process.env.*`, Prisma `env("...")`, and documented commands;
- deep doctor rules for Next.js, Vite, Prisma, Django, FastAPI, Laravel, Rails, Spring Boot, .NET web apps, Go services, Rust binaries, Turbo, and Nx;
- a failure corpus with 56 real-project, seeded, and public-scan-distilled fixtures that keeps doctor rules tied to reproducible setup failures;
- multi-ecosystem doctor adapters for PHP, Ruby, Java, .NET, Go, Rust, monorepos, and local service dependencies;
- corpus metrics for diagnostic hit rate, first root-cause ranking, safe-fix generation, false blockers, and ecosystem coverage;
- `failure-dataset collect/review` for pulling 50 public candidate repositories, preserving source provenance, scanning them, and turning the results into corpus and classifier feedback;
- failure-dataset review scorecards with diagnostic hit rate, root-cause-first rate, safe-fix generation, false-blocker metrics, operational risk notes, and per-ecosystem coverage counts;
- failure-dataset promotion drafts, public-scan distilled corpus promotion, and local cache cleanup so public scan evidence can move toward curated corpus coverage without retaining cloned repositories forever;
- safer probe execution that runs verify probes by default, records probe traces, and only runs startup commands with `--probe-startup`;
- action-panel doctor reports in terminal, JSON, and HTML with readiness separated from diagnosis confidence;
- fix-plan output plus `doctor --apply safe` for whitelisted local repairs and safe recipes that never overwrite existing files;
- default terminal output that hides low-impact pass/hygiene noise unless `--show-all` is requested;
- one documented CMMS validation case and one external C++ boundary pilot.

The regenerated alpha.3 evidence pass collected 50 public GitHub sources, completed 47 static doctor scans, produced 39 corpus promotion candidates, and expanded the regression corpus to 56 passing cases. The visual summary is in [docs/failure-dataset/alpha3-capability-report.html](docs/failure-dataset/alpha3-capability-report.html), and the audit note is in [docs/failure-dataset/scan-review-2026-07-09.md](docs/failure-dataset/scan-review-2026-07-09.md).

Precision, recall, F1, developer time savings, and low false-positive rates have not yet been established. Those claims remain gated on the independent pilot and holdout study in [SetupBench-Lens](https://github.com/Milankunderzzz/SetupBench-Lens).

## Try It

Run the deeper repository doctor directly from GitHub without cloning or registering:

```bash
npx --yes github:Milankunderzzz/SetupLens doctor .
```

Run optional probes when you want SetupLens to execute local diagnostic commands and classify real failures:

```bash
npx --yes github:Milankunderzzz/SetupLens doctor . --probe
```

Show the repair plan, including safe automatic repairs and manual fixes:

```bash
npx --yes github:Milankunderzzz/SetupLens doctor . --fix-plan
```

Apply only whitelisted safe local repairs:

```bash
npx --yes github:Milankunderzzz/SetupLens doctor . --apply safe
```

Run the static readiness scan for CI-style scoring and HTML reports:

```bash
npx --yes github:Milankunderzzz/SetupLens scan .
```

Generate a shareable, offline HTML report:

```bash
npx --yes github:Milankunderzzz/SetupLens scan . --format html --output setuplens-report.html
```

SetupLens reads local files and commands only. It does not upload repository contents, environment values, or scan results. `doctor --probe` executes safe diagnostic and verify probes by default; `doctor --probe --probe-startup` opts into long-running startup probes. Probe results include trace metadata, timeout policy, ready-output detection, and classified failures. Plain `doctor` and `scan` stay static. `doctor --apply safe` is intentionally narrow: it can copy env templates to missing local env files, append local env ignore rules, create missing Compose env placeholders, and create conservative missing `tsconfig.json` or Vite `index.html` files, but it refuses overwrites and writes outside the repository. Package-script and env-template patches stay manual.

## What It Finds

- A startup verdict: `READY`, `NEEDS SETUP`, `BLOCKED`, or `UNSUPPORTED`
- Prepare commands such as `npm install`, `python -m venv .venv`, or `python -m pip install -r requirements.txt`
- Run commands such as `npm run dev`, `python -m flask --app app run`, `python -m uvicorn main:app --reload`, or `docker compose up --build`
- Doctor adapters for Node.js, Python, Docker, Prisma, PHP, Ruby, Java, .NET, Go, Rust, monorepos, local services, and README instructions
- Framework and tooling signals such as Next.js, Vite, React, TypeScript, Prisma, Drizzle, Django, Flask, FastAPI, Laravel, Rails, Spring Boot, Compose, Makefile, justfile, Taskfile, devcontainer files, Turbo, Nx, Lerna, Rush, and pnpm workspaces
- Deep ecosystem checks for Next.js route roots, Vite entry HTML, Prisma datasource/generator/migration state, Django settings/migrations, FastAPI ASGI entrypoints, Laravel env/app key state, Rails credentials/database config, Spring application config, .NET web appsettings, Go service entrypoints, Rust bin targets, and Turbo/Nx tasks
- A fix plan that separates whitelisted safe automatic repairs from manual repair steps
- A failure corpus workflow for turning real broken projects into sanitized fixtures and regression tests
- Corpus metrics, probe traces, readiness scoring, diagnosis-confidence explanations, unknowns, and an action panel with root causes, next command, safe fixes, manual fixes, and evidence
- Planned probes, optional probe results, and classified failures such as missing environment variables, missing files, missing modules, missing Node dependencies, macOS archive metadata treated as Python source, port conflicts, database connection failures, pending migrations, private registry authentication failures, dependency resolution errors, Docker daemon failures, incompatible runtime versions, native build tool failures, TLS/certificate errors, DNS/network failures, lockfile mismatches, permission problems, configuration parse errors, and compile errors
- Prisma `env("...")` and JavaScript/TypeScript `process.env.*` references that are not backed by a local environment value
- Runtime availability and declared Node.js version compatibility
- npm, pnpm, Yarn, Bun, Python, Git, Docker, and Docker Compose readiness
- Missing `node_modules`, Python virtual environments, and dependency lockfiles, with root-level workspace aggregation
- Missing `.env` files and undocumented configuration gaps without printing values
- Broken Dockerfile, Compose volume, directory, and Makefile script references
- Context-aware checks for tracked environment files and secrets without treating tests or documentation as the primary workflow
- README, license, CI, tests, `.gitignore`, and repository scan coverage
- Ranked primary and supporting stacks with manifest evidence, plus matching VS Code extension recommendations
- Explicitly loaded, repository-specific plugins

## Evidence Loop Demo

The old demo was a single benchmark. The stronger demo is now the evidence loop I use to make SetupLens better: collect real public candidates, keep provenance, scan them, review the misses, and only then distill safe minimal cases into the failure corpus.

Collect the first 50 public repository candidates and commit only the auditable source manifest:

```bash
setuplens failure-dataset collect --limit 50 --format json --output docs/failure-dataset/sources.json
```

Clone and scan those candidates outside git:

```bash
setuplens failure-dataset collect --limit 50 --clone --scan --format json --output .setuplens/failure-dataset/sources.json
```

Review the scan results and turn them into a corpus/classifier backlog:

```bash
setuplens failure-dataset review --input .setuplens/failure-dataset/sources.json
setuplens failure-dataset review --input .setuplens/failure-dataset/sources.json --format json --output .setuplens/failure-dataset/review.json
```

Generate reviewable corpus drafts from the highest-value candidates:

```bash
setuplens failure-dataset promote --input .setuplens/failure-dataset/sources.json
setuplens failure-dataset promote --input .setuplens/failure-dataset/sources.json --format json --output .setuplens/failure-dataset/corpus-drafts.json
```

Promote reviewed public scan patterns into sanitized local corpus fixtures:

```bash
npm run corpus:promote-public
```

Generate the alpha.3 capability comparison report:

```bash
npm run report:capability
```

Clean cloned public repositories when the evidence has been reviewed:

```bash
setuplens failure-dataset clean
setuplens failure-dataset clean --include-reports
```

The committed manifest records repository URL, clone URL, default branch, license, topics, GitHub Search query, collection timestamp, optional resolved commit, sanitized scan summaries, root-cause ranking, safe-fix counts, unclassified logs, and unknowns. Per-repository doctor reports and third-party source checkouts stay in the ignored `.setuplens` cache. Review output also includes a scorecard for diagnostic hit rate, first-root-cause ranking when labels exist, safe-fix generation, false-blocker risk, and ecosystem coverage. Promotion output keeps `fixture.files` empty until a human sanitizes and minimizes the public source evidence. The detailed workflow is in [docs/failure-dataset/README.md](docs/failure-dataset/README.md).

The original CMMS benchmark still exists as one local validation example. It was measured on Windows 11 with an Intel i5-12500H and Node.js 24. The repository contains Node.js, Python, Docker, and 261 indexed files.

| Metric | Result |
|---|---:|
| Median of 10 scans | **764 ms** |
| Fastest / slowest | 721 ms / 869 ms |
| Checks | 27 |
| Findings | 2 failures, 9 warnings, 15 passes |
| Confirmed defects | 4 broken Compose paths and 1 missing npm script |
| Data uploaded | **0 bytes** |

Results vary by disk, repository size, and runtime commands. The demo GIF shows one measured 810 ms run from the same benchmark target.

![Offline HTML report generated from the real CMMS benchmark](docs/assets/report.png)

## Output Formats

```bash
# Deep repository diagnosis
setuplens doctor .
setuplens doctor . --probe
setuplens doctor . --probe --probe-startup
setuplens doctor . --fix-plan
setuplens doctor . --apply safe
setuplens doctor . --format html --output setuplens-doctor.html
setuplens doctor . --format json --output setuplens-doctor.json
setuplens doctor-suite ./repos --format json
setuplens failure-dataset collect --limit 50 --format json
setuplens failure-dataset collect --limit 50 --clone --scan
setuplens failure-dataset review --input .setuplens/failure-dataset/sources.json
setuplens failure-dataset promote --input .setuplens/failure-dataset/sources.json
setuplens failure-dataset clean

# Human-readable terminal report
setuplens scan .

# Full audit list, including passed checks and repository hygiene
setuplens scan . --show-all

# Machine-readable JSON
setuplens scan . --format json --output setuplens-report.json

# Self-contained HTML
setuplens scan . --format html --output setuplens-report.html

# Fail CI when readiness falls below 80
setuplens scan . --threshold 80
```

## Scoring

The main score answers one question: **how ready is this repository to run on the current machine?** It uses findings in the `setup` scope, including runtimes, dependencies, configuration, paths, security, scan coverage, and setup-focused plugins.

README, license, `.gitignore`, CI, and test coverage findings use the separate `hygiene` scope. They remain visible and receive their own score and summary, but they do not lower setup readiness. `--threshold` and the GitHub Action threshold use the setup readiness score.

SetupLens reports `Unsupported / Not scored` instead of a numeric grade when the repository is empty, has no detectable primary stack, or uses a primary stack outside the supported rule set. Generic hygiene and security observations remain visible, but they do not prove that an unsupported project can run. A threshold check fails closed with exit code `2` when no readiness score can be calculated; exit code `1` remains reserved for a valid score below the requested threshold.

In JSON output, `summary` describes setup readiness, `allSummary` covers every finding, and `scopes` contains the separate setup and hygiene scores. `scorable`, `scoreStatus`, `notScoredReason`, and `scoreMessage` explain whether the numeric score is valid. `primaryStack`, `primaryStacks`, and `stackEvidence` explain which technology leads the repository and which manifests are only supporting or incidental evidence.

## GitHub Action

```yaml
name: Repository readiness
on: [push, pull_request]

jobs:
  setuplens:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: Milankunderzzz/SetupLens@v0.2.0-alpha.3
        with:
          path: .
          threshold: 75
```

The action writes the score and highest-impact fixes to the job summary and generates `setuplens-report.html`.

## Plugins

Plugins are loaded only when explicitly requested because they execute local JavaScript:

```bash
setuplens scan . --plugin ./examples/custom-plugin.mjs
```

```js
export default {
  name: 'team-policy',
  async run(context) {
    return [{
      id: 'codeowners',
      status: context.files.includes('CODEOWNERS') ? 'pass' : 'warn',
      title: 'Code ownership',
      message: 'Checks whether review ownership is documented.'
    }];
  }
};
```

See the [Plugin API](docs/PLUGIN_API.md) for the complete contract.

## Scope and Alternatives

I am not trying to replace every repository or web auditing tool. SetupLens focuses on one moment: **a developer has the code, but it will not install, configure, or start on their machine.**

| Product | Primary question | Local runtime and environment | Repository hygiene | Maintainer analytics | Web performance | Offline |
|---|---|:---:|:---:|:---:|:---:|:---:|
| **SetupLens** | Why will this repository not install or start here? | **Yes** | Basic | No | No | **Yes** |
| [Repo Doctor](https://github.com/JaaasperLiu/repo-doctor) | Is this repository open-source ready? | No | **Deep, with auto-fixes** | No | No | Yes |
| [GitVital](https://github.com/bugsNburgers/GitVital) | Is this GitHub project actively maintained? | No | Metadata-based | **Deep** | No | No |
| [Lighthouse](https://github.com/GoogleChrome/lighthouse) | Is this deployed web page fast and accessible? | Browser only | No | No | **Deep** | Yes |

### What works well today

- Finds machine-specific setup failures that repository metadata cannot see.
- Runs locally with zero runtime dependencies, no account, and no telemetry.
- Produces terminal, JSON, HTML, GitHub Action scan results, and a deeper doctor report.
- Can optionally execute bounded local probes and classify real command failures.
- Keeps the core focused while allowing explicit project and organization plugins.

### What still needs work

- Early-stage adapter coverage is broader now, but still shallower than mature specialist tools inside each ecosystem.
- Node.js 18.17 or newer is currently required to launch the scanner.
- It only mutates whitelisted low-risk local files in `doctor --apply safe`; deeper repairs remain manual by design.
- Probe mode can observe early startup failures, but it cannot prove that every long-running service is production-ready.
- It does not replace dependency vulnerability scanners, web performance audits, or long-term maintainer analytics.

The project currently favors checks that can point to a file, command, or manifest entry. I may add optional AI explanations later, but the underlying finding should remain reproducible without a model.

## What I Am Working On

- **Now:** Make `doctor` the powerful path: deep adapters, startup plans, probes, log classification, fix plans, and safe local repairs.
- **Next:** Expand ecosystem-specific fixtures and convert more root causes into precise manual or safe repair recipes.
- **After that:** Validate coverage on real repositories and measure false positives before claiming mature effectiveness.
- **Later:** Grow into a broad repository startup doctor while keeping findings deterministic, local, and auditable.

The detailed release gates and deferred directions are maintained in the [version roadmap](ROADMAP.md).

Java, Go, Rust, PHP, Ruby, and .NET support is now adapter-driven and intentionally starts with startup planning, runtime probes, and common failure classification. Issues that include a minimal reproduction are the most useful input for deepening each ecosystem.

## Development

```bash
git clone https://github.com/Milankunderzzz/SetupLens.git
cd SetupLens
npm ci
npm run check
npm test
npm run corpus
npm run corpus:promote-public
npm run dataset:collect -- --limit 50 --format json
npm run dataset:review -- --input .setuplens/failure-dataset/sources.json
npm run dataset:promote -- --input .setuplens/failure-dataset/sources.json
npm run dataset:clean
npm run report:capability
node ./bin/setuplens.js scan .
node ./bin/setuplens.js doctor . --probe
node ./bin/setuplens.js doctor-suite ./repos --format json
node ./bin/setuplens.js failure-dataset collect --limit 50 --clone --scan
```

The scanning runtime uses only Node.js built-ins. Development dependencies are used solely to generate the README demo GIF.

I keep short notes from real-project testing in the [development log](docs/devlog/2026-06-18-cmms-validation.md), use [failure dataset intake](docs/failure-dataset/README.md) to preserve source evidence, and reduce real failures into corpus cases when they expose new rule boundaries.

## Contributing

I especially welcome focused rules, cross-platform fixtures, and false-positive reports. Read [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md) before submitting changes.

<!--
## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=Milankunderzzz/SetupLens&type=Date)](https://star-history.com/#Milankunderzzz/SetupLens&Date)
-->

## License

[MIT](LICENSE)
