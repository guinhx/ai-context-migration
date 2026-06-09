# Contributing

Thanks for your interest in contributing to **ctx**!

Please read the full guide before opening a PR:

- [Contributing guide](docs/contributing.md)
- [Architecture overview](docs/architecture.md)
- [Adding a provider](docs/providers.md)

## Quick start for contributors

```sh
git clone https://github.com/guinhx/ai-context-migration.git
cd ai-context-migration
bun install
bun run link          # optional: global `ctx` command
bun run typecheck
bun test
```

## How to report issues

Use the [GitHub issue templates](.github/ISSUE_TEMPLATE/) — they help us reproduce bugs and triage feature requests faster.

## Pull requests

1. Fork the repo and create a branch from `main`
2. Make focused changes with clear commit messages
3. Run `bun run typecheck` (and add tests when relevant)
4. Open a PR describing **what** changed and **why**

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
