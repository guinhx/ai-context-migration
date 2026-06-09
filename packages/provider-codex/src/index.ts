import type { InputProvider, ListOptions, Thread, ThreadSummary } from "@ctx/core";
import { resolveCodexExecutablePath } from "./executable.ts";
import { AppServerTransport } from "./transport.ts";
import { AppServerClient } from "./client.ts";
import { mapThread, mapThreadSummary } from "./mapper.ts";

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface CodexProviderOptions {
  /** Override the codex executable path (defaults to auto-detection) */
  executablePath?: string;
  /** Working directory for the codex process */
  cwd?: string;
  /** Extra environment variables to pass to codex */
  env?: Record<string, string>;
  /** Enable codex experimental API */
  experimentalApi?: boolean;
  /** Log stderr output from codex */
  onStderr?: (line: string) => void;
}

// ---------------------------------------------------------------------------
// CodexProvider
// ---------------------------------------------------------------------------

export class CodexProvider implements InputProvider {
  readonly id = "codex";
  readonly name = "OpenAI Codex";

  private readonly transport: AppServerTransport;
  private readonly client: AppServerClient;

  constructor(opts: CodexProviderOptions = {}) {
    const executablePath =
      opts.executablePath ?? resolveCodexExecutablePath();

    this.transport = new AppServerTransport({
      executablePath,
      cwd: opts.cwd,
      env: opts.env,
      experimentalApi: opts.experimentalApi ?? false,
      onStderr: opts.onStderr,
    });

    this.client = new AppServerClient(this.transport);
  }

  async listThreads(opts: ListOptions = {}): Promise<ThreadSummary[]> {
    const response = await this.client.listThreadsAll({
      limit: opts.limit ?? 50,
      archived: opts.archived ?? false,
      cursor: opts.cursor,
      sortKey: opts.sortKey,
      maxPages: opts.maxPages ?? 20,
    });

    return response.data.map((raw) =>
      mapThreadSummary(raw as Parameters<typeof mapThreadSummary>[0])
    );
  }

  async readThread(id: string): Promise<Thread> {
    let response = await this.client.readThread(id, true);

    // If thread is not loaded (no turns), resume it first
    if (!response.thread.turns || response.thread.turns.length === 0) {
      try {
        response = await this.client.resumeThread(id);
        // Re-read after resume to get full turns
        response = await this.client.readThread(id, true);
      } catch {
        // If resume fails, use what we have
      }
    }

    return mapThread(response.thread);
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}

export { resolveCodexExecutablePath } from "./executable.ts";
export { AppServerTransport } from "./transport.ts";
export { AppServerClient } from "./client.ts";
export { mapThread, mapThreadSummary } from "./mapper.ts";
