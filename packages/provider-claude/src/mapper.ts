import type { Thread, ThreadSummary, Turn, TurnItem } from "@ctx/core";
import type { ClaudeRecord } from "./schema.ts";
import { parseTimestamp } from "./schema.ts";
import type { SessionFile } from "./scanner.ts";

let turnCounter = 0;
function nextTurnId(): string {
  return `turn-${++turnCounter}`;
}

export function mapSessionToThread(
  session: SessionFile,
  records: ClaudeRecord[]
): Thread {
  turnCounter = 0;

  let cwd: string | undefined;
  let model: string | undefined;
  let createdAt: number | undefined;
  let updatedAt: number | undefined;
  const turns: Turn[] = [];

  for (const record of records) {
    const ts = parseTimestamp(record.timestamp);

    if (record.type === "system" && record.subtype === "init") {
      if (typeof record.cwd === "string") cwd = record.cwd;
      model = (record["model"] as string | undefined) ?? model;
      if (ts !== undefined && createdAt === undefined) createdAt = ts;
      continue;
    }

    if (record.type === "user") {
      const turn = mapUserRecord(record);
      if (turn) {
        turns.push(turn);
        if (ts !== undefined) updatedAt = ts;
      }
      continue;
    }

    if (record.type === "assistant") {
      const turn = mapAssistantRecord(record);
      if (turn) {
        turns.push(turn);
        if (ts !== undefined) updatedAt = ts;
        if (!model && record.message?.model) model = record.message.model;
      }
      continue;
    }
  }

  if (!cwd) {
    const withCwd = records.find((r) => typeof r.cwd === "string");
    cwd = withCwd?.cwd;
  }

  const title = extractTitle(turns);

  return {
    id: session.id,
    provider: "claude",
    title,
    cwd,
    model,
    createdAt,
    updatedAt: updatedAt ?? session.mtimeMs,
    turns,
  };
}

export function mapSessionToSummary(
  session: SessionFile,
  records: ClaudeRecord[]
): ThreadSummary {
  const thread = mapSessionToThread(session, records);
  return {
    id: thread.id,
    provider: "claude",
    title: thread.title,
    preview: extractPreview(thread),
    cwd: thread.cwd,
    model: thread.model,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
  };
}

function mapUserRecord(record: ClaudeRecord): Turn | null {
  const items = mapMessageContent(record.message?.content, "user");
  if (items.length === 0) return null;

  return {
    id: record.uuid ?? nextTurnId(),
    role: "user",
    items,
  };
}

function mapAssistantRecord(record: ClaudeRecord): Turn | null {
  const items = mapMessageContent(record.message?.content, "assistant");
  if (items.length === 0) return null;

  return {
    id: record.uuid ?? nextTurnId(),
    role: "assistant",
    items,
    model: record.message?.model,
  };
}

function mapMessageContent(
  content: unknown,
  role: "user" | "assistant"
): TurnItem[] {
  if (typeof content === "string") {
    const text = cleanUserText(content);
    return text ? [{ type: "text", text }] : [];
  }

  if (!Array.isArray(content)) return [];

  const items: TurnItem[] = [];

  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const b = block as Record<string, unknown>;
    const type = b["type"];

    if (type === "text" && typeof b["text"] === "string") {
      const text = role === "user" ? cleanUserText(b["text"]) : b["text"];
      if (text) items.push({ type: "text", text });
      continue;
    }

    if (type === "thinking" && typeof b["thinking"] === "string") {
      items.push({ type: "reasoning", text: b["thinking"] });
      continue;
    }

    if (type === "tool_use") {
      items.push({
        type: "tool_call",
        tool: typeof b["name"] === "string" ? b["name"] : "tool_use",
        input: b["input"],
        status: "completed",
      });
      continue;
    }

    if (type === "tool_result") {
      const output = formatToolResult(b["content"]);
      items.push({
        type: "tool_call",
        tool: "tool_result",
        input: { tool_use_id: b["tool_use_id"] },
        output,
      });
      continue;
    }

    if (type === "image" && typeof b["source"] === "object") {
      const source = b["source"] as Record<string, unknown>;
      if (typeof source["url"] === "string") {
        items.push({ type: "image", url: source["url"] });
      }
    }
  }

  return items;
}

function formatToolResult(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (part && typeof part === "object" && typeof (part as Record<string, unknown>)["text"] === "string") {
          return (part as Record<string, unknown>)["text"] as string;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return JSON.stringify(content);
}

function cleanUserText(text: string): string {
  // Only strip IDE-injected wrappers when present (Cursor/Codex IDE plugins)
  if (!/<user_query>|<timestamp>/i.test(text)) return text.trim();
  return text
    .replace(/<timestamp>[\s\S]*?<\/timestamp>\s*/g, "")
    .replace(/<\/?user_query>/g, "")
    .trim();
}

function extractTitle(turns: Turn[]): string | undefined {
  for (const turn of turns) {
    if (turn.role !== "user") continue;
    for (const item of turn.items) {
      if (item.type === "text" && item.text.trim()) {
        const line = item.text.split("\n").find((l) => l.trim()) ?? item.text;
        return truncate(line.trim(), 80);
      }
    }
  }
  return undefined;
}

function extractPreview(thread: Thread): string | undefined {
  return thread.title ?? undefined;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}
