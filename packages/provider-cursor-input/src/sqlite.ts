import { Database } from "bun:sqlite";
import type { Thread, ThreadSummary, Turn, TurnItem } from "@ctx/core";
import { normalizeCursorTool } from "./normalize-tool.ts";
import { decodeProjectKey } from "./paths.ts";
import { parseBubble, parseComposerHeader, type ComposerHeader } from "./schema.ts";

export interface SqliteThreadMeta {
  id: string;
  title?: string;
  cwd?: string;
  createdAt?: number;
  updatedAt?: number;
  preview?: string;
  isSubagent: boolean;
}

let turnCounter = 0;
function nextTurnId(): string {
  return `turn-${++turnCounter}`;
}

export function listThreadsFromSqlite(dbPath: string): SqliteThreadMeta[] {
  const db = openDb(dbPath);
  try {
    const row = db
      .query("SELECT value FROM ItemTable WHERE key = 'composer.composerHeaders'")
      .get() as { value: string } | null;

    if (!row?.value) return [];

    const parsed = JSON.parse(row.value) as { allComposers?: unknown[] };
    const headers = (parsed.allComposers ?? [])
      .map(parseComposerHeader)
      .filter((h): h is ComposerHeader => h !== null);

    return headers
      .filter((h) => !h.subagentInfo)
      .map(mapHeaderToMeta);
  } finally {
    db.close();
  }
}

export function readThreadFromSqlite(dbPath: string, threadId: string): Thread {
  const db = openDb(dbPath);
  try {
    turnCounter = 0;

    const dataRow = db
      .query("SELECT value FROM cursorDiskKV WHERE key = ?")
      .get(`composerData:${threadId}`) as { value: string } | null;

    if (!dataRow?.value) {
      throw new Error(`Cursor composer not found in SQLite: ${threadId}`);
    }

    const composerData = JSON.parse(dataRow.value) as Record<string, unknown>;
    const headers = Array.isArray(composerData["fullConversationHeadersOnly"])
      ? (composerData["fullConversationHeadersOnly"] as Array<Record<string, unknown>>)
      : [];

    const turns: Turn[] = [];

    for (const header of headers) {
      const bubbleId = header["bubbleId"];
      if (typeof bubbleId !== "string") continue;

      const bubbleRow = db
        .query("SELECT value FROM cursorDiskKV WHERE key = ?")
        .get(`bubbleId:${threadId}:${bubbleId}`) as { value: string } | null;

      if (!bubbleRow?.value) continue;

      let bubbleRaw: unknown;
      try {
        bubbleRaw = JSON.parse(bubbleRow.value);
      } catch {
        continue;
      }

      const bubble = parseBubble(bubbleRaw);
      if (!bubble) continue;

      const turn = mapBubbleToTurn(bubble, header["type"]);
      if (turn) turns.push(turn);
    }

    const name = typeof composerData["name"] === "string" ? composerData["name"] : undefined;
    const createdAt =
      typeof composerData["createdAt"] === "number"
        ? Math.floor(composerData["createdAt"])
        : undefined;
    const updatedAt =
      typeof composerData["conversationCheckpointLastUpdatedAt"] === "number"
        ? Math.floor(composerData["conversationCheckpointLastUpdatedAt"])
        : typeof composerData["lastUpdatedAt"] === "number"
          ? Math.floor(composerData["lastUpdatedAt"])
          : undefined;

    return {
      id: threadId,
      provider: "cursor",
      title: name ?? extractTitleFromTurns(turns),
      createdAt,
      updatedAt,
      turns,
    };
  } finally {
    db.close();
  }
}

function openDb(dbPath: string): Database {
  try {
    return new Database(dbPath, { readonly: true });
  } catch {
    throw new Error(`Cursor database not found: ${dbPath}`);
  }
}

function mapHeaderToMeta(header: ComposerHeader): SqliteThreadMeta {
  const cwd = header.workspaceIdentifier?.uri?.fsPath;
  const updatedAt =
    header.conversationCheckpointLastUpdatedAt ??
    header.lastUpdatedAt ??
    header.createdAt;

  return {
    id: header.composerId,
    title: header.name,
    preview: header.subtitle ?? header.name,
    cwd,
    createdAt: header.createdAt ? Math.floor(header.createdAt) : undefined,
    updatedAt: updatedAt ? Math.floor(updatedAt) : undefined,
    isSubagent: Boolean(header.subagentInfo),
  };
}

function mapBubbleToTurn(bubble: ReturnType<typeof parseBubble>, headerType: unknown): Turn | null {
  if (!bubble) return null;

  const role = headerType === 1 || bubble.type === 1 ? "user" : "assistant";
  const items: TurnItem[] = [];

  const text = bubble.text ?? bubble.rawText;
  if (typeof text === "string" && text.trim()) {
    const cleaned = role === "user" ? cleanUserText(text) : text;
    if (cleaned) items.push({ type: "text", text: cleaned });
  }

  if (bubble.toolFormerData) {
    let input: unknown = bubble.toolFormerData.params;
    if (typeof input === "string") {
      try {
        input = JSON.parse(input);
      } catch {
        // keep raw string
      }
    }

    let output: unknown = bubble.toolFormerData.result;
    if (typeof output === "string") {
      try {
        output = JSON.parse(output);
      } catch {
        // keep raw string
      }
    }

    const toolName = bubble.toolFormerData.name ?? "tool";
    const normalized = normalizeCursorTool(
      toolName,
      input,
      output,
      bubble.toolFormerData.status
    );
    items.push(...normalized);
  }

  if (items.length === 0) return null;

  return {
    id: nextTurnId(),
    role,
    items,
  };
}

function cleanUserText(text: string): string {
  return text
    .replace(/<timestamp>[\s\S]*?<\/timestamp>\s*/g, "")
    .replace(/<\/?user_query>/g, "")
    .trim();
}

function extractTitleFromTurns(turns: Turn[]): string | undefined {
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

export function metaToSummary(meta: SqliteThreadMeta): ThreadSummary {
  return {
    id: meta.id,
    provider: "cursor",
    title: meta.title,
    preview: meta.preview,
    cwd: meta.cwd ?? (meta.id ? undefined : undefined),
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
  };
}

export function projectKeyToCwd(projectKey: string): string | undefined {
  return decodeProjectKey(projectKey);
}
