# Output formats

`ctx migrate` can produce five output formats via `--format`.

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

## `handoff`

**File:** `HANDOFF-<thread-id>.md`

**Best for:** Structured session handoffs between agents or humans — what was done, what's next, and what's blocking.

**Contains:**

- **Objective** — current task (last substantive user request)
- **Done** — completed plan steps and files changed
- **Next** — pending todos, or inferred from the last assistant message
- **Blockers** — failed commands and open questions

```sh
ctx migrate <id> --format=handoff --out=./
mv HANDOFF-<id>.md HANDOFF.md   # optional rename for the next session
```

## `cursor-rules`

**Files:** `.mdc` rule files in the output directory (default names: `ctx-task.mdc`, `ctx-state.mdc`, `ctx-files.mdc`, `ctx-commands.mdc`, `ctx-plan.mdc`)

**Best for:** Injecting compact migrated context directly into Cursor via `.cursor/rules/`.

Each file uses YAML frontmatter (`description`, `alwaysApply: false`) so Cursor applies rules intelligently when relevant — per [Cursor rules best practices](https://cursor.com/docs/rules) (keep rules focused; official guidance is ~500 lines per rule, not a hard char cap). ctx uses an internal ~2 500 char/file budget to avoid bloating context. Large sections split into numbered parts (e.g. `ctx-files-2.mdc`). Invoke with `@ctx-task` in chat if needed.

```sh
ctx migrate <id> --format=cursor-rules --out=./.cursor/rules/
```

Use `--full` for unfiltered sections (may produce more split files). The `cursorRulesBudget` option in the provider API defaults to 2 500 chars per file.

## Which format should I use?

| Goal | Format |
|------|--------|
| Hand off to Cursor and continue coding | `agents-md` |
| Structured handoff (done / next / blockers) | `handoff` |
| Cursor rules in `.cursor/rules/` | `cursor-rules` |
| Read / search / archive conversations | `markdown` |
| Build your own tool on top | `json` |
