import type {
  Thread,
  Turn,
  TurnItem,
  FileChangeItem,
  CommandItem,
  ToolCallItem,
} from "@ctx/core";
import type { CodexThread, CodexTurnRaw, CodexTurnItemRaw } from "./client.ts";

let _turnCounter = 0;
function nextTurnId(): string {
  return `turn-${++_turnCounter}`;
}

// ---------------------------------------------------------------------------
// Status normaliser
// Codex can return status as a string ("completed") or an object ({ type: "completed" }).
// ---------------------------------------------------------------------------

function normaliseStatus(raw: unknown): Turn["status"] {
  if (typeof raw === "string") {
    return raw as Turn["status"];
  }
  if (raw && typeof raw === "object") {
    const type = (raw as Record<string, unknown>)["type"];
    if (typeof type === "string") return type as Turn["status"];
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Thread mapper
// ---------------------------------------------------------------------------

export function mapThread(raw: CodexThread): Thread {
  return {
    id: raw.id,
    provider: "codex",
    title: raw.title ?? undefined,
    cwd: raw.cwd ?? undefined,
    model: raw.latestModel ?? undefined,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    turns: (raw.turns ?? []).flatMap((t) => mapTurn(t)),
  };
}

// ---------------------------------------------------------------------------
// Turn mapper
// ---------------------------------------------------------------------------

function mapTurn(raw: CodexTurnRaw): Turn[] {
  const items = raw.items ?? [];
  const status = normaliseStatus(raw.status);
  const rawId = raw.turnId ?? (raw as Record<string, unknown>)["id"] as string | undefined ?? nextTurnId();

  // Determine role: user turns have a userMessage item as first significant item
  const hasUserMessage = items.some((i) => i["type"] === "userMessage" || i["type"] === "steeringUserMessage");
  const role = hasUserMessage ? "user" : "assistant";

  // Separate user message items from assistant items so each gets its own turn
  const userItems: TurnItem[] = [];
  const assistantItems: TurnItem[] = [];

  for (const item of items) {
    const mapped = mapItem(item);
    if (mapped === null) continue;

    if (item["type"] === "userMessage" || item["type"] === "steeringUserMessage") {
      userItems.push(mapped);
    } else {
      assistantItems.push(mapped);
    }
  }

  const turns: Turn[] = [];

  if (userItems.length > 0) {
    turns.push({
      id: `${rawId}-user`,
      role: "user",
      items: userItems,
      status,
    });
  }

  if (assistantItems.length > 0) {
    turns.push({
      id: `${rawId}-assistant`,
      role: "assistant",
      items: assistantItems,
      status,
    });
  }

  // Fallback: single empty-ish turn
  if (turns.length === 0) {
    turns.push({
      id: rawId,
      role: role,
      items: [],
      status,
    });
  }

  return turns;
}

// ---------------------------------------------------------------------------
// Item mapper
// ---------------------------------------------------------------------------

function mapItem(raw: CodexTurnItemRaw): TurnItem | null {
  const r = raw as Record<string, unknown>;

  switch (r["type"]) {
    case "userMessage":
    case "steeringUserMessage": {
      const text = extractUserText(r);
      if (!text) return null;
      return { type: "text", text };
    }

    case "agentMessage": {
      const text = typeof r["text"] === "string" ? r["text"] : "";
      if (!text) return null;
      return { type: "text", text };
    }

    case "reasoning": {
      const text = extractReasoningText(r);
      if (!text) return null;
      return { type: "reasoning", text };
    }

    case "plan": {
      const text = typeof r["text"] === "string" ? r["text"] : "";
      if (!text) return null;
      return { type: "reasoning", text: `[Plan]\n${text}` };
    }

    case "todo-list": {
      const steps = Array.isArray(r["plan"])
        ? (r["plan"] as Array<Record<string, unknown>>).map((s) => ({
            step: String(s["step"] ?? ""),
            status: String(s["status"] ?? ""),
          }))
        : [];
      const explanation =
        typeof r["explanation"] === "string" ? r["explanation"] : null;
      return { type: "todo_list", explanation, steps };
    }

    case "commandExecution": {
      const item: CommandItem = {
        type: "command",
        command: typeof r["command"] === "string" ? r["command"] : String(r["command"] ?? ""),
        cwd: typeof r["cwd"] === "string" ? r["cwd"] : undefined,
        output: typeof r["aggregatedOutput"] === "string" ? r["aggregatedOutput"] : undefined,
        exitCode: typeof r["exitCode"] === "number" ? r["exitCode"] : null,
        status: typeof r["status"] === "string" ? r["status"] : undefined,
      };
      return item;
    }

    case "fileChange": {
      const changes = Array.isArray(r["changes"])
        ? (r["changes"] as Array<Record<string, unknown>>)
        : [];
      if (changes.length === 0) return null;

      // Emit one item per file change
      const items: FileChangeItem[] = changes.map((c) => ({
        type: "file_change" as const,
        path: typeof c["path"] === "string" ? c["path"] : String(c["path"] ?? ""),
        diff: typeof c["diff"] === "string" ? c["diff"] : undefined,
        changeKind:
          c["kind"] && typeof (c["kind"] as Record<string, unknown>)["type"] === "string"
            ? String((c["kind"] as Record<string, unknown>)["type"])
            : undefined,
      }));

      // Return first item; caller will handle multiple via flatMap in turn mapper
      // We return only the first but pack the rest as additional text
      if (items.length === 1) return items[0] ?? null;

      // Multiple changes — return first; rest are embedded as text references
      return {
        type: "text",
        text: items.map((i) => `[file_change] ${i.changeKind ?? "modified"}: ${i.path}`).join("\n"),
      };
    }

    case "webSearch": {
      const query = typeof r["query"] === "string" ? r["query"] : "";
      if (!query) return null;
      return { type: "web_search", query };
    }

    case "dynamicToolCall":
    case "mcpToolCall": {
      const item: ToolCallItem = {
        type: "tool_call",
        tool: typeof r["tool"] === "string" ? r["tool"] : String(r["tool"] ?? "unknown"),
        input: r["arguments"],
        output: extractToolOutput(r),
        status: typeof r["status"] === "string" ? r["status"] : undefined,
      };
      return item;
    }

    case "function_call": {
      return {
        type: "tool_call",
        tool: typeof r["name"] === "string" ? r["name"] : "function_call",
        input: r["arguments"],
        status: "completed",
      };
    }

    case "function_call_output": {
      return {
        type: "tool_call",
        tool: "function_call_output",
        input: null,
        output: r["output"],
      };
    }

    case "custom_tool_call": {
      return {
        type: "tool_call",
        tool: typeof r["name"] === "string" ? r["name"] : "custom_tool",
        input: r["input"],
        status: typeof r["status"] === "string" ? r["status"] : undefined,
      };
    }

    case "error": {
      const msg = typeof r["message"] === "string" ? r["message"] : "unknown error";
      return { type: "text", text: `[error] ${msg}` };
    }

    // Items we intentionally skip
    case "contextCompaction":
    case "compaction":
    case "ghost_snapshot":
    case "automaticApprovalReview":
    case "planImplementation":
    case "userInputResponse":
    case "remoteTaskCreated":
    case "mcpServerElicitation":
    case "tool_search_call":
    case "tool_search_output":
    case "custom_tool_call_output":
    case "web_search_call":
    case "local_shell_call":
      return null;

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractUserText(r: Record<string, unknown>): string {
  const content = r["content"];
  if (!Array.isArray(content)) return "";

  return (content as Array<Record<string, unknown>>)
    .map((part) => {
      if (part["type"] === "text" && typeof part["text"] === "string") {
        return part["text"];
      }
      if (part["type"] === "image" && typeof part["url"] === "string") {
        return `[image: ${part["url"]}]`;
      }
      if (part["type"] === "localImage" && typeof part["path"] === "string") {
        return `[image: ${part["path"]}]`;
      }
      if (part["type"] === "mention" && typeof part["name"] === "string") {
        return `@${part["name"]}`;
      }
      if (part["type"] === "skill" && typeof part["name"] === "string") {
        return `[skill: ${part["name"]}]`;
      }
      return "";
    })
    .filter(Boolean)
    .join(" ");
}

function extractReasoningText(r: Record<string, unknown>): string {
  if (typeof r["text"] === "string") return r["text"];

  if (Array.isArray(r["summary"])) {
    return (r["summary"] as string[]).join("\n");
  }

  return "";
}

function extractToolOutput(r: Record<string, unknown>): unknown {
  const items = r["contentItems"];
  if (!Array.isArray(items)) return undefined;

  const texts = (items as Array<Record<string, unknown>>)
    .filter((i) => i["type"] === "inputText" && typeof i["text"] === "string")
    .map((i) => i["text"] as string);

  if (texts.length === 0) return undefined;
  return texts.join("\n");
}

// ---------------------------------------------------------------------------
// Summary mapper
// ---------------------------------------------------------------------------

export function mapThreadSummary(raw: {
  id: string;
  preview?: string | null;
  name?: string | null;
  cwd?: string | null;
  latestModel?: string | null;
  modelProvider?: string | null;
  createdAt?: number;
  updatedAt?: number;
}): import("@ctx/core").ThreadSummary {
  return {
    id: raw.id,
    provider: "codex",
    title: raw.name ?? undefined,
    preview: raw.preview ?? undefined,
    cwd: raw.cwd ?? undefined,
    model: raw.latestModel ?? raw.modelProvider ?? undefined,
    createdAt: raw.createdAt ?? undefined,
    updatedAt: raw.updatedAt ?? undefined,
  };
}
