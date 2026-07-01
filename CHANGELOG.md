# Changelog

## Unreleased

### Added

- `setuplens doctor` for broader repository diagnosis beyond static readiness scoring.
- Doctor adapters for Node.js, Python, Docker, Prisma, PHP, Ruby, Java, .NET, Go, Rust, monorepos, local services, and README instructions.
- Optional `doctor --probe` execution with bounded local command probes and timeout control.
- Failure-log classification for missing environment variables, missing files, missing modules, port conflicts, database failures, pending migrations, private registry authentication failures, dependency resolution errors, Docker daemon failures, incompatible runtime versions, native build tool failures, TLS/certificate errors, DNS/network failures, lockfile mismatches, permission problems, configuration parse errors, and compile errors.
- Doctor JSON and terminal reports with likely root causes, next actions, planned probes, and probe results.

### Changed

- Product positioning now emphasizes broad local startup diagnosis instead of a 30-second scan promise.
- Main package description and scan report tagline now point users to doctor mode for deeper investigation.

## 0.2.0-alpha.1

This alpha refocuses SetupLens from a broad repository checklist into a startup diagnosis tool.

### Added

- Startup diagnosis model with `ready`, `needs_setup`, `blocked`, and `unsupported` verdicts.
- Detected prepare and run commands for Node.js, Python, and Docker projects.
- Startup blockers, setup warnings, and safety risks in structured JSON output.
- `--show-all` for users who still want the full audit list.
- HTML report section for startup diagnosis, commands, blockers, and risks.
- GitHub Action summary output for startup verdicts and detected commands.

### Changed

- Terminal output now defaults to the practical startup path instead of printing every pass/fail item.
- README, license, CI, tests, and other repository hygiene findings are hidden from the default terminal report.
- Lockfile and other non-blocking hygiene-style setup warnings no longer dominate the startup summary.

### Fixed

- Docker Compose startup commands are withheld when Compose paths are already known to be broken.
- Unsupported stacks remain `Unsupported / Not scored` instead of receiving a misleading numeric readiness score.

## 0.1.0

- Initial public MVP with local repository scanning, terminal/JSON/HTML reports, GitHub Action support, setup and hygiene scopes, and context-aware rule improvements.
