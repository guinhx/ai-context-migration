import type { Thread, Turn, TurnItem } from "@ctx/core";

// ---------------------------------------------------------------------------
// AGENTS.md generator
//
// Produces a structured context file that helps a new AI (Cursor) understand:
// - What project was being worked on
// - What was accomplished (file changes, commands)
// - Key decisions and reasoning
// - Current state and next steps
// ---------------------------------------------------------------------------

export function generateAgentsMd(thread: Thread): string {
  const sections: string[] = [];

  sections.push(buildHeader(thread));
  sections.push(buildProjectContext(thread));

  const fileChanges = collectFileChanges(thread);
  if (fileChanges.length > 0) {
    sections.push(buildFileChangeSection(fileChanges));
  }

  const commands = collectCommands(thread);
  if (commands.length > 0) {
    sections.push(buildCommandsSection(commands));
  }

  const decisions = collectDecisions(thread);
  if (decisions.length > 0) {
    sections.push(buildDecisionsSection(decisions));
  }

  const todoSteps = collectTodoSteps(thread);
  if (todoSteps.length > 0) {
    sections.push(buildTodoSection(todoSteps));
  }

  sections.push(buildConversationSummary(thread));

  return sections.filter(Boolean).join("\n\n") + "\n";
}

// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------

function buildHeader(thread: Thread): string {
  const title = thread.title ?? `Thread ${thread.id}`;
  const lines = [
    `# ${title}`,
    "",
    `> Migrated from **${thread.provider}** · ID: \`${thread.id}\``,
  ];

  if (thread.cwd) {
    lines.push(`> Working directory: \`${thread.cwd}\``);
  }
  if (thread.model) {
    lines.push(`> Model: \`${thread.model}\``);
  }
  if (thread.updatedAt) {
    lines.push(`> Last updated: ${formatDate(thread.updatedAt)}`);
  }

  return lines.join("\n");
}

function buildProjectContext(thread: Thread): string {
  const lines = ["## Project Context"];

  if (thread.cwd) {
    lines.push(``, `**Root directory:** \`${thread.cwd}\``);
  }

  // Extract the first user message as the project description
  const firstUser = findFirstUserText(thread);
  if (firstUser) {
    lines.push(
      ``,
      `**Original request:**`,
      ``,
      `> ${firstUser.split("\n").join("\n> ")}`
    );
  }

  return lines.join("\n");
}

function buildFileChangeSection(
  changes: Array<{ path: string; kind?: string; diff?: string }>
): string {
  const lines = ["## Files Changed"];
  lines.push("");

  const byPath = new Map<string, typeof changes[number]>();
  for (const c of changes) {
    // Later changes win (most recent state)
    byPath.set(c.path, c);
  }

  for (const [path, info] of byPath) {
    const badge = info.kind ? ` _(${info.kind})_` : "";
    lines.push(`- \`${path}\`${badge}`);
  }

  // Include diffs for files that have them (collapsed under details)
  const withDiff = [...byPath.values()].filter((c) => c.diff);
  if (withDiff.length > 0) {
    lines.push("", "### Diffs");
    for (const c of withDiff) {
      lines.push(
        "",
        `<details>`,
        `<summary><code>${c.path}</code></summary>`,
        "",
        "```diff",
        c.diff ?? "",
        "```",
        "",
        "</details>"
      );
    }
  }

  return lines.join("\n");
}

