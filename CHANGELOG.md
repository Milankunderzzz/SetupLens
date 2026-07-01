# Changelog

All notable changes to SetupLens are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project uses semantic versioning while it remains in the `0.x` stage.

## [0.2.0-alpha.1] - 2026-07-01

This alpha turns SetupLens from a static readiness scanner into a broader local repository doctor.

### Added

- `setuplens doctor` for broader repository diagnosis beyond static readiness scoring.
- Doctor adapters for Node.js, Python, Docker, Prisma, PHP, Ruby, Java, .NET, Go, Rust, monorepos, local services, and README instructions.
- Deep doctor rules for Next.js, Vite, Prisma, Django, FastAPI, Laravel, Rails, Spring Boot, .NET web apps, Go services, Rust binaries, Turbo, and Nx.
- `doctor --fix-plan` and `doctor --apply safe` for whitelisted local repairs such as copying env templates, appending env ignore rules, and creating missing Compose env placeholders without overwriting files.
- Failure corpus evaluation with sanitized fixtures, log-classification expectations, safe-fix assertions, and `npm run corpus`.
- Failure corpus metrics for diagnostic hit rate, first root-cause ranking, safe-fix generation, false blockers, and ecosystem coverage.
- `setuplens failure-dataset collect` for pulling public repository candidates with GitHub Search provenance, optional clones, optional doctor scans, resolved commit evidence, and per-repository report paths.
- `setuplens failure-dataset review` for turning scanned candidates into corpus promotion queues, classifier backlogs, safe-fix opportunities, unsupported-stack gaps, unclassified logs, and diagnostic unknowns.
- CMMS-derived corpus coverage for nested project copies, missing local Node binaries, `npx --no-install` missing packages, and macOS archive metadata inside Python trees.
- Optional `doctor --probe` execution with bounded local command probes, safe default probe policy, explicit `--probe-startup`, process-tree timeout cleanup, ready-output detection, and probe traces.
- `doctor-suite` batch diagnosis for real-project validation with ecosystem coverage, failure-type distribution, and unclassified probe logs.
- Doctor HTML action-panel reports.
- Failure-log classification for missing environment variables, missing files, missing modules, port conflicts, database failures, pending migrations, private registry authentication failures, dependency resolution errors, Docker daemon failures, incompatible runtime versions, native build tool failures, TLS/certificate errors, DNS/network failures, lockfile mismatches, permission problems, configuration parse errors, and compile errors.
- Doctor JSON and terminal reports with likely root causes, next actions, planned probes, and probe results.
- Startup diagnosis model with `ready`, `needs_setup`, `blocked`, and `unsupported` verdicts.
- Detected prepare and run commands for common Node.js, Python, and Docker projects.
- Startup blockers, setup warnings, and safety risks in structured JSON output.
- `--show-all` for users who still want the full audit list.
- HTML report section for startup diagnosis, commands, blockers, and risks.
- GitHub Action summary output for startup verdicts and detected commands.

### Changed

- Product positioning now emphasizes broad local startup diagnosis instead of a 30-second scan promise.
- Main package description and scan report tagline now point users to doctor mode for deeper investigation.
- Terminal output now defaults to the practical startup path instead of printing every pass/fail item.
- Doctor terminal, JSON, and HTML output now include an action panel with confidence, ranked root causes, next command, safe/manual fixes, probe trace, and unknowns.
- Doctor action panels now separate readiness score from diagnosis confidence so a blocked project is not presented like a healthy 100-point result.
- Safe fixes now include conservative `tsconfig.json` and Vite `index.html` creation recipes, while package script and env-template patches remain manual.
- Probe classifiers now distinguish missing local Node dependencies from generic command-not-found failures and identify macOS `__MACOSX`/`._*` files that make Python compile checks fail with null-byte syntax errors.
- Real-project failures can now be distilled into corpus cases and run as part of the automated test suite.
- README, license, CI, tests, and other repository hygiene findings are hidden from the default terminal report.
- README demo positioning now shows the evidence loop from 50-source dataset intake through scan review instead of relying only on a static benchmark.
- Lockfile and other non-blocking hygiene-style setup warnings no longer dominate the startup summary.

### Fixed

- Docker Compose startup commands are withheld when Compose paths are already known to be broken.
- Prisma datasource providers are parsed separately from generator providers before migration checks are planned.
- Laravel missing `APP_KEY` startup logs are classified directly.
- Unsupported stacks remain `Unsupported / Not scored` instead of receiving a misleading numeric readiness score.

## [0.1.1] - 2026-06-21

### Added

- Separate `setup` readiness and repository `hygiene` scopes.
- Primary, supporting, and incidental stack evidence in JSON and plugin context.
- Context-aware classification for source, documentation, tests, examples, and generated files.
- Regression coverage for workspaces, contextual secret detection, stack ranking, empty repositories, unknown stacks, and unsupported C++ projects.
- GitHub Action status output for `scored` and `not_scored` results.

### Changed

- Aggregate explicit Node.js workspace dependency and lockfile results at the repository root instead of repeating member-package warnings.
- Return schema 1.2 with a null score and grade when readiness cannot be assessed for an empty, unknown, or unsupported primary stack.
- Use CLI exit code `2` for an unscorable threshold check while retaining exit code `1` for a valid score below the requested threshold.
- Keep documentation and test fixtures from being treated as primary source in context-sensitive environment and credential checks.
- Expand the automated suite to 44 tests across the Windows, Linux, and macOS CI matrix on Node.js 18 and 22.

### Fixed

- Prevent unsupported repositories from receiving misleading high readiness grades such as the externally observed C++ `98/100 A` result.
- Reduce repeated monorepo warnings and documentation-driven credential false positives observed during exploratory validation.
- Improve primary-stack ranking for mixed-technology repositories.

### Research status

This is a maintenance release. It does not claim validated precision, recall, F1, or developer time savings. Stable `v0.2.0` remains gated on the independent pilot, holdout, and human-comparison evidence maintained in [SetupBench-Lens](https://github.com/Milankunderzzz/SetupBench-Lens).

## [0.1.0] - 2026-06-18

- Initial public MVP with local terminal, JSON, HTML, plugin, and GitHub Action interfaces for Node.js, Python, Docker, configuration, path, security, and repository checks.

[0.2.0-alpha.1]: https://github.com/Milankunderzzz/SetupLens/compare/v0.1.1...v0.2.0-alpha.1
[0.1.1]: https://github.com/Milankunderzzz/SetupLens/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/Milankunderzzz/SetupLens/releases/tag/v0.1.0
