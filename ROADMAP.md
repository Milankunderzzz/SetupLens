# SetupLens Roadmap

Last updated: 2026-06-20

SetupLens will move from a research prototype to a dependable product through
evidence, not feature count. Version numbers represent a stronger level of
validation and product commitment, not merely more checks.

## Product principles

1. Keep findings deterministic, local-first, read-only, and evidence-backed.
2. Improve Node.js, Python, and Docker accuracy before adding ecosystems.
3. Separate pilot repositories from confirmatory holdout evaluation.
4. Freeze the exact tool commit used for every reported experiment.
5. Do not claim time savings, accuracy, or usefulness before measuring them.
6. Prefer small maintenance releases and reversible changes.

## Version direction

### v0.1.x - Core maintenance (current)

Purpose: keep the existing MVP reliable while preparing the study.

- Maintain setup-readiness and repository-hygiene separation.
- Reduce confirmed false positives and false negatives.
- Keep terminal, JSON, HTML, CLI exit codes, and GitHub Action behavior aligned.
- Preserve cross-platform CI on Windows, Linux, and macOS.
- Add regression tests for every confirmed product defect.

Exit condition: the 10-repository pilot workflow is ready to run, with no
known scoring behavior that can materially mislead the experiment.

### v0.2.0-alpha.1 - Frozen pilot build

Purpose: create an immutable pre-release for the pilot study.

- Complete Pass A, Pass B, and Pass C for 10 pilot repositories.
- Resolve only pilot-confirmed validity blockers.
- Freeze the report schema, scoring rules, weights, and exact commit SHA.
- Record the tag, runtime, operating system, repository commits, and protocol
  version used to produce every pilot result.

Exit condition: the pilot and contamination audit are complete, the annotation
procedure is stable, and any later tool change requires a new experiment
version.

### v0.2.0 - Validated core and initial distribution

Purpose: publish the first version supported by independent evidence.

- Evaluate an uncontaminated holdout set against adjudicated Ground Truth.
- Report precision, recall, F1, repository-level confidence intervals, and
  diagnosis-time comparisons.
- Complete the real human-comparison records required by the protocol.
- Obtain five external users, three confirmed real findings, and at least one
  external Issue or feedback report.
- Publish a 30-second before/after demonstration.
- Align the GitHub Release, npm package, GitHub Action tag, and Marketplace
  listing to the same commit and documentation.

Release gate: benchmark validation passes, evidence and limitations are public,
critical false positives are resolved, and installation paths reproduce the
same version.

### v0.3.0 - Adoption-informed improvements

Purpose: improve the product using evidence from real use.

- Prioritize checks by observed failure frequency and user time saved.
- Improve explanations, next actions, plugin ergonomics, and report comparison.
- Consider a read-only repair preview only if external users demonstrate demand.
- Preserve the v0.2 benchmark as a regression suite and report metric changes.

Release gate: improvements are tied to external cases and do not regress the
validated core metrics beyond a documented tolerance.

### v1.0.0 - Stable product contract

Purpose: make SetupLens dependable for routine individual and CI use.

- Stabilize CLI commands, exit codes, JSON schema, Action outputs, and plugin API.
- Publish compatibility, deprecation, security, and support policies.
- Maintain reproducible releases across npm, GitHub Action, and Marketplace.
- Document validated operating-system and runtime support.
- Provide a maintained benchmark report and a repeatable release checklist.

Release gate: the public interfaces are stable, the evidence can be reproduced,
and maintenance capacity exists for the documented support promise.

## Deferred until evidence supports them

- Deep Java, Go, Rust, C++, or other ecosystem support.
- AI-generated explanations as a required part of diagnosis.
- Automatic project mutation or unrestricted repair commands.
- Cloud accounts, telemetry, or repository uploads.

Each deferred direction requires an Issue or proposal containing external user
evidence, scope, privacy impact, tests, and an evaluation plan.

## Decision metrics

The roadmap is reviewed using:

- condition-level precision, recall, and F1;
- false-positive severity and false-negative category;
- time to first actionable diagnosis;
- confirmed external cases and repeat usage;
- installation and report-generation success across supported platforms;
- unresolved critical defects and maintenance cost.

The research protocol and current evidence state live in
[SetupBench-Lens](https://github.com/Milankunderzzz/SetupBench-Lens).
