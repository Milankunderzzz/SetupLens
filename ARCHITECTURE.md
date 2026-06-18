# Why I Built SetupLens

I often clone repositories that fail to run because of missing env files,
wrong Node versions, or Docker path issues. SetupLens tries to detect these
problems before developers waste time debugging them manually.

This started as a small question: how much of a failed first run can be
explained from files that are already in the repository? The first version is
my attempt to answer that question with a read-only command-line tool.

## The Boundary I Chose

SetupLens checks whether a repository is ready to run on the current machine.
It is not a vulnerability scanner, a general code-quality tool, or a hosted
repository dashboard. Keeping that boundary narrow helps me decide whether a
new check belongs in the core or in a plugin.

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

## Design Decisions

**Read-only by default.** A diagnostic tool should earn trust before it changes
someone's project. SetupLens reports a fix but does not apply it.

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

**No runtime dependencies.** The scanner uses Node.js built-ins so that the
tool itself adds as little setup work as possible. The two development
dependencies only generate the demo GIF.

**Explicit plugins.** Plugins execute local JavaScript, so SetupLens loads only
the paths named by the user. There is no automatic plugin discovery yet.

## What Is Still Rough

- The rule set is small and strongest for Node.js, Python, and Docker projects.
- Makefile and Compose parsing intentionally covers common patterns rather than
  every valid syntax form.
- The score weights are hand-tuned and need feedback from more repositories.
- The project has one maintainer, so I prefer small, testable changes.

These are current constraints, not hidden promises. I will update this document
when the architecture changes or experience proves one of these choices wrong.
