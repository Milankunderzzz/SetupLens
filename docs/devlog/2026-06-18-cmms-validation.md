# First Real SetupLens Validation

Date: 2026-06-18

## Why I Tested It

I wanted to test SetupLens on a real project instead of only scanning its own
repository. I used my CMMS project because it contains Node.js, Python, and
Docker, and I already knew that its setup was not completely straightforward.

## Repository and Command Used

I ran the local CLI against the CMMS repository:

```bash
node ./bin/setuplens.js scan <path-to-CMMS-main>
```

SetupLens indexed 236 files in 782 ms. It detected Node.js, Python, and Docker.
The report contained 4 failed checks, 9 warnings, and 12 passed checks.

## What SetupLens Found

The two findings I investigated first were:

- Four missing local paths referenced by `docker-compose.yml`.
- A Makefile command that calls an npm script which does not exist.

## What I Manually Verified

The Compose file refers to paths under `infra/`, but the files are actually
stored under `infrastructure/`. I searched the repository and confirmed that
both Dockerfiles and both nginx paths exist in the longer directory name. This
means all four Compose path findings were accurate.

The Makefile runs `npm run format` inside the frontend directory. I inspected
the frontend package scripts and found `dev`, `build`, `start`, `lint`, `test`,
and `e2e`, but no `format` script. This finding was also accurate.

In total, SetupLens identified five setup blockers that I confirmed manually.

## What Surprised Me

The most useful part was not the score. It was the evidence: filenames, line
numbers, and available npm scripts made each problem quick to verify. Scanning
SetupLens itself produced a perfect result, but scanning a different project
showed where the tool can save real investigation work.

## What I Want to Improve Next

I want to test more repositories before adding many new rules. I also want to
look at whether the final score should distinguish direct startup blockers from
repository hygiene findings such as documentation and licensing. The next
change should be based on a reproduced problem and include a regression test.
