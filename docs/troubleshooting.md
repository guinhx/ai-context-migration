# Troubleshooting

## Setup / configuration

### "ctx has not been configured yet"

Run the setup wizard:

```sh
ctx setup
```

Or pass provider flags manually:

```sh
ctx list --provider=codex
```

### Config not persisting

Config lives at `~/.ctx/config.json`. Verify it exists and contains `"setupComplete": true`.

```sh
# Windows
type %USERPROFILE%\.ctx\config.json

# macOS / Linux
cat ~/.ctx/config.json
```

Re-run setup if needed:

```sh
ctx setup --force
```

## Codex connection

### "Could not auto-detect Codex"

Set the executable path explicitly:

```sh
# Environment variable
export CODEX_CLI_PATH="/path/to/codex"

# Or via setup
ctx setup --force
```

**Windows default path:**

```
%LOCALAPPDATA%\OpenAI\Codex\bin\<version>\codex.exe
```

### Connection test fails

1. Make sure Codex desktop app is installed
2. Verify you're logged in to Codex
3. Try running `codex app-server` manually in a terminal
4. Check `CODEX_CLI_PATH` points to the correct binary

### Validation errors on `thread/list` or `thread/read`

Codex schema evolves between versions. If you see Zod validation errors, please [open a bug report](https://github.com/guinhx/ai-context-migration/issues/new?template=bug_report.yml) with:

- Codex version / path
- Full error message
- Output of `ctx list --json` (if partial)

## Migration

### Empty or incomplete thread

Some threads need to be resumed before turns are available. The Codex provider automatically calls `thread/resume` when a thread has no turns.

If content is still missing, try:

```sh
ctx read <thread-id> --json
```

to inspect the raw canonical output.

### Generated AGENTS.md is too large

Large threads produce large files. Options:

- Use `--format=markdown` for a more readable archive
- Use `--format=json` and post-process with your own script
- Migrate specific threads instead of `--all`

## Development

### `bun link` vs compiled binary

| Method | Updates on code change? | Requires Bun? |
|--------|-------------------------|---------------|
| `bun run link` | Yes (immediate) | Yes |
| `bun run build` | No (rebuild needed) | No at runtime |

After code changes during development:

```sh
bun run link        # if using link
# or
bun run build       # if using standalone binary
```

### Typecheck

```sh
bun run typecheck
```
