# Contributing

Thank you for helping SetupLens make repository setup less mysterious.

## Good Contributions

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

Open an issue before a large architectural change. Small fixes can go directly to a pull request.
