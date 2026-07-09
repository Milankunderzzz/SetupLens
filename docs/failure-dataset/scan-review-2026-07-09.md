# Failure Dataset Scan Review - 2026-07-09

This review records the first regenerated 50-source public dataset after the
`v0.2.0-alpha.3` corpus-promotion release. It replaces the old alpha.1 source
manifest with alpha.3 provenance and keeps cloned third-party repositories plus
per-repository doctor reports in the ignored `.setuplens` cache.

## Command

```powershell
$env:GITHUB_TOKEN = gh auth token
node .\bin\setuplens.js failure-dataset collect --limit 50 --clone --scan --timeout 8000 --format json --output .setuplens\failure-dataset\sources.json
node .\bin\setuplens.js failure-dataset review --input .setuplens\failure-dataset\sources.json --format json --output .setuplens\failure-dataset\review.json
node .\bin\setuplens.js failure-dataset promote --input .setuplens\failure-dataset\sources.json --format json --output .setuplens\failure-dataset\corpus-drafts.json
npm run corpus:promote-public
npm run corpus
```

The run used static doctor scans only. Command probes were not enabled, so
`needs_probe` and diagnostic unknowns are expected follow-up signals rather than
final classifier failures.

## Result

| Metric | Count |
|---|---:|
| Public sources collected | 50 |
| Repositories cloned | 47 |
| Repositories scanned | 47 |
| Clone failures recorded | 3 |
| Corpus promotion candidates | 39 |
| High-priority promotion drafts | 12 |
| Safe fix opportunities | 77 |
| Manual fix opportunities | 19 |
| Rule gaps | 58 |
| Unclassified probe logs | 0 |

## Review Scorecard

| Metric | Result |
|---|---:|
| Diagnostic hit rate | 100% (39/39 operational) |
| Safe-fix generation rate | 100% (39/39 operational) |
| False-blocker risk rate | 0% (0/12 operational) |
| Ecosystem coverage count | 12 discovery buckets |
| Root-cause-first rate | n/a until cases are labeled |
| False-blocker rate | n/a until cases are labeled |

Public source scans remain operational evidence. Label-dependent accuracy claims
only become valid after a candidate is minimized, sanitized, and promoted into
the curated failure corpus.

## Scan Statuses

| Status | Count |
|---|---:|
| needs_setup | 27 |
| blocked | 12 |
| needs_probe | 8 |
| skipped | 3 |

## Source Ecosystem Sampling

The 50-source manifest covers the same 12 discovery buckets as the alpha.1
intake:

| Ecosystem bucket | Count |
|---|---:|
| next | 5 |
| vite | 5 |
| django | 4 |
| dotnet | 4 |
| fastapi | 4 |
| go | 4 |
| laravel | 4 |
| monorepo | 4 |
| prisma | 4 |
| rails | 4 |
| rust | 4 |
| spring | 4 |

## Top Failure Types

| Failure type | Count |
|---|---:|
| missing_env_reference | 13 |
| dependencies.node.installed.package.json | 12 |
| configuration.env.missing..env.example | 11 |
| missing_compose_env_file | 11 |
| dependencies.python.venv | 9 |
| dependencies.node.workspace-installed | 5 |
| paths.compose.docker-compose.yml | 4 |
| next_missing_routes | 3 |
| stack.detected | 3 |
| dependencies.node.installed.frontend/package.json | 2 |
| duplicate_project_copies | 2 |
| laravel_missing_env | 2 |

## Blocked Promotion Candidates

| Project | Top root cause | Safe | Manual |
|---|---|---:|---:|
| `araldev/jobs-finder` | `missing_compose_env_file` | 4 | 1 |
| `avase33/modelvault` | `missing_compose_env_file` | 4 | 0 |
| `avase33/sentinel-ml` | `paths.compose.docker-compose.yml` | 2 | 0 |
| `Bumerdene073/fraud-detector` | `paths.compose.docker-compose.yml` | 1 | 0 |
| `chatwoot/chatwoot` | `missing_compose_env_file` | 3 | 0 |
| `graphif/project-graph` | `runtime.node` | 1 | 2 |
| `inference-gateway/inference-gateway` | `missing_compose_env_file` | 8 | 0 |
| `mozilla/pontoon` | `missing_compose_env_file` | 2 | 1 |
| `PRX/feeder.prx.org` | `paths.compose.docker-compose.yml` | 2 | 0 |
| `Raghu427/filamentphp-boilerplate` | `paths.compose.compose.yaml` | 3 | 0 |
| `rustfs/rustfs` | `paths.compose..docker/openobserve-otel/docker-compose.yml` | 2 | 0 |
| `stamhoofd/stamhoofd` | `runtime.package-manager.yarn` | 2 | 1 |

## Improvement Against The Alpha.1 Review

| Signal | 2026-07-01 alpha.1 review | 2026-07-09 alpha.3 review | What changed |
|---|---:|---:|---|
| `missing_env_reference` findings | 784 | 13 | Repeated env references are now grouped into evidence-rich causes instead of flooding reports. |
| Manual fix opportunities | 786 | 19 | Fix-plan grouping now avoids one action per repeated variable or nested package. |
| Safe fix opportunities | 77 | 77 | Safe-fix yield stayed high while manual-noise volume dropped. |
| Promotion candidates | 41 | 39 | Candidate volume stayed comparable despite a different live GitHub sample. |
| Clone failures | 1 | 3 | The new live sample exposed network, checkout, and Windows path-length clone boundaries. |
| Unclassified probe logs | 0 | 0 | Static review still produced no unclassified probe noise. |

The strongest alpha.3 signal is not a higher candidate count; it is lower report
noise with the same safe-fix yield. That makes the action panel more useful to a
human reviewer.

## Corpus Promotion

The promotion command produced 39 public scan drafts. After review, SetupLens
generated 43 sanitized distilled fixtures from those patterns without copying
third-party source. The failure corpus now contains 56 cases and passes:

| Corpus metric | Result |
|---|---:|
| Cases | 56 |
| Passing cases | 56 |
| Diagnostic hit rate | 100% |
| Root cause ranked first | 94.2% |
| Safe-fix generation | 100% |
| False blockers | 0 |

## Clone Boundaries Found

Three sources did not become scanned repositories:

- one `git_clone_failed` network transfer;
- one `git_checkout_failed` partial checkout;
- one `windows_path_too_long` checkout.

These are useful intake boundaries. They justify resume support, shorter clone
paths, optional sparse checkout, and path-risk filters before scaling the public
dataset beyond 50 sources on Windows.

## Follow-Up Backlog

- Add `failure-dataset collect --from-manifest` so clone and scan can resume the
  exact committed 50-source manifest instead of rediscovering live GitHub
  results.
- Add optional bounded concurrency for clone/scan while preserving per-source
  timeout and report isolation.
- Run probe mode on the 12 high-priority blocked candidates only, not on the
  entire 50-source intake.
- Turn repeated `runtime.node` and package-manager blockers into clearer
  runtime-version fix plans.
- Keep promoting new public candidates only as minimized, sanitized fixtures.
