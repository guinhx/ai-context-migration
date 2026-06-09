import { z } from "zod";
import type { AppServerTransport } from "./transport.ts";

// ---------------------------------------------------------------------------
// Zod schemas for Codex app-server responses
// ---------------------------------------------------------------------------

const ThreadSummarySchema = z
  .object({
    id: z.string().min(1),
    preview: z.union([z.string(), z.null()]).optional(),
    name: z.union([z.string(), z.null()]).optional(),
    cwd: z.union([z.string(), z.null()]).optional(),
    createdAt: z.number().optional(),
    updatedAt: z.number().optional(),
    latestModel: z.union([z.string(), z.null()]).optional(),
    modelProvider: z.union([z.string(), z.null()]).optional(),
    // status can be a string ("idle") or an object ({ type: "idle" }) depending on Codex version
    status: z.unknown().optional(),
  })
  .passthrough();

export type CodexThreadSummary = z.infer<typeof ThreadSummarySchema>;

const ListThreadsResponseSchema = z
  .object({
    data: z.array(ThreadSummarySchema),
    nextCursor: z.union([z.string(), z.null()]).optional(),
    pages: z.number().optional(),
    truncated: z.boolean().optional(),
  })
  .passthrough();

export type CodexListThreadsResponse = z.infer<typeof ListThreadsResponseSchema>;

// Reusable "any value" schema
const JsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(JsonValueSchema),
  ])
);

// Turn item — kept intentionally loose; detailed parsing happens in the mapper
const TurnItemRawSchema = z
  .object({
    id: z.string().optional(),
    type: z.string(),
  })
  .passthrough();

const TurnRawSchema = z
  .object({
    turnId: z.string().optional(),
    id: z.string().optional(),
    status: z.unknown().optional(),
    items: z.array(TurnItemRawSchema).optional(),
    params: z.record(JsonValueSchema).optional(),
  })
  .passthrough();

const ThreadRawSchema = z
  .object({
    id: z.string().min(1),
    turns: z.array(TurnRawSchema).optional(),
    title: z.union([z.string(), z.null()]).optional(),
    cwd: z.union([z.string(), z.null()]).optional(),
    latestModel: z.union([z.string(), z.null()]).optional(),
    createdAt: z.number().optional(),
    updatedAt: z.number().optional(),
    status: z.unknown().optional(),
  })
  .passthrough();

export type CodexThread = z.infer<typeof ThreadRawSchema>;
export type CodexTurnRaw = z.infer<typeof TurnRawSchema>;
export type CodexTurnItemRaw = z.infer<typeof TurnItemRawSchema>;

const ReadThreadResponseSchema = z
  .object({ thread: ThreadRawSchema })
  .passthrough();

export type CodexReadThreadResponse = z.infer<typeof ReadThreadResponseSchema>;

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface ListThreadsOptions {
  limit?: number;
  archived?: boolean;
  cursor?: string | null;
  sortKey?: "created_at" | "updated_at";
}

// ---------------------------------------------------------------------------
// AppServerClient
// ---------------------------------------------------------------------------

const THREAD_LIST_TIMEOUT_MS = 25_000;
const THREAD_READ_TIMEOUT_MS = 60_000;

function parse<T>(schema: z.ZodType<T>, value: unknown, ctx: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error(
      `Validation error (${ctx}): ${result.error.message}`
    );
  }
  return result.data;
}

export class AppServerClient {
  constructor(private readonly transport: AppServerTransport) {}

  async listThreads(opts: ListThreadsOptions = {}): Promise<CodexListThreadsResponse> {
    const result = await this.transport.request(
      "thread/list",
      {
        limit: opts.limit ?? 50,
        archived: opts.archived ?? false,
        cursor: opts.cursor ?? null,
        sortKey: opts.sortKey ?? "updated_at",
      },
      THREAD_LIST_TIMEOUT_MS
    );
    return parse(ListThreadsResponseSchema, result, "thread/list");
  }

  async listThreadsAll(
    opts: ListThreadsOptions & { maxPages?: number } = {}
  ): Promise<CodexListThreadsResponse> {
    const items: CodexThreadSummary[] = [];
    let cursor: string | null | undefined = opts.cursor;
    let pages = 0;
    const maxPages = opts.maxPages ?? 20;

    while (pages < maxPages) {
      const page = await this.listThreads({ ...opts, cursor: cursor ?? undefined });
      items.push(...page.data);
      pages += 1;

      const next = page.nextCursor ?? null;
      if (!next || page.data.length === 0) {
        return { data: items, nextCursor: null, pages, truncated: false };
      }
      cursor = next;
    }

    return { data: items, nextCursor: cursor ?? null, pages, truncated: true };
  }

  async readThread(threadId: string, includeTurns = true): Promise<CodexReadThreadResponse> {
    const result = await this.transport.request(
      "thread/read",
      { threadId, includeTurns },
      THREAD_READ_TIMEOUT_MS
    );
    return parse(ReadThreadResponseSchema, result, "thread/read");
  }

  async resumeThread(threadId: string): Promise<CodexReadThreadResponse> {
    const result = await this.transport.request(
      "thread/resume",
      { threadId, persistExtendedHistory: true },
      THREAD_READ_TIMEOUT_MS
    );
    return parse(ReadThreadResponseSchema, result, "thread/resume");
  }

  async close(): Promise<void> {
    await this.transport.close();
  }
}
