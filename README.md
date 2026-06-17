<div align="center">

# SetupLens

**Know why a repository will not run, in one command and under 30 seconds.**

[中文](README.zh-CN.md) | [Plugin API](docs/PLUGIN_API.md) | [Example report](docs/demo-report.html)

[![CI](https://github.com/Milankunderzzz/SetupLens/actions/workflows/ci.yml/badge.svg)](https://github.com/Milankunderzzz/SetupLens/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-1769aa.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.17-147a45.svg)](package.json)
[![Runtime dependencies](https://img.shields.io/badge/runtime_dependencies-0-147a45.svg)](package.json)

</div>

![SetupLens scans a real Node, Python, and Docker repository in 810 milliseconds](docs/assets/demo.gif)

SetupLens is a local-first repository readiness scanner. It detects missing runtimes, uninstalled dependencies, incomplete environment files, broken Docker Compose paths, invalid Makefile commands, credential risks, and editor setup gaps before a contributor loses an afternoon to setup.

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
- Missing `node_modules`, Python virtual environments, and dependency lockfiles
- Missing `.env` files and undocumented configuration gaps without printing values
- Broken Dockerfile, Compose volume, directory, and Makefile script references
- Tracked environment files, private keys, tokens, credentialed URLs, and hardcoded secrets
- README, license, CI, tests, `.gitignore`, and repository scan coverage
- VS Code extension recommendations based on the detected stack
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

## GitHub Action

```yaml
name: Repository readiness
on: [push, pull_request]

jobs:
  setuplens:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: Milankunderzzz/SetupLens@main
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

## How We Differ

SetupLens is not trying to replace every repository or web auditing tool. It focuses on one moment: **a developer has the code, but it will not run on their machine.**

| Product | Primary question | Local runtime and environment | Repository hygiene | Maintainer analytics | Web performance | Offline |
|---|---|:---:|:---:|:---:|:---:|:---:|
| **SetupLens** | Why will this repository not run here? | **Yes** | Basic | No | No | **Yes** |
| [Repo Doctor](https://github.com/JaaasperLiu/repo-doctor) | Is this repository open-source ready? | No | **Deep, with auto-fixes** | No | No | Yes |
| [GitVital](https://github.com/bugsNburgers/GitVital) | Is this GitHub project actively maintained? | No | Metadata-based | **Deep** | No | No |
| [Lighthouse](https://github.com/GoogleChrome/lighthouse) | Is this deployed web page fast and accessible? | Browser only | No | No | **Deep** | Yes |

### SetupLens strengths

- Finds machine-specific setup failures that repository metadata cannot see.
- Runs locally with zero runtime dependencies, no account, and no telemetry.
- Produces terminal, JSON, HTML, and GitHub Action results from one scan model.
- Keeps the core focused while allowing explicit project and organization plugins.

### Current trade-offs

- Early-stage rule coverage is smaller than mature specialist tools.
- Node.js 18.17 or newer is currently required to launch the scanner.
- It reports fixes but intentionally does not mutate project files yet.
- It does not replace dependency vulnerability scanners, web performance audits, or long-term maintainer analytics.

The direction is deterministic evidence first, optional AI explanations later. A model should explain a confirmed broken path, not invent one.

## Roadmap

- **0.1:** Node.js, Python, Docker, environment, path, security, and repository checks
- **0.2:** Deeper Java, Go, and Rust checks; SARIF output; configurable rule policies
- **0.3:** Dry-run repair plans and safe, reviewable fixes
- **0.4:** Signed standalone binaries and a curated plugin registry
- **Later:** Optional local or bring-your-own-model explanations built on deterministic findings

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

## Contributing

Focused rules, cross-platform fixtures, and false-positive reductions are especially welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md) before submitting changes.

## License

[MIT](LICENSE)
