# Failure Dataset Scan Review - 2026-07-01

This review records the first full `failure-dataset collect --clone --scan` run after the dataset intake command was added.

## Command

```bash
setuplens failure-dataset collect --limit 50 --clone --scan --format json --output .setuplens/failure-dataset/sources.json --no-color
setuplens failure-dataset review --input .setuplens/failure-dataset/sources.json --format json --output .setuplens/failure-dataset/review.json --no-color
```

The run used static doctor scans only. Command probes were not enabled, so `needs_probe` and diagnostic unknowns are expected follow-up signals rather than final classifier failures.

## Result

| Metric | Count |
|---|---:|
| Public sources collected | 50 |
| Repositories cloned | 49 |
| Repositories scanned | 49 |
| Clone failures recorded | 1 |
| Corpus promotion candidates | 41 |
| Safe fix opportunities | 77 |
| Manual fix opportunities | 786 |
| Rule gaps | 58 |
| Unclassified probe logs | 0 |

## Scan Statuses

| Status | Count |
|---|---:|
| needs_setup | 31 |
| blocked | 10 |
| needs_probe | 8 |
| skipped | 1 |

## Source Ecosystem Sampling

The 50-source manifest covers 12 discovery buckets:

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
| missing_env_reference | 784 |
| missing_compose_env_file | 18 |
| dependencies.node.installed.package.json | 14 |
| configuration.env.missing..env.example | 13 |
| dependencies.python.venv | 13 |
| dependencies.node.workspace-installed | 6 |
| next_missing_routes | 4 |
| paths.compose.docker-compose.yml | 4 |
| dependencies.node.installed.docs/package.json | 3 |
| duplicate_project_copies | 3 |

## Blocked Promotion Candidates

| Project | Top root cause |
|---|---|
| `PramodTKodag/snark` | `missing_compose_env_file` |
| `Dw58/compare-your-models` | `paths.compose.docker-compose.yml` |
| `Night63826281/react-flower-shop-website-template` | `runtime.package-manager.bun` |
| `chatwoot/chatwoot` | `missing_compose_env_file` |
| `David-H-Afonso/GamesDatabase.Api` | `paths.compose.docker-compose.yml` |
| `xdimondfan23/int3rceptor` | `paths.compose.docker-compose.yml` |
| `uniz-rguktong/uniz-master` | `missing_compose_env_file` |
| `polarsource/polar` | `paths.compose.server/docker-compose.yml` |
| `hantsy/spring-reactive-sample` | `paths.compose.docker-compose.yml` |
| `beshu-tech/deltaglider_proxy` | `missing_compose_env_file` |

## Clone Boundary Found

`openfoodfoundation/openfoodnetwork` was discovered and attempted, but checkout failed on Windows because a fixture path exceeded the local filename length limit. The collector recorded this as a clone failure instead of silently dropping the source. That is useful evidence for the next dataset-intake upgrade: resume support, size/path-risk filters, and clearer clone-failure classification.

## Follow-Up Backlog

- Add a `--from-manifest` mode so clone and scan can resume from an existing committed source manifest instead of rediscovering.
- Add repository size and path-risk filters to avoid very large or Windows-hostile repositories when the goal is fast corpus growth.
- Add optional parallel clone/scan workers with bounded concurrency.
- Promote the best blocked candidates into sanitized minimal fixtures in `docs/failure-corpus/cases.json`.
- Run a second pass with `--probe` on the promotion queue only, not on all 50 repositories.

