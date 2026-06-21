<div align="center">

# SetupLens

**Know why a repository will not run, in one command and under 30 seconds.**

[中文](README.zh-CN.md) | [Roadmap](ROADMAP.md) | [Why I built it](ARCHITECTURE.md) | [Plugin API](docs/PLUGIN_API.md) | [Example report](docs/demo-report.html)

[![CI](https://github.com/Milankunderzzz/SetupLens/actions/workflows/ci.yml/badge.svg)](https://github.com/Milankunderzzz/SetupLens/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/Milankunderzzz/SetupLens?sort=semver)](https://github.com/Milankunderzzz/SetupLens/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-1769aa.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.17-147a45.svg)](package.json)
[![Runtime dependencies](https://img.shields.io/badge/runtime_dependencies-0-147a45.svg)](package.json)

</div>

**A real setup failure, explained:** after Docker Compose could not find its build path, SetupLens identified four broken Compose paths and one missing npm script in 810 ms.

![A failed Docker Compose run followed by SetupLens finding five confirmed setup blockers in 810 milliseconds](docs/assets/demo.gif)

SetupLens is an early personal open-source project for a problem I keep meeting: a repository looks complete, but it does not run after cloning. It checks the local machine and repository for missing runtimes, dependencies, environment files, broken paths, and a few other common setup failures.

I am building it in public and keeping the first versions deliberately small. The current rules work best for Node.js, Python, and Docker repositories. The reasoning behind the scope and code structure is in [ARCHITECTURE.md](ARCHITECTURE.md).

## Current Development Status

SetupLens is an early research prototype and usable MVP, not yet a product whose effectiveness has been established. The current `main` branch includes:

- 44 automated tests, executed in CI on Windows, Linux, and macOS with Node.js 18 and 22;
- context-aware file classification, workspace-level dependency reporting, and primary-stack ranking;
- `Unsupported / Not scored` results for empty repositories, unknown stacks, and unsupported primary stacks instead of misleading numeric grades;
- one documented CMMS validation case and one external C++ boundary pilot.

Precision, recall, F1, developer time savings, and low false-positive rates have not yet been established. Those claims remain gated on the independent pilot and holdout study in [SetupBench-Lens](https://github.com/Milankunderzzz/SetupBench-Lens).

## Try It

Run directly from GitHub without cloning or registering:

```bash
npx --yes github:Milankunderzzz/SetupLens scan .
```

Generate a shareable, offline HTML report:

```bash
npx --yes github:Milankunderzzz/SetupLens scan . --format html --output setuplens-report.html
```

SetupLens reads local files and commands only. It does not upload repository contents, environment values, or scan results.

## What It Finds

- Runtime availability and declared Node.js version compatibility
- npm, pnpm, Yarn, Bun, Python, Git, Docker, and Docker Compose readiness
- Missing `node_modules`, Python virtual environments, and dependency lockfiles, with root-level workspace aggregation
- Missing `.env` files and undocumented configuration gaps without printing values
- Broken Dockerfile, Compose volume, directory, and Makefile script references
- Context-aware checks for tracked environment files and secrets without treating tests or documentation as the primary workflow
- README, license, CI, tests, `.gitignore`, and repository scan coverage
- Ranked primary and supporting stacks with manifest evidence, plus matching VS Code extension recommendations
- Explicitly loaded, repository-specific plugins

## Real Benchmark

Measured against a real full-stack CMMS repository on Windows 11 with an Intel i5-12500H and Node.js 24. The repository contains Node.js, Python, Docker, and 261 indexed files.

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
# Human-readable terminal report
setuplens scan .

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
      - uses: Milankunderzzz/SetupLens@v0.1.0
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

I am not trying to replace every repository or web auditing tool. SetupLens focuses on one moment: **a developer has the code, but it will not run on their machine.**

| Product | Primary question | Local runtime and environment | Repository hygiene | Maintainer analytics | Web performance | Offline |
|---|---|:---:|:---:|:---:|:---:|:---:|
| **SetupLens** | Why will this repository not run here? | **Yes** | Basic | No | No | **Yes** |
| [Repo Doctor](https://github.com/JaaasperLiu/repo-doctor) | Is this repository open-source ready? | No | **Deep, with auto-fixes** | No | No | Yes |
| [GitVital](https://github.com/bugsNburgers/GitVital) | Is this GitHub project actively maintained? | No | Metadata-based | **Deep** | No | No |
| [Lighthouse](https://github.com/GoogleChrome/lighthouse) | Is this deployed web page fast and accessible? | Browser only | No | No | **Deep** | Yes |

### What works well today

- Finds machine-specific setup failures that repository metadata cannot see.
- Runs locally with zero runtime dependencies, no account, and no telemetry.
- Produces terminal, JSON, HTML, and GitHub Action results from one scan model.
- Keeps the core focused while allowing explicit project and organization plugins.

### What still needs work

- Early-stage rule coverage is smaller than mature specialist tools.
- Node.js 18.17 or newer is currently required to launch the scanner.
- It reports fixes but intentionally does not mutate project files yet.
- It does not replace dependency vulnerability scanners, web performance audits, or long-term maintainer analytics.

The project currently favors checks that can point to a file, command, or manifest entry. I may add optional AI explanations later, but the underlying finding should remain reproducible without a model.

## What I Am Working On

The detailed release gates and deferred directions are maintained in the
[version roadmap](ROADMAP.md). The current release line remains `v0.1.x`;
`v0.2.0-alpha.1` will freeze the pilot build, and stable `v0.2.0` will require
the planned evaluation and distribution evidence.

- **Now:** Complete full Pass A, Pass B, and Pass C review for 10 pilot repositories, while keeping the research scope fixed to Node.js, Python, and Docker.
- **Next:** Find five external users, record three confirmed setup problems, obtain at least one external issue or feedback report, and produce a 30-second before/after demonstration.
- **After the pilot:** Freeze the confirmatory commit, rerun eligible holdout repositories, and calculate precision, recall, F1, confidence intervals, and diagnosis-time comparisons.
- **Later:** Evaluate npm and GitHub Marketplace distribution, then reconsider deeper Java, Go, and Rust support only if the evidence justifies expansion.

Existing Java, Go, and Rust manifest detection remains available as experimental boundary behavior, but new rules for those ecosystems are paused. Issues that include a minimal reproduction are the most useful input.

## Development

```bash
git clone https://github.com/Milankunderzzz/SetupLens.git
cd SetupLens
npm ci
npm run check
npm test
node ./bin/setuplens.js scan .
```

The scanning runtime uses only Node.js built-ins. Development dependencies are used solely to generate the README demo GIF.

I keep short notes from real-project testing in the [development log](docs/devlog/2026-06-18-cmms-validation.md).

## Contributing

I especially welcome focused rules, cross-platform fixtures, and false-positive reports. Read [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md) before submitting changes.

<!--
## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=Milankunderzzz/SetupLens&type=Date)](https://star-history.com/#Milankunderzzz/SetupLens&Date)
-->

## License

[MIT](LICENSE)
