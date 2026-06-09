# Output formats

`ctx migrate` can produce three output formats via `--format`.

## `agents-md` (default)

**File:** `AGENTS-<thread-id>.md`

**Best for:** Continuing work in Cursor or any tool that reads `AGENTS.md` context files.

**Contains:**

- Project context and original user request
- Files changed (with optional diffs)
- Commands executed (with output snippets)
- Key reasoning and decisions
- Todo / plan status
- Last assistant message (current state)

**Usage in Cursor:**

```sh
ctx migrate <id> --format=agents-md --out=./
mv AGENTS-<id>.md AGENTS.md   # or place in .cursor/
```

## `markdown`

**File:** `thread-<thread-id>.md`

**Best for:** Human-readable archives, sharing conversations, or attaching as chat context manually.

**Contains:** Full conversation with USER / ASSISTANT sections, collapsible diffs, command blocks, and tool call details.

```sh
ctx migrate <id> --format=markdown --out=./docs/
```

## `json`

**File:** `thread-<thread-id>.json`

**Best for:** Building custom integrations, scripting, or feeding into another migration pipeline.

Uses the canonical thread schema from `@ctx/core`:

```json
{
  "id": "...",
  "provider": "codex",
  "title": "...",
  "turns": [
    {
      "id": "...",
      "role": "user",
      "items": [{ "type": "text", "text": "..." }]
    }
  ]
}
```

```sh
ctx migrate <id> --format=json --out=./
# or use ctx export for the same canonical JSON
ctx export <id> --out=./thread.json
```

## Which format should I use?

| Goal | Format |
|------|--------|
| Hand off to Cursor and continue coding | `agents-md` |
| Read / search / archive conversations | `markdown` |
| Build your own tool on top | `json` |
