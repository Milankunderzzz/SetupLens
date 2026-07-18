# Failure Dataset Intake

SetupLens should improve from evidence, not from claims. The failure dataset intake is the outer loop before a case becomes a sanitized fixture in `docs/failure-corpus/cases.json`.

## What The Manifest Keeps

Each collected source records:

- GitHub repository URL, clone URL, API URL, default branch, license, topics, language, stars, and update timestamps.
- The exact GitHub Search query, ecosystem bucket, page, rank, endpoint, and collection timestamp.
- Optional clone evidence: local clone path, resolved commit, commit date, and checkout command.
- Optional doctor evidence: readiness, diagnosis confidence, root-cause ranking, safe/manual fix counts, unclassified probe logs, unknowns, and per-repository JSON report path.

Third-party repository contents are cloned into `.setuplens/failure-dataset/repos` by default and stay out of git. The committed manifest is meant to preserve reproducible evidence, not vendor external source code. When scan summaries are committed, local absolute paths and per-repository report paths are removed.
Normal repository scans skip the `.setuplens` cache directory, so retained dataset clones do not pollute a scan of the SetupLens checkout itself.

## Collect 50 Public Candidates

Metadata-only collection is the safest first pass:

```bash
setuplens failure-dataset collect --limit 50 --format json --output docs/failure-dataset/sources.json
```

For higher GitHub API limits, set one of these environment variables before collecting:

```bash
export GITHUB_TOKEN=...
```

On Windows PowerShell:

```powershell
$env:GITHUB_TOKEN = gh auth token
node .\bin\setuplens.js failure-dataset collect --limit 50 --format json --output docs\failure-dataset\sources.json
```

## Clone And Scan

The scanning pass clones candidates outside git, runs static doctor checks by default, and writes one JSON report per repository:

```bash
setuplens failure-dataset collect --limit 50 --clone --scan --format json \
  --output .setuplens/failure-dataset/sources.json
```

Probe mode is explicit:

```bash
setuplens failure-dataset collect --limit 50 --clone --scan --probe --timeout 8000
```

Startup probes still require `--probe-startup`, the same as normal `doctor` mode.

## Review Feedback

After scanning, generate the audit feedback:

```bash
setuplens failure-dataset review --input .setuplens/failure-dataset/sources.json
setuplens failure-dataset review --input .setuplens/failure-dataset/sources.json \
  --format json --output .setuplens/failure-dataset/review.json
setuplens failure-dataset review --input .setuplens/failure-dataset/sources.json \
  --history .setuplens/failure-dataset/scorecard-history.json
```

The review separates:

- a review scorecard with diagnostic hit rate, root-cause-first rate, safe-fix generation rate, false-blocker metrics, operational blocker risk, and ecosystem coverage;
- corpus promotion candidates;
- ecosystem coverage;
- failure-type distribution;
- safe-fix opportunities;
- manual-fix opportunities;
- unsupported stacks;
- unclassified probe logs;
- diagnostic unknowns.

For public repository scans, most sources do not have human ground-truth labels yet. In that mode the scorecard reports operational proxy metrics and explicitly marks label-dependent metrics such as `rootCauseFirstRate` and `falseBlockerRate` as `n/a`. Once a source is promoted into the curated corpus with expected root causes, the same scorecard can report labeled diagnostic accuracy.

When `--history` is provided, review appends a compact scorecard snapshot to the
given JSON file and compares the current pass with the previous snapshot. The
comparison marks each tracked signal as `improved`, `regressed`, `unchanged`, or
`not_comparable`, which makes repeated real-project scans usable as a regression
model instead of isolated reports.

## Promote Corpus Drafts

Promotion turns the best scanned candidates into reviewable corpus drafts without copying public source files automatically:

```bash
setuplens failure-dataset promote --input .setuplens/failure-dataset/sources.json
setuplens failure-dataset promote --input .setuplens/failure-dataset/sources.json \
  --format json --output .setuplens/failure-dataset/corpus-drafts.json
```

Each draft includes:

- priority and missing-evidence notes;
- the source repository, license, GitHub query, commit, and doctor report path;
- the expected status, expected root-cause types, expected top root cause, and safe-fix expectation;
- reproduction commands;
- an empty `fixture.files` object that must be filled only after manual sanitization and minimization;
- a review checklist for reproduction, license review, secret removal, minimization, and regression testing.

Only sanitized, minimal reproductions should be promoted into the committed failure corpus. The manifest and per-repository reports provide the evidence needed to recreate the source failure before reducing it into a fixture.

After review, public scan patterns can be distilled into synthetic minimal
fixtures without copying third-party source:

```bash
npm run corpus:promote-public
npm run corpus
```

The alpha.3 evidence pass expanded the curated regression corpus from 13 to 56
passing cases. It is summarized in [scan-review-2026-07-09.md](scan-review-2026-07-09.md)
and [alpha3-capability-report.html](alpha3-capability-report.html).

## Clean Local Dataset Cache

After review, remove cloned third-party repositories while keeping manifests and reports:

```bash
setuplens failure-dataset clean
```

Remove per-repository doctor reports too when you want a fully clean local dataset cache:

```bash
setuplens failure-dataset clean --include-reports
```

Cleanup refuses paths outside `.setuplens/failure-dataset`, so it cannot be pointed at an arbitrary project directory by accident.

The first 50-source scan review is recorded in [scan-review-2026-07-01.md](scan-review-2026-07-01.md). The regenerated alpha.3 review is recorded in [scan-review-2026-07-09.md](scan-review-2026-07-09.md). These notes keep the public aggregate evidence and follow-up backlog without committing third-party repository contents or local absolute report paths.
