# Providers

Providers are the extension points of **ctx**. Each provider implements either reading (input) or writing (output) threads.

## Built-in providers

| ID | Type | Package | Description |
|----|------|---------|-------------|
| `codex` | Input | `@ctx/provider-codex` | Reads threads via Codex `app-server` |
| `claude` | Input | `@ctx/provider-claude` | Reads Claude Code sessions from `~/.claude/projects/**/*.jsonl` **(experimental)** |
| `cursor` | Input | `@ctx/provider-cursor-input` | Reads Cursor agent transcripts (JSONL + SQLite fallback) |
| `cursor` | Output | `@ctx/provider-cursor` | Writes AGENTS.md, Markdown, or JSON |

### Claude Code (experimental)

The `claude` input provider reads local JSONL session files. Anthropic does not publish a stable schema; compaction summaries, subagent sessions, and path encoding may not map fully to the canonical thread format. Prefer `--from=codex` or `--from=cursor` for production handoffs until this provider is marked stable.

## Input provider interface

```typescript
import type { InputProvider, ListOptions, Thread, ThreadSummary } from "@ctx/core";

export class MyProvider implements InputProvider {
  readonly id = "myprovider";
  readonly name = "My AI Tool";

  async listThreads(opts?: ListOptions): Promise<ThreadSummary[]> {
    // Return paginated thread summaries
  }

  async readThread(id: string): Promise<Thread> {
    // Return full canonical thread
  }

  async close(): Promise<void> {
    // Release subprocesses, connections, etc.
  }
}
```

Map source-specific data to the canonical types in `@ctx/core` before returning.

## Output provider interface

```typescript
import type { OutputProvider, Thread, WriteOptions, WriteResult } from "@ctx/core";

export class MyOutputProvider implements OutputProvider {
  readonly id = "myoutput";
  readonly name = "My Target AI";

  async write(thread: Thread, opts?: WriteOptions): Promise<WriteResult> {
    // Transform canonical thread → target format
    // Write files with Bun.write()
    return { files: ["/path/to/output"] };
  }
}
```

## Registering a provider

1. Create a package under `packages/provider-<name>/`
2. Implement the interface
3. Register in `packages/cli/src/index.ts`:

```typescript
import { MyProvider } from "@ctx/provider-myprovider";

registry.registerInput(new MyProvider());
// or
registry.registerOutput(new MyOutputProvider());
```

4. Add the workspace dependency in `packages/cli/package.json`
5. Optionally add to the `ctx setup` wizard provider list

## Canonical types reference

See `packages/core/src/types.ts` for the full `Thread`, `Turn`, and `TurnItem` schemas.

Key design rule: **input providers normalize, output providers denormalize**. The canonical format is the contract between them.

## Ideas for future providers

| Provider | Type | Notes |
|----------|------|-------|
| ChatGPT | Input | Export-based or API |
| Windsurf | Input / Output | Session export |
| Generic JSON | Output | Already supported via `--format=json` |

Contributions welcome — see [Contributing](contributing.md).
