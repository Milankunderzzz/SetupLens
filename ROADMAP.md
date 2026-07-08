# SetupLens Roadmap

Last updated: 2026-07-04

SetupLens is moving toward a broad, local-first repository doctor. The goal is
not to claim that every project can be fixed automatically. The goal is to make
the tool good at identifying what the project is, why it probably fails, what
evidence supports that diagnosis, and which repairs are safe enough to suggest
or apply.

## Product Principles

1. Prefer evidence over feature count.
2. Keep diagnosis deterministic, local-first, and explainable.
3. Separate static readiness, command probes, and manual ground truth.
4. Treat unlabeled public scans as operational evidence, not accuracy proof.
5. Only apply low-risk, whitelisted repairs that never overwrite user files.
6. Promote real failures into minimal corpus cases before claiming coverage.

## Current Track

The v0.2 line has two user-facing layers:

- `scan`: deterministic readiness and repository hygiene checks for CI-style use.
- `doctor`: adapter-driven diagnosis with startup plans, optional probes,
  failure classification, fix plans, and action-panel reports.

The current `0.2.0-alpha.3` branch adds the promotion layer needed to turn
public scan evidence into reviewable corpus drafts while keeping cloned
third-party repositories out of git and easy to clean up locally.

## Version Direction

### v0.2.0-alpha.2 - Evidence scorecards and safer probes

Purpose: make the public failure-dataset loop measurable without pretending
unlabeled scans prove final accuracy.

- Report diagnostic hit rate, first-root-cause rate when labels exist,
  safe-fix generation, false-blocker metrics, false-blocker risk, and ecosystem
  coverage.
- Keep labeled accuracy separate from operational proxy metrics.
- Detect ready output from long-running startup commands and stop probes safely.
- Skip optional probes when prerequisites such as `node_modules` are missing.
- Keep version, README, changelog, demo report, and roadmap aligned.

Status: complete in the alpha.2 release branch.

### v0.2.0-alpha.3 - Corpus promotion workflow

Purpose: turn useful public scan results into reproducible fixtures instead of
letting them remain one-off observations.

- Add a promotion workflow for converting failure-dataset candidates into
  reviewable corpus case drafts.
- Store expected status, expected root-cause type, expected top cause, safe-fix
  expectation, and provenance pointer for each promoted case.
- Generate a review checklist that shows what evidence is still missing before a
  public candidate can become a committed fixture.
- Add cleanup tooling for `.setuplens/failure-dataset/repos` so large cloned
  datasets do not linger on a user's machine.

Exit condition: promotion drafts, cache cleanup, syntax checks, full tests,
corpus regression, and failure-dataset review all pass on the release branch.

### v0.2.0-beta - Real-project regression loop

Purpose: make SetupLens visibly stronger as more broken projects are scanned.

- Save historical scorecard snapshots so regressions can be compared over time.
- Add a visual regression report for ecosystem coverage, failure-type mix,
  unknown logs, safe-fix yield, and false-blocker risk.
- Expand framework-specific classifiers only when a corpus case or public scan
  shows the gap.
- Improve doctor HTML reports into a clearer action panel with root causes,
  evidence, next command, safe fixes, manual fixes, probe trace, unknowns, and
  confidence explanation.

Exit condition: a repeatable suite can show whether a rule change improved or
regressed real diagnostic behavior.

### v0.2.0 - Stable doctor preview

Purpose: ship a coherent first product-oriented release.

- Stabilize the `doctor`, `scan`, `doctor-suite`, and `failure-dataset` command
  contracts enough for early users.
- Publish npm and GitHub Action usage pointing at the same release tag.
- Keep the supported-ecosystem list honest and mark unsupported primary stacks
  as `Unsupported / Not scored`.
- Document limitations, safe-fix boundaries, and evidence requirements.

Release gate: the command contracts are documented, the demo is reproducible,
and no known score or report path can materially mislead users.

### v0.3.0 - Adoption-informed improvements

Purpose: prioritize changes by observed failure frequency and user value.

- Grow ecosystem depth from confirmed cases, not speculative pattern lists.
- Improve explanations, next actions, report comparison, and plugin ergonomics.
- Add more safe recipes only when the operation is local, reversible, and
  reviewable.
- Preserve the v0.2 evidence set as a regression suite.

### v1.0.0 - Stable product contract

Purpose: make SetupLens dependable for routine personal and CI use.

- Stabilize CLI commands, exit codes, JSON schemas, Action outputs, and plugin
  APIs.
- Publish compatibility, deprecation, security, and support policies.
- Maintain reproducible releases across npm, GitHub Action, and GitHub releases.
- Keep a maintained benchmark and regression report with clear limitations.

## Deferred Until Evidence Supports Them

- Unrestricted automatic repair.
- Running long-lived services by default.
- Cloud accounts, telemetry, or repository uploads.
- Accuracy, time-saving, or "works for every project" claims without measured
  evidence.
- Large new ecosystem expansions without corpus cases or public scan evidence.

## Decision Metrics

The roadmap is reviewed using:

- diagnostic hit rate;
- root cause ranked first;
- safe-fix generation rate;
- false-blocker rate and false-blocker risk;
- ecosystem coverage count;
- unclassified probe logs and diagnostic unknowns;
- time to first actionable next command;
- installation, scan, and report-generation success across supported platforms.
