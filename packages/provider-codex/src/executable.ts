import { existsSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";

interface ExecutableCandidate {
  path: string;
  modifiedAtMs: number;
}

/**
 * Resolves the path to the `codex` CLI executable.
 *
 * Resolution order:
 *  1. CODEX_CLI_PATH environment variable
 *  2. Windows: %LOCALAPPDATA%\OpenAI\Codex\bin\codex.exe (newest version wins)
 *  3. macOS: /Applications/Codex.app/Contents/Resources/codex
 *  4. Fallback: "codex" (assumes it is on PATH)
 */
export function resolveCodexExecutablePath(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
  platform: NodeJS.Platform = process.platform
): string {
  const explicit = env["CODEX_CLI_PATH"];
  if (explicit) {
    return explicit;
  }

  if (platform === "win32") {
    const resolved = resolveWindowsPath(env);
    if (resolved) return resolved;
  }

  const macos = "/Applications/Codex.app/Contents/Resources/codex";
  if (existsSync(macos)) {
    return macos;
  }

  return "codex";
}

function resolveWindowsPath(env: Record<string, string | undefined>): string | null {
  const localAppData = env["LOCALAPPDATA"];
  if (!localAppData) return null;

  const binRoot = join(localAppData, "OpenAI", "Codex", "bin");
  const candidates: ExecutableCandidate[] = [];

  addCandidate(join(binRoot, "codex.exe"), candidates);

  if (existsSync(binRoot)) {
    try {
      for (const entry of readdirSync(binRoot, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          addCandidate(join(binRoot, entry.name, "codex.exe"), candidates);
        }
      }
    } catch {
      // ignore readdirSync errors
    }
  }

  candidates.sort(
    (a, b) => b.modifiedAtMs - a.modifiedAtMs || a.path.localeCompare(b.path)
  );

  return candidates[0]?.path ?? null;
}

function addCandidate(path: string, candidates: ExecutableCandidate[]): void {
  try {
    const stats = statSync(path);
    if (stats.isFile()) {
      candidates.push({ path, modifiedAtMs: stats.mtimeMs });
    }
  } catch {
    // file does not exist or is inaccessible
  }
}
