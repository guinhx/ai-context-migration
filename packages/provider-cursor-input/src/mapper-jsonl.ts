import type { Thread, Turn, TurnItem } from "@ctx/core";
import type { CursorJsonlRecord } from "./schema.ts";
import { parseJsonlRecord } from "./schema.ts";
import type { TranscriptFile } from "./jsonl-scanner.ts";
import { normalizeCursorTool } from "./normalize-tool.ts";

let turnCounter = 0;
function nextTurnId(): string {
  return `turn-${++turnCounter}`;
}

export function mapJsonlToThread(
  file: TranscriptFile,
  rawRecords: unknown[]
): Thread {
  turnCounter = 0;

  const records = rawRecords
    .map(parseJsonlRecord)
    .filter((r): r is CursorJsonlRecord => r !== null && r.role !== "system");

  const turns = aggregateTurns(records);

  return {
    id: file.id,
    provider: "cursor",
    title: extractTitle(turns),
    cwd: undefined,
    createdAt: undefined,
    updatedAt: Math.floor(file.mtimeMs),
    turns,
  };
}

/**
 * Merge consecutive lines with the same role into one turn (Cursor JSONL convention).
 */
function aggregateTurns(records: CursorJsonlRecord[]): Turn[] {
  const turns: Turn[] = [];
  let currentRole: "user" | "assistant" | null = null;
  let currentItems: TurnItem[] = [];

  const flush = () => {
    if (currentRole && currentItems.length > 0) {
      turns.push({ id: nextTurnId(), role: currentRole, items: currentItems });
    }
    currentItems = [];
    currentRole = null;
  };

  for (const record of records) {
    const role = record.role === "user" ? "user" : "assistant";
    const items = mapJsonlItems(record);

    if (items.length === 0) continue;

    if (currentRole !== role) {
      flush();
      currentRole = role;
    }

    currentItems.push(...items);
  }

  flush();
  return turns;
}

function mapJsonlItems(record: CursorJsonlRecord): TurnItem[] {
  const content = record.message?.content;
  if (!Array.isArray(content)) return [];

  const items: TurnItem[] = [];

  for (const block of content) {
    const b = block as Record<string, unknown>;
    const type = b["type"];

    if (type === "text" && typeof b["text"] === "string") {
      const text =
        record.role === "user" ? cleanUserText(b["text"]) : b["text"];
      if (text) items.push({ type: "text", text });
      continue;
    }

    if (type === "tool_use" || type === "tool-call") {
      const toolName = typeof b["name"] === "string" ? b["name"] : "tool";
      const input = b["input"] ?? b["arguments"];
      items.push(
        ...normalizeCursorTool(toolName, input, undefined, "completed")
      );
      continue;
    }

    // tool_result blocks are usually absent from JSONL per Cursor staff; skip fake tool_call
    if (type === "tool_result") continue;
  }

  return items;
}

function cleanUserText(text: string): string {
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
        return line.length > 80 ? line.slice(0, 79) + "…" : line.trim();
      }
    }
  }
  return undefined;
}

export { extractTitle };
