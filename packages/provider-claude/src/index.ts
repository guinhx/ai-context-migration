import type { InputProvider, ListOptions, Thread, ThreadSummary } from "@ctx/core";
import { resolveClaudeProjectsDirs } from "./paths.ts";
import {
  findSessionFile,
  readJsonlLines,
  walkJsonlFiles,
  type SessionFile,
} from "./scanner.ts";
import { mapSessionToSummary, mapSessionToThread } from "./mapper.ts";
import { parseClaudeRecord } from "./schema.ts";

export interface ClaudeProviderOptions {
  /** Override Claude projects directory (defaults to ~/.claude/projects) */
  projectsDir?: string;
}

export class ClaudeProvider implements InputProvider {
  readonly id = "claude";
  readonly name = "Claude Code (experimental)";

  private readonly rootDirs: string[];

  constructor(opts: ClaudeProviderOptions = {}) {
    this.rootDirs = opts.projectsDir
      ? [opts.projectsDir]
      : resolveClaudeProjectsDirs();
  }

  async listThreads(opts: ListOptions = {}): Promise<ThreadSummary[]> {
    const limit = opts.limit ?? 50;
    const files = await walkJsonlFiles(this.rootDirs);
    files.sort((a, b) => b.mtimeMs - a.mtimeMs);

    const summaries: ThreadSummary[] = [];

    for (const file of files.slice(0, limit)) {
      try {
        summaries.push(await this.loadSummary(file));
      } catch {
        summaries.push({
          id: file.id,
          provider: "claude",
          updatedAt: Math.floor(file.mtimeMs),
        });
      }
    }

    return summaries;
  }

  async readThread(id: string): Promise<Thread> {
    const file = await findSessionFile(this.rootDirs, id);
    if (!file) {
      throw new Error(`Claude session not found: ${id}`);
    }

    const records = await this.loadRecords(file);
    return mapSessionToThread(file, records);
  }

  async close(): Promise<void> {
    // file-based provider — nothing to release
  }

  private async loadRecords(file: SessionFile) {
    const raw = await readJsonlLines(file.path);
    return raw
      .map(parseClaudeRecord)
      .filter((r): r is NonNullable<typeof r> => r !== null);
  }

  private async loadSummary(file: SessionFile): Promise<ThreadSummary> {
    const records = await this.loadRecords(file);
    return mapSessionToSummary(file, records);
  }
}

export { encodeProjectPath, resolveClaudeProjectsDirs } from "./paths.ts";
export { mapSessionToThread, mapSessionToSummary } from "./mapper.ts";
