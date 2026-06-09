# Contributing

Thank you for helping improve **ctx**! This project is early-stage and contributions of all sizes are welcome.

## Ways to contribute

- Report bugs with reproducible steps
- Suggest new providers (Claude Code, ChatGPT, etc.)
- Improve documentation
- Fix schema compatibility with new Codex versions
- Add tests for mappers and formatters

## Development setup

```sh
git clone https://github.com/guinhx/ai-context-migration.git
cd ai-context-migration
bun install
bun run link          # optional: global ctx command
```

## Project structure

| Package | Purpose |
|---------|---------|
| `@ctx/core` | Canonical types, provider interfaces, registry |
| `@ctx/cli` | CLI entry point and commands |
| `@ctx/provider-codex` | Codex input provider |
| `@ctx/provider-cursor` | Cursor output provider |

See [Architecture](architecture.md) for the full picture.

## Workflow

1. **Fork** the repository
2. **Create a branch** from `main`:
   ```sh
   git checkout -b fix/codex-status-schema
   ```
3. **Make changes** — keep PRs focused and small when possible
4. **Verify**:
   ```sh
   bun run typecheck
   bun test
   ```
5. **Commit** with a clear message:
   ```
   fix(codex): accept null thread names in list response
   ```
6. **Open a PR** against `main` with:
   - What changed
   - Why it was needed
   - How you tested it

## Code style

- TypeScript strict mode
- Prefer Bun-native APIs (`Bun.file`, `Bun.spawn`, `Bun.write`) over Node.js equivalents when available
- Use `zod` for runtime validation of external API responses
- Keep provider logic isolated in `packages/provider-*`
- No unnecessary abstractions — match existing patterns

## Adding a provider

See the detailed guide in [Providers](providers.md).

Minimum checklist for a new provider PR:

- [ ] New package under `packages/provider-<name>/`
- [ ] Implements `InputProvider` or `OutputProvider`
- [ ] Registered in `packages/cli/src/index.ts`
- [ ] Documented in `docs/providers.md`
- [ ] Works with `ctx setup` or documented flags

## Reporting bugs

Use the [bug report template](../.github/ISSUE_TEMPLATE/bug_report.yml). Include:

- OS and Bun version (`bun --version`)
- Codex path / version (if relevant)
- Exact command that failed
- Full error output

## Feature requests

Use the [feature request template](../.github/ISSUE_TEMPLATE/feature_request.yml). Describe the use case — especially which AI tool you'd migrate from/to.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](../LICENSE).
