# Usage

All commands support `--help`.

```sh
ctx --help
ctx list --help
```

## Commands

### `ctx setup`

Interactive first-time configuration. Saves defaults to `~/.ctx/config.json`.

```sh
ctx setup
ctx setup --force    # reconfigure
```

### `ctx list`

List threads from an input provider.

```sh
ctx list
ctx list --limit=20
ctx list --provider=codex
ctx list --json       # raw JSON output
```

### `ctx read`

Pretty-print a thread to the terminal.

```sh
ctx read <thread-id>
ctx read <thread-id> --json
```

### `ctx export`

Export a thread as portable canonical JSON.

```sh
ctx export <thread-id> --from=codex
ctx export <thread-id> --from=codex --out=./my-thread.json
```

### `ctx migrate`

Convert a thread to another provider's format.

```sh
# Single thread → AGENTS.md (recommended for Cursor)
ctx migrate <thread-id> --from=codex --to=cursor --format=agents-md --out=./

# Full conversation as Markdown
ctx migrate <thread-id> --from=codex --to=cursor --format=markdown --out=./docs/

# Portable JSON
ctx migrate <thread-id> --from=codex --to=cursor --format=json --out=./

# Batch migrate all threads
ctx migrate --all --from=codex --to=cursor --out=./context/
```

## Common flags

| Flag | Description | Default |
|------|-------------|---------|
| `--provider=<id>` | Input provider for `list` / `read` | `codex` (from config) |
| `--from=<id>` | Input provider for `export` / `migrate` | `codex` |
| `--to=<id>` | Output provider for `migrate` | `cursor` |
| `--format=<fmt>` | `agents-md`, `markdown`, or `json` | `agents-md` |
| `--out=<path>` | Output file or directory | `.` |
| `--json` | Print machine-readable JSON | off |
| `--all` | Migrate all threads (batch) | off |

Defaults come from `~/.ctx/config.json` after running `ctx setup`. CLI flags always override config.

## Typical workflows

### Continue work in Cursor

```sh
ctx list
ctx migrate <id> --format=agents-md --out=./
# Rename or copy AGENTS-<id>.md → AGENTS.md in your project
```

### Archive all Codex conversations

```sh
ctx migrate --all --format=markdown --out=./archive/
```

### Export for a custom tool

```sh
ctx export <id> --out=./thread.json
# Feed thread.json into your own pipeline
```
