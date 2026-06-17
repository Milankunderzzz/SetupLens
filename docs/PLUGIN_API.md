# SetupLens Plugin API

Plugins add repository or organization-specific checks without expanding the focused core.

Plugins execute local JavaScript and are never discovered or loaded automatically. Only load code you trust:

```bash
setuplens scan . --plugin ./setuplens-plugin.mjs
```

## Contract

```js
export default {
  name: 'team-policy',
  async run(context) {
    return [{
      id: 'codeowners',
      category: 'Team policy',
      status: 'warn',
      title: 'Code ownership',
      message: 'No CODEOWNERS file was found.',
      recommendation: 'Add CODEOWNERS for review routing.',
      weight: 3
    }];
  }
};
```

### Context

| Field | Type | Description |
|---|---|---|
| `root` | `string` | Absolute scan root |
| `stacks` | `readonly string[]` | Detected stack identifiers |
| `files` | `readonly string[]` | POSIX-style paths relative to the scan root |
| `readText(relative)` | `async function` | Reads a trusted repository text file |

### Finding

Required fields are `id`, `status`, `title`, and `message`.

`status` must be `pass`, `warn`, `fail`, or `info`. Optional `weight` values contribute to the readiness score for warnings and failures. Keep weights small and proportional; core rules use values from 2 to 20.

Plugins should never print secret values or send repository content over the network without explicit user consent.
