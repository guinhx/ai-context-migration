import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Encode a project path the way Claude Code stores it under ~/.claude/projects/.
 * Lossy: Claude maps path separators and several chars to `-` (not reversible).
 * @see https://code.claude.com/docs/en/sessions
 */
export function encodeProjectPath(projectPath: string): string {
  return projectPath
    .replace(/\\/g, "-")
    .replace(/[/:._\s]+/g, "-")
    .replace(/[^a-zA-Z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Resolve Claude Code session directories.
 * Official override: CLAUDE_CONFIG_DIR → $CLAUDE_CONFIG_DIR/projects
 * Extension: CLAUDE_PROJECTS_DIR for direct projects path override.
 */
export function resolveClaudeProjectsDirs(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>
): string[] {
  const dirs: string[] = [];
  const home = homedir();

  if (env["CLAUDE_PROJECTS_DIR"]) {
    dirs.push(env["CLAUDE_PROJECTS_DIR"]);
  }

  const configDir = env["CLAUDE_CONFIG_DIR"] ?? join(home, ".claude");
  dirs.push(join(configDir, "projects"));

  // Legacy fallback when CLAUDE_CONFIG_DIR not set and default path differs
  if (!env["CLAUDE_CONFIG_DIR"]) {
    dirs.push(join(home, ".claude", "projects"));
  }

  return [...new Set(dirs)];
}
