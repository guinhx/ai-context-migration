# Installation

## From source (recommended for development)

```sh
git clone https://github.com/guinhx/ai-context-migration.git
cd ai-context-migration
bun install
```

Run without installing globally:

```sh
bun run ctx --help
bun run ctx setup
```

## Global install

### Option A — `bun link` (development)

Best when you're hacking on the CLI or want instant code updates.

```sh
bun run link
```

Bun registers `ctx` in `~/.bun/bin/`. If that directory is in your PATH, you can run `ctx` from anywhere.

Verify:

```sh
ctx --help
```

Unlink:

```sh
bun unlink --cwd packages/cli
```

### Option B — Standalone binary (production)

Compiles a self-contained executable with `bun build --compile`:

```sh
bun run build
```

Output:

| Platform | Path |
|----------|------|
| Windows | `dist/ctx.exe` |
| macOS / Linux | `dist/ctx` |

#### Add to PATH

**Windows (PowerShell)**

```powershell
# Copy to a directory already in PATH
Copy-Item .\dist\ctx.exe "$env:USERPROFILE\AppData\Local\Microsoft\WindowsApps\ctx.exe"

# Or add dist\ permanently
[Environment]::SetEnvironmentVariable(
  "PATH",
  "$env:PATH;D:\path\to\ai-context-migration\dist",
  "User"
)
```

**macOS / Linux**

```sh
sudo cp dist/ctx /usr/local/bin/ctx
chmod +x /usr/local/bin/ctx
```

## Prerequisites

| Requirement | Why |
|-------------|-----|
| [Bun](https://bun.sh) ≥ 1.0 | Runtime and package manager |
| OpenAI Codex | Source provider reads threads via `codex app-server` |

Codex must be installed and authenticated on your machine. The CLI does not manage API keys — auth is handled by the Codex app itself.

## Verify installation

```sh
ctx setup --force   # re-run wizard if needed
ctx list            # should list your Codex threads
```
