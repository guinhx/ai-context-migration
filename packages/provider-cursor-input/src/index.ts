import type { InputProvider, ListOptions, Thread, ThreadSummary } from "@ctx/core";
import {
  resolveCursorGlobalDbPath,
  resolveCursorProjectsDir,
} from "./paths.ts";
import {
  findTranscriptFile,
  readJsonlLines,
  walkTranscriptFiles,
} from "./jsonl-scanner.ts";
import { mapJsonlToThread } from "./mapper-jsonl.ts";
import {
  listThreadsFromSqlite,
  projectKeyToCwd,
  readThreadFromSqlite,
} from "./sqlite.ts";

export interface CursorInputProviderOptions {
  /** Override ~/.cursor/projects */
  projectsDir?: string;
  /** Override global state.vscdb path */
  globalDbPath?: string;
}

export class CursorInputProvider implements InputProvider {
  readonly id = "cursor";
  readonly name = "Cursor";

  private readonly projectsDir: string;
  private readonly globalDbPath: string | null;

  constructor(opts: CursorInputProviderOptions = {}) {
    this.projectsDir = opts.projectsDir ?? resolveCursorProjectsDir();
    this.globalDbPath = opts.globalDbPath ?? resolveCursorGlobalDbPath();
  }

  async listThreads(opts: ListOptions = {}): Promise<ThreadSummary[]> {
    const limit = opts.limit ?? 50;
    const byId = new Map<string, ThreadSummary>();

    // JSONL transcripts (reliable on disk, includes agent conversations)
    const transcripts = await walkTranscriptFiles(this.projectsDir);
    for (const file of transcripts) {
      try {
        const raw = await readJsonlLines(file.path);
        const thread = mapJsonlToThread(file, raw);
        byId.set(file.id, {
          id: file.id,
          provider: "cursor",
          title: thread.title,
          preview: thread.title,
          cwd: projectKeyToCwd(file.projectKey),
          updatedAt: Math.floor(file.mtimeMs),
        });
      } catch {
        byId.set(file.id, {
          id: file.id,
          provider: "cursor",
          cwd: projectKeyToCwd(file.projectKey),
          updatedAt: Math.floor(file.mtimeMs),
        });
      }
    }

    // SQLite composer headers (richer metadata, may include chats without JSONL yet)
    if (this.globalDbPath) {
      try {
        const metas = listThreadsFromSqlite(this.globalDbPath);
        for (const meta of metas) {
          if (meta.isSubagent) continue;
          const existing = byId.get(meta.id);
          byId.set(meta.id, {
            id: meta.id,
            provider: "cursor",
            title: meta.title ?? existing?.title,
            preview: meta.preview ?? existing?.preview,
            cwd: meta.cwd ?? existing?.cwd,
            createdAt: meta.createdAt ?? existing?.createdAt,
            updatedAt: meta.updatedAt ?? existing?.updatedAt,
          });
        }
      } catch {
        // SQLite unavailable — JSONL-only mode
      }
    }

    const sorted = [...byId.values()].sort(
      (a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
    );

    return sorted.slice(0, limit);
  }

  async readThread(id: string): Promise<Thread> {
    // Prefer SQLite — richer tool outputs (toolFormerData.result) per Cursor storage model
    if (this.globalDbPath) {
      try {
        const thread = readThreadFromSqlite(this.globalDbPath, id);
        await this.enrichFromJsonl(thread, id);
        return thread;
      } catch {
        // fall through to JSONL
      }
    }

    const transcript = await findTranscriptFile(this.projectsDir, id);
    if (transcript) {
      const raw = await readJsonlLines(transcript.path);
      const thread = mapJsonlToThread(transcript, raw);
      thread.cwd = projectKeyToCwd(transcript.projectKey);
      await this.enrichFromSqliteMeta(thread, id);
      return thread;
    }

    throw new Error(`Cursor thread not found: ${id}`);
  }

  private async enrichFromJsonl(thread: Thread, id: string): Promise<void> {
    const transcript = await findTranscriptFile(this.projectsDir, id);
    if (!transcript) return;

    thread.cwd = thread.cwd ?? projectKeyToCwd(transcript.projectKey);
    if (!thread.updatedAt) {
      thread.updatedAt = Math.floor(transcript.mtimeMs);
    }
  }

  private async enrichFromSqliteMeta(thread: Thread, id: string): Promise<void> {
    if (!this.globalDbPath) return;
    try {
      const metas = listThreadsFromSqlite(this.globalDbPath);
      const meta = metas.find((m) => m.id === id);
      if (meta) {
        thread.title = meta.title ?? thread.title;
        thread.cwd = meta.cwd ?? thread.cwd;
        thread.createdAt = meta.createdAt ?? thread.createdAt;
        thread.updatedAt = meta.updatedAt ?? thread.updatedAt;
      }
    } catch {
      // ignore
    }
  }

  async close(): Promise<void> {
    // read-only provider
  }
}

export { resolveCursorGlobalDbPath, resolveCursorProjectsDir } from "./paths.ts";
