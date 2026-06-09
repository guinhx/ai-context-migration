import { z } from "zod";

const ContentBlockSchema = z
  .object({
    type: z.string(),
  })
  .passthrough();

export const CursorJsonlRecordSchema = z
  .object({
    role: z.enum(["user", "assistant", "system"]),
    message: z
      .object({
        content: z.array(ContentBlockSchema).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type CursorJsonlRecord = z.infer<typeof CursorJsonlRecordSchema>;

export const ComposerHeaderSchema = z
  .object({
    composerId: z.string(),
    name: z.string().optional(),
    createdAt: z.number().optional(),
    conversationCheckpointLastUpdatedAt: z.number().optional(),
    lastUpdatedAt: z.number().optional(),
    subtitle: z.string().optional(),
    unifiedMode: z.string().optional(),
    workspaceIdentifier: z
      .object({
        uri: z
          .object({
            fsPath: z.string().optional(),
          })
          .optional(),
      })
      .optional(),
    subagentInfo: z.unknown().optional(),
  })
  .passthrough();

export type ComposerHeader = z.infer<typeof ComposerHeaderSchema>;

export const BubbleSchema = z
  .object({
    type: z.number().optional(),
    text: z.string().optional(),
    rawText: z.string().optional(),
    toolFormerData: z
      .object({
        name: z.string().optional(),
        params: z.string().optional(),
        result: z.string().optional(),
        status: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type Bubble = z.infer<typeof BubbleSchema>;

export function parseJsonlRecord(raw: unknown): CursorJsonlRecord | null {
  const result = CursorJsonlRecordSchema.safeParse(raw);
  return result.success ? result.data : null;
}

export function parseComposerHeader(raw: unknown): ComposerHeader | null {
  const result = ComposerHeaderSchema.safeParse(raw);
  return result.success ? result.data : null;
}

export function parseBubble(raw: unknown): Bubble | null {
  const result = BubbleSchema.safeParse(raw);
  return result.success ? result.data : null;
}
