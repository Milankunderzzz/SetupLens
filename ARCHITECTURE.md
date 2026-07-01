# Why I Built SetupLens

I often clone repositories that fail to run because of missing env files,
wrong Node versions, Docker path issues, dependency problems, database
configuration, or project-specific startup steps. SetupLens tries to detect,
probe, and explain these problems before developers waste time debugging them
manually.

This started as a small question: how much of a failed first run can be
explained from files that are already in the repository? The current direction
adds a second question: after static evidence builds a startup plan, which
bounded local probes can safely confirm the next failure?

## The Boundary I Chose

SetupLens diagnoses whether a repository is ready to install, configure, and
start on the current machine. It is not a vulnerability scanner, a general
code-quality tool, or a hosted repository dashboard. Keeping that boundary
clear helps me decide whether a new check belongs in the core, a doctor
adapter, or a plugin.

A core check should:

1. Identify a common setup failure.
2. Use evidence from local files or commands.
3. Work without uploading repository data.
4. Give the developer one concrete next step.

Team policy and framework-specific rules can use the plugin API instead.

## How a Scan Works

The scan currently has four stages:

1. `src/lib/files.js` builds a bounded index and classifies files as primary,
   documentation, test fixtures, examples, or generated content.
2. `src/checks/` ranks primary and supporting stacks, detects workspaces, and
   produces independent findings.
3. `src/scan.js` combines findings and calculates a readiness score.
4. `src/reporters/` renders the same result for terminal, JSON, or HTML use.

GitHub Actions and the CLI both call this same scan function. I want one result
model rather than separate behavior for local and CI runs.

## How Doctor Mode Works

`setuplens doctor` keeps the scan result but adds a second diagnosis layer:

1. `src/doctor.js` runs the existing scan, builds a fresh repository context,
   and calls doctor adapters.
2. `src/doctor/adapters/` turns ecosystem knowledge into signals, actions,
   issues, and planned probes. Current adapters cover Node.js, Python, Docker,
   Prisma, PHP, Ruby, Java, .NET, Go, Rust, monorepos, local services, and
   README instructions.
3. `src/doctor/probes.js` optionally runs bounded local commands when the user
   passes `--probe`. Probes are explicit, timed, and captured locally.
4. `src/doctor/error-classifier.js` classifies probe output into reusable root
   cause families such as missing environment variables, missing files, missing
   modules, port conflicts, database failures, pending migrations, private
   registry auth failures, dependency resolver failures, Docker daemon failures,
   runtime version mismatches, native build tool failures, TLS problems, DNS
   failures, lockfile mismatches, permission issues, config parse failures, and
   compile errors.
5. `src/reporters/doctor-terminal.js` renders likely root causes, next actions,
   and probe results separately from the older scan score.

The scan remains useful for CI thresholds and HTML reports. Doctor mode is the
more general interactive diagnosis path.

## Design Decisions

**Read-only by default.** A diagnostic tool should earn trust before it changes
someone's project. SetupLens reports a fix but does not apply it.

**Probes are opt-in.** Static `scan` and plain `doctor` do not run project
commands. `doctor --probe` may execute local diagnostic commands with timeouts,
so the user must ask for that deeper validation.

**Evidence before explanation.** Checks should point to a missing file, command,
or manifest entry. An optional AI explanation may be useful later, but it
should explain a finding rather than create one.

**Context is evidence.** A manifest under a test fixture is not equivalent to a
root manifest, and a documented secret-shaped example is not equivalent to an
application credential. High-confidence credential types remain visible, while
context-sensitive patterns require primary-workflow evidence.

**One root cause, one deduction.** Explicit Node workspaces share their root
installation and lockfile state. SetupLens reports that state once instead of
multiplying identical warnings across every member package.

**No runtime dependencies.** The scanner and doctor use Node.js built-ins so
that the tool itself adds as little setup work as possible. The two development
dependencies only generate the demo GIF.

**Explicit plugins.** Plugins execute local JavaScript, so SetupLens loads only
the paths named by the user. There is no automatic plugin discovery yet.

**Scores require a supported primary stack.** A numeric readiness grade is
only valid when repository evidence identifies a primary stack covered by the
active SetupLens rules. Empty repositories, unknown stacks, and unsupported
primary stacks return schema 1.2 with `scorable: false`, a null score and grade,
and an auditable `notScoredReason`. Hygiene findings remain available, while
threshold-based CLI and Action runs fail closed instead of treating missing
coverage as high readiness.

## What Is Still Rough

- The adapter set is broad but intentionally shallow in newer ecosystems. Node,
  Python, Docker, Prisma, and README-guided startup instructions are still the
  strongest paths; PHP, Ruby, Java, .NET, Go, Rust, monorepo, and service
  adapters establish the next expansion layer.
- Makefile and Compose parsing intentionally covers common patterns rather than
  every valid syntax form.
- The score weights are hand-tuned and need feedback from more repositories.
- Probe mode classifies early command failures, but a timeout or successful
  smoke command does not prove the entire application is correct.
- The project has one maintainer, so I prefer small, testable changes.

These are current constraints, not hidden promises. I will update this document
when the architecture changes or experience proves one of these choices wrong.
