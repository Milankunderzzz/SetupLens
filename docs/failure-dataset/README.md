# Failure Dataset Intake

SetupLens should improve from evidence, not from claims. The failure dataset intake is the outer loop before a case becomes a sanitized fixture in `docs/failure-corpus/cases.json`.

## What The Manifest Keeps

Each collected source records:

- GitHub repository URL, clone URL, API URL, default branch, license, topics, language, stars, and update timestamps.
- The exact GitHub Search query, ecosystem bucket, page, rank, endpoint, and collection timestamp.
- Optional clone evidence: local clone path, resolved commit, commit date, and checkout command.
- Optional doctor evidence: readiness, diagnosis confidence, root-cause ranking, safe/manual fix counts, unclassified probe logs, unknowns, and per-repository JSON report path.

Third-party repository contents are cloned into `.setuplens/failure-dataset/repos` by default and stay out of git. The committed manifest is meant to preserve reproducible evidence, not vendor external source code.

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
```

The review separates:

- corpus promotion candidates;
- ecosystem coverage;
- failure-type distribution;
- safe-fix opportunities;
- manual-fix opportunities;
- unsupported stacks;
- unclassified probe logs;
- diagnostic unknowns.

Only sanitized, minimal reproductions should be promoted into the committed failure corpus. The manifest and per-repository reports provide the evidence needed to recreate the source failure before reducing it into a fixture.

