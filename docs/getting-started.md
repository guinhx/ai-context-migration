# Getting started

This guide gets you from zero to your first migrated thread in a few minutes.

## What you need

1. **[Bun](https://bun.sh)** ≥ 1.0
2. **[OpenAI Codex](https://openai.com/codex)** installed and logged in (for reading threads)

## 1. Install

```sh
git clone https://github.com/guinhx/ai-context-migration.git
cd ai-context-migration
bun install
```

For a global `ctx` command, pick one:

```sh
# Dev mode — changes reflect immediately (requires Bun)
bun run link

# Standalone binary — no Bun needed at runtime
bun run build
```

See [Installation](installation.md) for PATH setup on Windows/macOS/Linux.

## 2. Run setup

```sh
ctx setup
```

The wizard will:

1. Detect your Codex executable (or let you set the path)
2. Choose your default input provider
3. Pick your default output format (`agents-md` is recommended for Cursor)
4. Optionally test the connection to Codex

Config is saved to `~/.ctx/config.json`.

## 3. List your threads

```sh
ctx list
```

Example output:

```
 ID                                   │ Title              │ Model  │ Updated │ CWD
──────────────────────────────────────┼────────────────────┼────────┼─────────┼─────
 019dbd72-0134-7581-a05d-ab55ed64519b │ Focus API startup  │ openai │ 1h ago  │ ...
```

Copy the thread ID you want to migrate.

## 4. Migrate to Cursor context

```sh
ctx migrate <thread-id> --from=codex --to=cursor --format=agents-md --out=./
```

This creates `AGENTS-<thread-id>.md` in the current directory.

## 5. Use in Cursor

Place the generated file in your project:

- Project root as `AGENTS.md`, or
- `.cursor/AGENTS.md`

Start a new Cursor chat — the agent will pick up the migrated context and can continue where Codex left off.

## Next steps

- [Usage guide](usage.md) — all commands
- [Output formats](output-formats.md) — when to use AGENTS.md vs Markdown vs JSON
- [Troubleshooting](troubleshooting.md) — if something fails
