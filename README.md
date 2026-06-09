# ctx — AI Context Migration CLI

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Bun](https://img.shields.io/badge/runtime-Bun-f9f1e1)](https://bun.sh)

**AI Context Migration — thread history export and handoff between coding agents.**

Read context from one agent (like OpenAI Codex) and export it in a format another agent (like Cursor) can use to continue the work.

> **Not [ai-context-bridge](https://github.com/himanshuskukla/ai-context-bridge)** — that project is a git-hook tool that also ships a `ctx` binary. This repo migrates **conversation threads** to AGENTS.md / Markdown / JSON. Primary command: `ctx`. Alias: `ctx-migrate` (same binary, clearer name on PATH).

```
Codex  →  canonical thread  →  AGENTS.md / Markdown / JSON  →  Cursor
```

## Why ctx?

Switching AI coding agents usually means losing conversation history — project context, decisions, file changes, and where you left off. **ctx** extracts that history and converts it into portable, useful context files.

## Compare

| Tool | Focus | Overlap with ctx |
|------|--------|------------------|
| **ctx** (this repo) | Export/migrate **thread history** → AGENTS.md, Markdown, JSON | — |
| [agent-migrator](https://github.com/softaworks/agent-migrator) | Move agent **config & rules** between IDEs | Complementary — use after ctx for rules/skills |
| [ai-context-bridge](https://github.com/himanshuskukla/ai-context-bridge) | Git-hook **context sync** via `ctx` CLI | Different problem — hooks, not thread export |
| [ai-sync](https://github.com/johnlindquist/ai-sync) | Sync **AGENTS.md / rules** across repos | Complementary — keeps files in sync; ctx creates them from threads |

## Quick start

**Requirements:** [Bun](https://bun.sh) ≥ 1.0 · [OpenAI Codex](https://openai.com/codex) installed (for the Codex provider)

```sh
git clone https://github.com/guinhx/ai-context-migration.git
cd ai-context-migration
bun install
bun run link        # global `ctx` and `ctx-migrate` (dev)
# or: bun run build # standalone binary → dist/ctx
```

```sh
ctx setup                              # first-time wizard
ctx list                               # see your Codex threads
ctx migrate <thread-id> --to=cursor    # export as AGENTS.md
```

Place the generated `AGENTS-<id>.md` in your project as `AGENTS.md` and start a new Cursor chat — the agent picks up where Codex left off.

→ Full walkthrough: [Getting started](docs/getting-started.md)

## Commands

| Command | Description |
|---------|-------------|
| `ctx setup` | Interactive configuration wizard |
| `ctx list` | List threads from an input provider |
| `ctx read <id>` | Display a thread in the terminal |
| `ctx export <id>` | Export canonical JSON |
| `ctx migrate <id>` | Convert thread to another format |
| `ctx migrate --all` | Batch migrate all threads |
| `ctx validate` | Check AGENTS.md commands/paths against the repo |

```sh
ctx migrate <id> --format=agents-md   # Cursor context (default)
ctx migrate <id> --format=markdown    # full conversation log
ctx migrate <id> --format=json        # portable JSON
ctx validate                          # drift-check AGENTS.md vs package.json/Makefile
ctx validate --file=HANDOFF.md
```

→ All options: [Usage guide](docs/usage.md)

## Output formats

| Format | File | Best for |
|--------|------|----------|
| `agents-md` | `AGENTS-<id>.md` | Continue work in Cursor |
| `markdown` | `thread-<id>.md` | Human-readable archive |
| `json` | `thread-<id>.json` | Custom integrations |

→ Details: [Output formats](docs/output-formats.md)

## Documentation

| Guide | |
|-------|---|
| [Getting started](docs/getting-started.md) | 5-minute setup |
| [Installation](docs/installation.md) | Global install, PATH, binary build |
| [Configuration](docs/configuration.md) | Config file and env vars |
| [Architecture](docs/architecture.md) | How it works under the hood |
| [Providers](docs/providers.md) | Add support for new AI tools |
| [Troubleshooting](docs/troubleshooting.md) | Common errors |
| [Contributing](docs/contributing.md) | Development guide |

## Providers

| Role | Provider | Status |
|------|----------|--------|
| Input | OpenAI Codex | ✅ Stable |
| Input | Claude Code | 🧪 Experimental |
| Input | Cursor (JSONL / SQLite) | ✅ Stable |
| Output | Cursor (AGENTS.md / Markdown / JSON) | ✅ |

The provider architecture makes it straightforward to add ChatGPT, Windsurf, and others. See [Providers](docs/providers.md).

## Project structure

```
packages/
├── core/              @ctx/core           — canonical types + interfaces
├── cli/               @ctx/cli            — CLI commands
├── provider-codex/    @ctx/provider-codex — Codex input
├── provider-claude/   @ctx/provider-claude — Claude Code input
├── provider-cursor-input/ @ctx/provider-cursor-input — Cursor input
└── provider-cursor/   @ctx/provider-cursor — Cursor output
```

## Contributing

Contributions are welcome — bug reports, new providers, docs improvements.

1. Read [Contributing](docs/contributing.md)
2. Open an issue using the [templates](.github/ISSUE_TEMPLATE/)
3. Submit a PR

## License

[MIT](LICENSE) © 2026 [guinhx](https://github.com/guinhx)
