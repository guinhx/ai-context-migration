# Architecture

## Overview

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│ Input       │     │ @ctx/core    │     │ Output      │
│ Provider    │────▶│ Canonical    │────▶│ Provider    │
│ (e.g. Codex)│     │ Thread       │     │ (e.g. Cursor)│
└─────────────┘     └──────────────┘     └─────────────┘
       ▲                    ▲                    ▲
       │                    │                    │
       └────────────────────┴────────────────────┘
                    @ctx/cli
```

## Monorepo layout

```
ai-context-migration/
├── packages/
│   ├── core/                 @ctx/core
│   │   ├── types.ts          Canonical Thread, Turn, TurnItem
│   │   ├── provider.ts       InputProvider / OutputProvider interfaces
│   │   └── registry.ts       Provider registry
│   ├── cli/                  @ctx/cli  (bin: ctx)
│   │   ├── index.ts          Entry point + command router
│   │   ├── config.ts         ~/.ctx/config.json
│   │   ├── prompt.ts         Interactive setup prompts
│   │   └── commands/         list, read, export, migrate, setup
│   ├── provider-codex/       @ctx/provider-codex
│   │   ├── transport.ts      Bun.spawn + JSON-RPC 2.0 over stdio
│   │   ├── client.ts         thread/list, thread/read
│   │   └── mapper.ts         Codex → canonical
│   └── provider-cursor/      @ctx/provider-cursor
│       ├── agents-md.ts      AGENTS.md generator
│       └── markdown.ts       Full conversation formatter
└── docs/
```

## Data flow

1. **Input provider** connects to the source AI (Codex spawns `codex app-server`)
2. Raw thread data is validated and mapped to the **canonical format**
3. **Output provider** transforms the canonical thread into the target format
4. Files are written with `Bun.write()`

## Canonical thread model

All providers speak a common intermediate format:

```
Thread
├── id, provider, title, cwd, model, timestamps
└── turns[]
    ├── role: "user" | "assistant"
    └── items[]  (discriminated union)
        ├── text
        ├── reasoning
        ├── file_change
        ├── command
        ├── tool_call
        ├── web_search
        ├── image
        └── todo_list
```

This decouples source and target formats — add a new AI by implementing one side of the mapping.

## Codex protocol

Codex communication uses **JSON-RPC 2.0 over stdio** (not gRPC):

- Spawn: `codex app-server`
- Handshake: `initialize` → `initialized`
- Read threads: `thread/list`, `thread/read`

Inspired by the Codex `app-server` JSON-RPC protocol used by tools like farfield.

## Bun-native APIs

| Feature | API |
|---------|-----|
| Subprocess | `Bun.spawn()` |
| File read | `Bun.file().json()` |
| File write | `Bun.write()` |
| UUID | `crypto.randomUUID()` |
| TypeScript | Built-in, no compile step for dev |
