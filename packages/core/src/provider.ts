import type { Thread, ThreadSummary } from "./types.ts";

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface ListOptions {
  limit?: number;
  archived?: boolean;
  cursor?: string;
  sortKey?: "created_at" | "updated_at";
  maxPages?: number;
}

export interface WriteOptions {
  /** Destination directory for output files. Defaults to cwd. */
  outDir?: string;
  /** Output format. Defaults to "agents-md". */
  format?: "agents-md" | "markdown" | "json";
  /**
   * agents-md generation mode.
   *   "compact" (default) — smart filtering + size budget; ideal for AI context windows.
   *   "full"              — no filtering, no truncation, all turns/diffs/commands included.
   */
  agentsMdMode?: "compact" | "full";
  /**
   * Custom hard budget in bytes for compact mode.
   * Defaults to 32 000. Ignored in full mode.
   */
  agentsMdBudget?: number;
}

export interface WriteResult {
  /** Absolute paths of all files written */
  files: string[];
}

// ---------------------------------------------------------------------------
// Provider interfaces
// ---------------------------------------------------------------------------

/**
 * An InputProvider can read threads from a specific AI source.
 * Implement this interface to add support for a new AI as a migration source.
 */
export interface InputProvider {
  /** Unique identifier, e.g. "codex" */
  readonly id: string;
  /** Human-readable name */
  readonly name: string;

  /** Returns a paginated list of thread summaries */
  listThreads(opts?: ListOptions): Promise<ThreadSummary[]>;

  /** Returns the full canonical thread, including all turns */
  readThread(id: string): Promise<Thread>;

  /** Release any resources (subprocess, connections, etc.) */
  close(): Promise<void>;
}

/**
 * An OutputProvider can write a canonical thread to a target AI's format.
 * Implement this interface to add support for a new AI as a migration target.
 */
export interface OutputProvider {
  /** Unique identifier, e.g. "cursor" */
  readonly id: string;
  /** Human-readable name */
  readonly name: string;

  /** Converts and writes the canonical thread to the target format */
  write(thread: Thread, opts?: WriteOptions): Promise<WriteResult>;
}
