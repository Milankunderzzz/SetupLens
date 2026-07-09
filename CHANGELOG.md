# Changelog

All notable changes to SetupLens are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project uses semantic versioning while it remains in the `0.x` stage.

## [Unreleased]

### Added

- Regenerated the 50-source failure-dataset manifest with `0.2.0-alpha.3`, including sanitized clone and scan summaries without local absolute paths.
- Added `npm run corpus:promote-public` to convert reviewed public scan patterns into sanitized synthetic corpus fixtures without copying third-party source.
- Expanded the failure corpus from 13 to 56 passing cases across Next.js, Vite, Prisma, Django, FastAPI, Laravel, Rails, Spring Boot, .NET, Go, Rust, Docker Compose, Turbo, Nx, and monorepo setup failures.
- Added an alpha.3 capability comparison report and a 2026-07-09 failure-dataset scan review.
- Added `npm run report:capability` to regenerate the UTF-8 HTML capability report.

### Changed

- HTML report font stacks now include common CJK fonts so Chinese report text renders correctly on Windows and macOS.

## [0.2.0-alpha.3] - 2026-07-08

This alpha turns failure-dataset review output into a promotion workflow so real public failures can move toward curated corpus coverage without copying third-party source code by accident.

### Added

- `setuplens failure-dataset promote` for generating reviewable corpus case drafts from scanned public repository evidence.
- Promotion drafts with priority, missing-evidence notes, reproduction commands, expected status, expected root-cause types, top-root-cause expectations, safe-fix expectations, and a human review checklist.
- `setuplens failure-dataset clean` for safely removing local cloned dataset repositories under `.setuplens/failure-dataset/repos`.
- `--include-reports` for cleaning per-repository doctor reports along with cloned repositories.
- npm shortcuts for `dataset:promote` and `dataset:clean`.

### Changed

- Package version advanced to `0.2.0-alpha.3`.
- Documentation now presents corpus promotion and local cache cleanup as the next iteration after alpha.2 scorecards.

## [0.2.0-alpha.2] - 2026-07-02

This alpha adds a review scorecard so public failure-dataset scans can be evaluated as a regression signal instead of only described as pass/fail evidence.

### Added

- Failure dataset review scorecards with diagnostic hit rate, root-cause-first rate, safe-fix generation rate, false-blocker rate, operational false-blocker risk, and ecosystem coverage count.
- Per-ecosystem review scorecard rows with source counts, scanned counts, corpus candidates, verdict mix, safe/manual fix totals, and top failure types.
- Terminal review output now surfaces the scorecard, evaluation mode, labeled-case count, and notes when public scans do not yet have human ground-truth labels.

### Changed

- Failure dataset review can now separate labeled evaluation metrics from operational proxy metrics, avoiding misleading precision claims for unlabeled public repositories.
- Normal repository scans now skip the `.setuplens` cache directory so retained failure-dataset clones do not pollute reports or demos.
- Package version advanced to `0.2.0-alpha.2`.

### Fixed

- The generated demo report no longer includes cloned failure-dataset repositories from the local `.setuplens` cache.
- Failure corpus env examples no longer use credential-shaped database URLs that make SetupLens report its own sanitized fixtures as secret exposures.

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
- Doctor root-cause ranking now groups large repeated environment-reference and Compose `env_file` failures into evidence-rich aggregate causes, based on the first 50-source failure dataset scan.
- Fix plans now group large environment-template placeholder reviews into one manual recipe instead of flooding reports with one action per variable.
- Failure dataset collection now classifies clone failures such as Windows path-length checkout failures instead of recording them as generic collection errors.
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

[0.2.0-alpha.3]: https://github.com/Milankunderzzz/SetupLens/compare/v0.2.0-alpha.2...v0.2.0-alpha.3
[0.2.0-alpha.2]: https://github.com/Milankunderzzz/SetupLens/compare/v0.2.0-alpha.1...v0.2.0-alpha.2
[0.2.0-alpha.1]: https://github.com/Milankunderzzz/SetupLens/compare/v0.1.1...v0.2.0-alpha.1
[0.1.1]: https://github.com/Milankunderzzz/SetupLens/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/Milankunderzzz/SetupLens/releases/tag/v0.1.0
