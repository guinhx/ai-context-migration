import type { TurnItem } from "@ctx/core";

/**
 * Map Cursor tool bubbles (toolFormerData / tool_use) to canonical TurnItem types
 * so output generators (agents-md, handoff, cursor-rules) can surface files/commands/plan.
 */
export function normalizeCursorTool(
  toolName: string,
  input: unknown,
  output: unknown,
  status?: string
): TurnItem[] {
  const name = toolName.toLowerCase();
  const params = asRecord(input);
  const result = asRecord(output);
  const resultText = stringifyOutput(output);

  // Shell / terminal
  if (
    name === "shell" ||
    name === "run_terminal_cmd" ||
    name === "bash" ||
    name === "terminal"
  ) {
    const command =
      pickString(params, "command") ??
      pickString(params, "cmd") ??
      pickString(params, "script") ??
      "";
    if (!command) return [];

    const exitCode = pickNumber(result, "exitCode") ?? pickNumber(result, "exit_code");
    return [
      {
        type: "command",
        command,
        cwd: pickString(params, "cwd") ?? pickString(params, "working_directory"),
        output: resultText || pickString(result, "output") || pickString(result, "stdout"),
        exitCode: exitCode ?? null,
        status: status ?? pickString(result, "status"),
      },
    ];
  }

  // File edits
  if (
    name === "write" ||
    name === "strreplace" ||
    name === "search_replace" ||
    name === "edit" ||
    name === "delete" ||
    name === "editnotebook"
  ) {
    const path =
      pickString(params, "path") ??
      pickString(params, "file_path") ??
      pickString(params, "target_file") ??
      pickString(params, "notebook_path") ??
      "";
    if (!path) return [];

    const changeKind =
      name === "delete"
        ? "delete"
        : name === "write"
          ? "add"
          : "update";

    return [
      {
        type: "file_change",
        path,
        diff: pickString(params, "diff") ?? pickString(params, "new_string"),
        changeKind,
      },
    ];
  }

  // Todo list
  if (name === "todowrite" || name === "todo_write" || name === "update_todos") {
    const todos = params["todos"] ?? params["steps"] ?? params["items"];
    if (!Array.isArray(todos)) return [];

    const steps = todos
      .map((t) => {
        const row = asRecord(t);
        return {
          step: pickString(row, "content") ?? pickString(row, "step") ?? pickString(row, "text") ?? "",
          status: pickString(row, "status") ?? "pending",
        };
      })
      .filter((s) => s.step);

    if (steps.length === 0) return [];

    return [
      {
        type: "todo_list",
        explanation: pickString(params, "explanation") ?? null,
        steps,
      },
    ];
  }

  // Reasoning / thinking blocks surfaced as tools
  if (name === "thinking" || name === "reasoning") {
    const text = pickString(params, "text") ?? resultText;
    if (!text) return [];
    return [{ type: "reasoning", text }];
  }

  // Fallback: generic tool_call
  return [
    {
      type: "tool_call",
      tool: toolName,
      input,
      output,
      status,
    },
  ];
}

function asRecord(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return {};
}

function pickString(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  return typeof v === "string" && v.trim() ? v : undefined;
}

function pickNumber(obj: Record<string, unknown>, key: string): number | undefined {
  const v = obj[key];
  return typeof v === "number" ? v : undefined;
}

function stringifyOutput(output: unknown): string | undefined {
  if (typeof output === "string") return output;
  if (output == null) return undefined;
  try {
    return JSON.stringify(output, null, 2);
  } catch {
    return String(output);
  }
}
