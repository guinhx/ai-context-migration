# Configuration

## Config file

After `ctx setup`, settings are stored at:

| OS | Path |
|----|------|
| Default | `~/.ctx/config.json` |
| With `XDG_CONFIG_HOME` | `$XDG_CONFIG_HOME/ctx/config.json` |

Example:

```json
{
  "version": 1,
  "setupComplete": true,
  "providers": {
    "codex": {
      "executablePath": "C:\\Users\\you\\AppData\\Local\\OpenAI\\Codex\\bin\\codex.exe"
    }
  },
  "defaults": {
    "inputProvider": "codex",
    "outputProvider": "cursor",
    "format": "agents-md"
  }
}
```

Re-run setup anytime:

```sh
ctx setup --force
```

## Environment variables

Copy [`.env.example`](../.env.example) to `.env` for local overrides (`.env` is gitignored).

| Variable | Description |
|----------|-------------|
| `CODEX_CLI_PATH` | Override path to the `codex` executable |
| `XDG_CONFIG_HOME` | Change the base directory for config |
| `NO_COLOR` | Disable colored terminal output |

## Resolution order

For provider paths and defaults, values are resolved in this order (highest wins):

1. CLI flags (`--from`, `--provider`, `--format`, etc.)
2. Environment variables (`CODEX_CLI_PATH`)
3. Config file (`~/.ctx/config.json`)
4. Built-in defaults

## Codex executable detection

If `CODEX_CLI_PATH` is not set and config has no path, the Codex provider auto-detects:

1. `CODEX_CLI_PATH` env var
2. Windows: `%LOCALAPPDATA%\OpenAI\Codex\bin\codex.exe` (newest version)
3. macOS: `/Applications/Codex.app/Contents/Resources/codex`
4. Fallback: `codex` on PATH