function buildCommandsSection(
  commands: Array<{ command: string; output?: string; exitCode?: number | null; status?: string }>
): string {
  const lines = ["## Commands Executed"];
  lines.push("");

  for (const cmd of commands) {
    const statusBadge =
      cmd.exitCode != null
        ? cmd.exitCode === 0
          ? " ✓"
          : ` ✗ (exit ${cmd.exitCode})`
        : cmd.status
          ? ` [${cmd.status}]`
          : "";

    lines.push(`\`\`\`sh${statusBadge}`);
    lines.push(cmd.command);
    lines.push("```");

    if (cmd.output) {
      const truncated =
        cmd.output.length > 1000
          ? cmd.output.slice(0, 1000) + "\n... (truncated)"
          : cmd.output;
      lines.push(`<details><summary>output</summary>\n\n\`\`\`\n${truncated}\n\`\`\`\n\n</details>`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function buildDecisionsSection(decisions: string[]): string {
  const lines = [
    "## Key Decisions & Reasoning",
    "",
    ...decisions.map((d, i) => `${i + 1}. ${d.split("\n").join(" ").slice(0, 300)}`),
  ];
  return lines.join("\n");
}

function buildTodoSection(
  steps: Array<{ step: string; status: string }>
): string {
  const lines = ["## Todo / Plan Status", ""];

  for (const { step, status } of steps) {
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

function buildConversationSummary(thread: Thread): string {
  const lines = ["## Conversation Summary", ""];

  const userTurns = thread.turns.filter((t) => t.role === "user");
  const assistantTurns = thread.turns.filter((t) => t.role === "assistant");

  lines.push(
    `This thread contains **${thread.turns.length} turns** ` +
      `(${userTurns.length} user, ${assistantTurns.length} assistant).`
  );

  // Last assistant message as "current state"
  const lastAssistant = findLastAssistantText(thread);
  if (lastAssistant) {
    lines.push("", "**Last assistant message:**", "", `> ${lastAssistant.split("\n").slice(0, 10).join("\n> ")}`);
  }

  lines.push(
    "",
    "---",
    "",
    "_This file was auto-generated by `ctx migrate`. To continue this work in Cursor,_",
    "_place this file in your project root or `.cursor/` directory and start a new chat._"
  );

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Data collectors
// ---------------------------------------------------------------------------

function collectFileChanges(
  thread: Thread
): Array<{ path: string; kind?: string; diff?: string }> {
  const results: Array<{ path: string; kind?: string; diff?: string }> = [];
  for (const turn of thread.turns) {
    for (const item of turn.items) {
      if (item.type === "file_change") {
        results.push({
          path: item.path,
          kind: item.changeKind,
          diff: item.diff,
        });
      }
    }
  }
  return results;
}

function collectCommands(
  thread: Thread
): Array<{ command: string; output?: string; exitCode?: number | null; status?: string }> {
  const results: Array<{ command: string; output?: string; exitCode?: number | null; status?: string }> = [];
  for (const turn of thread.turns) {
    for (const item of turn.items) {
      if (item.type === "command") {
        results.push({
          command: item.command,
          output: item.output,
          exitCode: item.exitCode,
          status: item.status,
        });
      }
    }
  }
  return results;
}

function collectDecisions(thread: Thread): string[] {
  const results: string[] = [];
  for (const turn of thread.turns) {
    if (turn.role !== "assistant") continue;
    for (const item of turn.items) {
      if (item.type === "reasoning" && item.text.length > 20) {
        results.push(item.text);
      }
    }
  }
  return results.slice(0, 10); // Cap at 10 reasoning items
}

function collectTodoSteps(
  thread: Thread
): Array<{ step: string; status: string }> {
  // Return the most recent todo-list
  for (let i = thread.turns.length - 1; i >= 0; i--) {
    const turn = thread.turns[i];
    if (!turn) continue;
    for (const item of turn.items) {
      if (item.type === "todo_list") {
        return item.steps;
      }
    }
  }
  return [];
}

function findFirstUserText(thread: Thread): string | null {
  for (const turn of thread.turns) {
    if (turn.role !== "user") continue;
    for (const item of turn.items) {
      if (item.type === "text" && item.text.trim()) {
        return item.text.trim();
      }
    }
  }
  return null;
}

function findLastAssistantText(thread: Thread): string | null {
  for (let i = thread.turns.length - 1; i >= 0; i--) {
    const turn = thread.turns[i];
    if (!turn || turn.role !== "assistant") continue;
    for (const item of [...turn.items].reverse()) {
      if (item.type === "text" && item.text.trim()) {
        return item.text.trim();
      }
    }
  }
  return null;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp < 1e12 ? timestamp * 1000 : timestamp).toLocaleString();
}
