import { homedir } from "node:os";
import { join } from "node:path";

export function resolveCursorProjectsDir(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>
): string {
  if (env["CURSOR_PROJECTS_DIR"]) {
    return env["CURSOR_PROJECTS_DIR"];
  }
  return join(homedir(), ".cursor", "projects");
}

export function resolveCursorGlobalDbPath(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>
): string | null {
  if (env["CURSOR_GLOBAL_DB"]) {
    return env["CURSOR_GLOBAL_DB"];
  }

  if (process.platform === "win32") {
    const appData = env["APPDATA"];
    if (appData) return join(appData, "Cursor", "User", "globalStorage", "state.vscdb");
  }

  if (process.platform === "darwin") {
    return join(
      homedir(),
      "Library",
      "Application Support",
      "Cursor",
      "User",
      "globalStorage",
      "state.vscdb"
    );
  }

  const xdgConfig = env["XDG_CONFIG_HOME"] ?? join(homedir(), ".config");
  return join(xdgConfig, "Cursor", "User", "globalStorage", "state.vscdb");
}

/** Decode Cursor project folder name back to a rough path hint */
export function decodeProjectKey(projectKey: string): string | undefined {
  if (/^[a-z]:-/i.test(projectKey)) {
    return projectKey.replace(/^([a-z])-/i, "$1:").replace(/-/g, "\\");
  }
  if (projectKey.startsWith("-")) {
    return projectKey.replace(/-/g, "/");
  }
  return undefined;
}
