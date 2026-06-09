import { z } from "zod";

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

const ContentBlockSchema = z
  .object({
    type: z.string(),
  })
  .passthrough();

const MessageSchema = z
  .object({
    role: z.string().optional(),
    content: z.union([z.string(), z.array(ContentBlockSchema)]).optional(),
    model: z.string().optional(),
  })
  .passthrough();

export const ClaudeRecordSchema = z
  .object({
    type: z.string(),
    subtype: z.string().optional(),
    uuid: z.string().optional(),
    sessionId: z.string().optional(),
    cwd: z.string().optional(),
    timestamp: z.union([z.string(), z.number()]).optional(),
    message: MessageSchema.optional(),
    model: z.string().optional(),
    session_id: z.string().optional(),
    isSidechain: z.boolean().optional(),
  })
  .passthrough();

export type ClaudeRecord = z.infer<typeof ClaudeRecordSchema>;

export function parseClaudeRecord(raw: unknown): ClaudeRecord | null {
  const result = ClaudeRecordSchema.safeParse(raw);
  return result.success ? result.data : null;
}

export function parseTimestamp(raw: string | number | undefined): number | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw === "number") {
    return raw < 1e12 ? Math.floor(raw * 1000) : Math.floor(raw);
  }
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? undefined : ms;
}

export { JsonValueSchema };
