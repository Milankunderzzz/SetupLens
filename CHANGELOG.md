# Changelog

All notable changes to SetupLens are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project uses semantic versioning while it remains in the `0.x` stage.

## [0.1.1] - 2026-06-21

### Added

- Separate `setup` readiness and repository `hygiene` scopes.
- Primary, supporting, and incidental stack evidence in JSON and plugin context.
- Context-aware classification for source, documentation, tests, examples, and
  generated files.
- Regression coverage for workspaces, contextual secret detection, stack
  ranking, empty repositories, unknown stacks, and unsupported C++ projects.
- GitHub Action status output for `scored` and `not_scored` results.

### Changed

- Aggregate explicit Node.js workspace dependency and lockfile results at the
  repository root instead of repeating member-package warnings.
- Return schema 1.2 with a null score and grade when readiness cannot be
  assessed for an empty, unknown, or unsupported primary stack.
- Use CLI exit code `2` for an unscorable threshold check while retaining exit
  code `1` for a valid score below the requested threshold.
- Keep documentation and test fixtures from being treated as primary source in
  context-sensitive environment and credential checks.
- Expand the automated suite to 44 tests across the Windows, Linux, and macOS
  CI matrix on Node.js 18 and 22.

### Fixed

- Prevent unsupported repositories from receiving misleading high readiness
  grades such as the externally observed C++ `98/100 A` result.
- Reduce repeated monorepo warnings and documentation-driven credential false
  positives observed during exploratory validation.
- Improve primary-stack ranking for mixed-technology repositories.

### Research status

This is a maintenance release. It does not claim validated precision, recall,
F1, or developer time savings. Stable `v0.2.0` remains gated on the independent
pilot, holdout, and human-comparison evidence maintained in
[SetupBench-Lens](https://github.com/Milankunderzzz/SetupBench-Lens).

## [0.1.0] - 2026-06-18

- Initial public MVP with local terminal, JSON, HTML, plugin, and GitHub Action
  interfaces for Node.js, Python, Docker, configuration, path, security, and
  repository checks.

[0.1.1]: https://github.com/Milankunderzzz/SetupLens/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/Milankunderzzz/SetupLens/releases/tag/v0.1.0
