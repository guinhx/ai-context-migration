import type { Thread, Turn, TurnItem } from "@ctx/core";

// ---------------------------------------------------------------------------
// Full conversation Markdown formatter
//
// Produces a human-readable markdown file with the complete conversation,
// including code diffs, commands, and tool calls — suitable for attaching
// as context in a Cursor chat or reviewing in any markdown viewer.
// ---------------------------------------------------------------------------

export function generateMarkdown(thread: Thread): string {
  const sections: string[] = [];

  sections.push(buildHeader(thread));

  for (const turn of thread.turns) {
    const block = renderTurn(turn);
    if (block.trim()) sections.push(block);
  }

  return sections.join("\n\n---\n\n") + "\n";
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function buildHeader(thread: Thread): string {
  const title = thread.title ?? `Thread ${thread.id}`;
  const lines = [`# ${title}`];

  lines.push("");
  lines.push(`| Field | Value |`);
  lines.push(`|-------|-------|`);
  lines.push(`| Provider | \`${thread.provider}\` |`);
  lines.push(`| Thread ID | \`${thread.id}\` |`);
  if (thread.cwd) lines.push(`| Working Directory | \`${thread.cwd}\` |`);
  if (thread.model) lines.push(`| Model | \`${thread.model}\` |`);
  if (thread.createdAt) lines.push(`| Created | ${formatDate(thread.createdAt)} |`);
  if (thread.updatedAt) lines.push(`| Updated | ${formatDate(thread.updatedAt)} |`);

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Turn renderer
// ---------------------------------------------------------------------------

function renderTurn(turn: Turn): string {
  const roleLabel = turn.role === "user" ? "👤 **User**" : "🤖 **Assistant**";
  const statusStr =
    turn.status && turn.status !== "completed"
      ? ` _(${turn.status})_`
      : "";

  const lines = [`### ${roleLabel}${statusStr}`];

  for (const item of turn.items) {
    const rendered = renderItem(item);
    if (rendered) {
      lines.push("", rendered);
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Item renderers
// ---------------------------------------------------------------------------

function renderItem(item: TurnItem): string {
  switch (item.type) {
    case "text":
      return item.text;

    case "reasoning":
      return [
        `<details>`,
        `<summary>💭 Reasoning</summary>`,
        ``,
        item.text,
        ``,
        `</details>`,
      ].join("\n");

    case "file_change": {
      const header = `📄 **File change** (\`${item.changeKind ?? "modified"}\`): \`${item.path}\``;
      if (!item.diff) return header;
      return [header, "", "```diff", item.diff, "```"].join("\n");
    }

    case "command": {
      const exitStr =
        item.exitCode != null
          ? item.exitCode === 0
            ? " ✓"
            : ` ✗ (exit ${item.exitCode})`
          : "";
      const lines = [`⚡ **Command**${exitStr}`, "", "```sh", item.command, "```"];
      if (item.output) {
        const truncated =
          item.output.length > 2000
            ? item.output.slice(0, 2000) + "\n... (truncated)"
            : item.output;
        lines.push(
          "",
          "<details>",
          "<summary>Output</summary>",
          "",
          "```",
          truncated,
          "```",
          "",
          "</details>"
        );
      }
      return lines.join("\n");
    }

    case "tool_call": {
      const inputStr =
        item.input != null
          ? `\n\n**Input:**\n\`\`\`json\n${JSON.stringify(item.input, null, 2)}\n\`\`\``
          : "";
      const outputStr =
        item.output != null
          ? `\n\n**Output:**\n\`\`\`\n${typeof item.output === "string" ? item.output : JSON.stringify(item.output, null, 2)}\n\`\`\``
          : "";
      return `🔧 **Tool call**: \`${item.tool}\`${inputStr}${outputStr}`;
    }

    case "web_search":
      return `🔍 **Web search**: ${item.query}`;

    case "image":
      return `![image](${item.url})`;

    case "todo_list": {
      const lines: string[] = [];
      if (item.explanation) lines.push(item.explanation, "");
      for (const { step, status } of item.steps) {
        const icon =
          status === "completed"
            ? "- [x]"
            : status === "in_progress"
              ? "- [ ] *(in progress)*"
              : "- [ ]";
        lines.push(`${icon} ${step}`);
      }
      return lines.join("\n");
    }
  }
}

function formatDate(timestamp: number): string {
  return new Date(timestamp < 1e12 ? timestamp * 1000 : timestamp).toLocaleString();
}
