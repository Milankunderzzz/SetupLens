# Contributing

SetupLens is currently maintained by one person. Small issues and pull requests
are easier for me to review, and a concrete failing repository fixture is more
helpful than a broad feature proposal.

## Changes That Fit the Project

- A deterministic check for a common setup failure
- A cross-platform test fixture
- A false-positive reduction backed by a regression test
- Clearer terminal or HTML output
- Documentation for a supported stack

SetupLens keeps its core focused. Product-specific or organization-specific policy usually belongs in a plugin.

## Development

```bash
npm ci
npm run check
npm test
node ./bin/setuplens.js scan .
```

Requirements:

- Node.js 18.17 or newer
- No new runtime dependency without a strong portability justification
- Tests for new rules on Windows, Linux, and macOS where applicable

## Rule Guidelines

1. Prefer evidence from files or local commands over inference.
2. Never print credential values.
3. Explain why a finding matters and provide one concrete next action.
4. Use `fail` only when the repository cannot run safely or correctly.
5. Use `warn` for missing setup, reproducibility, or maintainability work.
6. Keep scans read-only unless the user explicitly invokes a future fix command.

For a new check, include the smallest repository fixture that demonstrates the
failure and assert the finding ID, status, and useful part of the message. Please
avoid tests that depend on software installed on the contributor's machine.

Open an issue before a large architectural change so I can explain the current
constraints. Small fixes can go directly to a pull request. I may ask to move a
product-specific rule to a plugin to keep the scanner focused.
