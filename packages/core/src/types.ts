import { z } from "zod";

// ---------------------------------------------------------------------------
// Canonical turn item types — each discriminated by `type`
// ---------------------------------------------------------------------------

export const TextItemSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

export const ReasoningItemSchema = z.object({
  type: z.literal("reasoning"),
  text: z.string(),
});

export const FileChangeItemSchema = z.object({
  type: z.literal("file_change"),
  path: z.string(),
  diff: z.string().optional(),
  changeKind: z.string().optional(),
});

export const CommandItemSchema = z.object({
  type: z.literal("command"),
  command: z.string(),
  cwd: z.string().optional(),
  output: z.string().optional(),
  exitCode: z.number().int().nullable().optional(),
  status: z.string().optional(),
});

export const ToolCallItemSchema = z.object({
  type: z.literal("tool_call"),
  tool: z.string(),
  input: z.unknown(),
  output: z.unknown().optional(),
  status: z.string().optional(),
});

export const WebSearchItemSchema = z.object({
  type: z.literal("web_search"),
  query: z.string(),
});

export const ImageItemSchema = z.object({
  type: z.literal("image"),
  url: z.string(),
});

export const TodoListItemSchema = z.object({
  type: z.literal("todo_list"),
  explanation: z.string().nullable().optional(),
  steps: z.array(
    z.object({
      step: z.string(),
      status: z.string(),
    })
  ),
});

export const TurnItemSchema = z.discriminatedUnion("type", [
  TextItemSchema,
  ReasoningItemSchema,
  FileChangeItemSchema,
  CommandItemSchema,
  ToolCallItemSchema,
  WebSearchItemSchema,
  ImageItemSchema,
  TodoListItemSchema,
]);

export type TurnItem = z.infer<typeof TurnItemSchema>;
export type TextItem = z.infer<typeof TextItemSchema>;
export type ReasoningItem = z.infer<typeof ReasoningItemSchema>;
export type FileChangeItem = z.infer<typeof FileChangeItemSchema>;
export type CommandItem = z.infer<typeof CommandItemSchema>;
export type ToolCallItem = z.infer<typeof ToolCallItemSchema>;
export type WebSearchItem = z.infer<typeof WebSearchItemSchema>;
export type ImageItem = z.infer<typeof ImageItemSchema>;
export type TodoListItem = z.infer<typeof TodoListItemSchema>;

// ---------------------------------------------------------------------------
// Turn
// ---------------------------------------------------------------------------

export const TurnSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  items: z.array(TurnItemSchema),
  status: z.enum(["completed", "interrupted", "failed", "in_progress"]).optional(),
  model: z.string().optional(),
});

export type Turn = z.infer<typeof TurnSchema>;

// ---------------------------------------------------------------------------
// Thread — the canonical portable representation of a conversation
// ---------------------------------------------------------------------------

export const ThreadSchema = z.object({
  id: z.string(),
  /** Originating provider identifier, e.g. "codex" */
  provider: z.string(),
  title: z.string().optional(),
  cwd: z.string().optional(),
  model: z.string().optional(),
  createdAt: z.number().int().optional(),
  updatedAt: z.number().int().optional(),
  turns: z.array(TurnSchema),
});

export type Thread = z.infer<typeof ThreadSchema>;

// ---------------------------------------------------------------------------
// ThreadSummary — lightweight listing entry
// ---------------------------------------------------------------------------

export const ThreadSummarySchema = z.object({
  id: z.string(),
  provider: z.string(),
  title: z.string().optional(),
  preview: z.string().optional(),
  cwd: z.string().optional(),
  model: z.string().optional(),
  createdAt: z.number().int().optional(),
  updatedAt: z.number().int().optional(),
});

export type ThreadSummary = z.infer<typeof ThreadSummarySchema>;
