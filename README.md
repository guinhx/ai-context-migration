# ai-context-migration

A Bun-native CLI to migrate AI context and conversation threads between different AI providers — starting with **OpenAI Codex** (input) and **Cursor** (output).

## How It Works

The tool connects to the locally installed Codex CLI via JSON-RPC 2.0 over stdio, reads your conversation threads, converts them to a canonical portable format, and writes them out in formats useful for other AI tools.

```
Codex (JSON-RPC) → Canonical Thread → Cursor (AGENTS.md / Markdown / JSON)
```

The **provider architecture** makes it straightforward to add support for additional AI tools in the future.

## License

MIT — see [LICENSE](LICENSE).

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.0
- [OpenAI Codex](https://openai.com/index/introducing-codex/) desktop app installed (for the Codex provider)

## Installation

```sh
git clone <repo>
cd ai-context-migration
bun install
```

### Global install (use `ctx` from anywhere)

#### Option A — Standalone binary (recommended, no runtime needed)

Compiles everything into a single self-contained executable using `bun build --compile`:

```sh
bun run build
# Creates dist/ctx.exe (Windows) or dist/ctx (Unix)
```

Then add the binary to your PATH:

```powershell
# Windows — copy to a directory already in PATH, e.g.:
Copy-Item .\dist\ctx.exe "$env:USERPROFILE\AppData\Local\Microsoft\WindowsApps\ctx.exe"

# Or add dist\ to your PATH permanently:
$env:PATH += ";D:\Betel\ai-context-migration\dist"
[Environment]::SetEnvironmentVariable("PATH", $env:PATH, "User")
```

```sh
# Unix/macOS
cp dist/ctx /usr/local/bin/ctx
# or
echo 'export PATH="$HOME/path/to/ai-context-migration/dist:$PATH"' >> ~/.bashrc
```

#### Option B — `bun link` (dev mode, requires Bun in PATH)

Links the source directly — any changes to the code take effect immediately.
Bun places the binary in `~/.bun/bin/` which is typically already in your PATH.

```sh
bun run link
# Equivalent to: cd packages/cli && bun link
```

After linking, `ctx` is available globally:

```sh
ctx --help
ctx setup
ctx list
```

To unlink later:

```sh
bun unlink --cwd packages/cli
```

## Usage

```sh
# List all Codex threads
bun ctx list

# List with a limit
bun ctx list --limit=20

# Read and display a thread
bun ctx read <thread-id>

# Export as portable canonical JSON
bun ctx export <thread-id> --from=codex --out=./thread.json

# Migrate to an AGENTS.md file (best for "continue work" use case)
bun ctx migrate <thread-id> --from=codex --to=cursor --format=agents-md --out=./

# Migrate to full conversation Markdown
bun ctx migrate <thread-id> --from=codex --to=cursor --format=markdown --out=./docs/

# Migrate all threads at once
bun ctx migrate --all --from=codex --to=cursor --out=./context/
```

## Output Formats

| Format | File | Best for |
|--------|------|----------|
| `agents-md` | `AGENTS-<id>.md` | Feeding context to Cursor to continue work |
| `markdown` | `thread-<id>.md` | Human-readable conversation log |
| `json` | `thread-<id>.json` | Portable canonical format, import elsewhere |

### AGENTS.md

The `agents-md` format generates a structured context file you can place in your project root or `.cursor/` directory. Cursor will automatically pick it up as context when you start a new chat.

It includes:
- Original request / task description
- All files that were changed (with diffs)
- Commands that were executed
- Key reasoning / decisions
- Todo/plan status
- Last assistant message (current state)

## Environment Variables

Copy [`.env.example`](.env.example) to `.env` if you want local overrides (`.env` is gitignored).

| Variable | Description |
|----------|-------------|
| `CODEX_CLI_PATH` | Override path to the `codex` executable |
| `XDG_CONFIG_HOME` | Base directory for config (default: `~/.ctx/config.json`) |

## What is not committed

The repo ignores build artifacts (`dist/`, compiled `ctx` binaries), dependencies (`node_modules/`), secrets (`.env`), IDE state (`.cursor/`), and migration outputs (`AGENTS-*.md`, `thread-*.md/json`) generated in your working directory.

## Architecture

```
packages/
├── core/              @ctx/core       — Canonical types + provider interfaces
├── cli/               @ctx/cli        — CLI entry point + commands
├── provider-codex/    @ctx/provider-codex  — Codex input provider
└── provider-cursor/   @ctx/provider-cursor — Cursor output provider
```

### Adding a New Provider

**Input provider** (read from a new AI):

```typescript
import type { InputProvider, ListOptions, Thread, ThreadSummary } from "@ctx/core";

export class MyProvider implements InputProvider {
  readonly id = "myprovider";
  readonly name = "My AI Tool";

  async listThreads(opts?: ListOptions): Promise<ThreadSummary[]> { /* ... */ }
  async readThread(id: string): Promise<Thread> { /* ... */ }
  async close(): Promise<void> { /* ... */ }
}
```

**Output provider** (write to a new AI's format):

```typescript
import type { OutputProvider, Thread, WriteOptions, WriteResult } from "@ctx/core";

export class MyOutputProvider implements OutputProvider {
  readonly id = "myoutput";
  readonly name = "My Target AI";

  async write(thread: Thread, opts?: WriteOptions): Promise<WriteResult> { /* ... */ }
}
```

Then register them in `packages/cli/src/index.ts`:

```typescript
registry.registerInput(new MyProvider());
registry.registerOutput(new MyOutputProvider());
```
