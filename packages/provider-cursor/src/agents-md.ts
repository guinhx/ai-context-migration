import type { Thread } from "@ctx/core";

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface AgentsMdOptions {
  /**
   * "compact" (default) — smart filtering + size budget; ideal for AI context windows.
   * "full"              — no filtering, no truncation; complete history preserved.
   */
  mode?: "compact" | "full";
  /**
   * Hard budget in bytes for compact mode. Defaults to 32 000 (~8K tokens).
   * Ignored when mode is "full".
   */
  budget?: number;
}

// ---------------------------------------------------------------------------
// Budget defaults for compact mode
// ---------------------------------------------------------------------------

export const AGENTS_MD_DEFAULTS = {
  totalChars: 32_000,
  requestChars: 500,
  lastMsgChars: 800,
  diffLines: 40,
  diffsShown: 3,
  filesListed: 30,
  commands: 15,
  reasoningItems: 4,
  reasoningChars: 200,
  recentTurns: 4,
  turnTextChars: 300,
} as const;

// In full mode every limit is effectively infinite
const UNLIMITED = 999_999_999;

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function generateAgentsMd(thread: Thread, opts: AgentsMdOptions = {}): string {
  const full = opts.mode === "full";
  const budget = full ? UNLIMITED : (opts.budget ?? AGENTS_MD_DEFAULTS.totalChars);

  const lim = full
    ? {
        requestChars: UNLIMITED,
        lastMsgChars: UNLIMITED,
        diffLines: UNLIMITED,
        diffsShown: UNLIMITED,
        filesListed: UNLIMITED,
        commands: UNLIMITED,
        reasoningItems: UNLIMITED,
        reasoningChars: UNLIMITED,
        recentTurns: thread.turns.length,
        turnTextChars: UNLIMITED,
      }
    : {
        requestChars: AGENTS_MD_DEFAULTS.requestChars,
        lastMsgChars: AGENTS_MD_DEFAULTS.lastMsgChars,
        diffLines: AGENTS_MD_DEFAULTS.diffLines,
        diffsShown: AGENTS_MD_DEFAULTS.diffsShown,
        filesListed: AGENTS_MD_DEFAULTS.filesListed,
        commands: AGENTS_MD_DEFAULTS.commands,
        reasoningItems: AGENTS_MD_DEFAULTS.reasoningItems,
        reasoningChars: AGENTS_MD_DEFAULTS.reasoningChars,
        recentTurns: AGENTS_MD_DEFAULTS.recentTurns,
        turnTextChars: AGENTS_MD_DEFAULTS.turnTextChars,
      };

  const sections: string[] = [];

  sections.push(buildHeader(thread, full));
  sections.push(buildTask(thread, lim.requestChars, !full));

  const state = buildCurrentState(thread, lim.lastMsgChars);
  if (state) sections.push(state);

  const fileSection = buildFilesChanged(thread, lim.filesListed, lim.diffsShown, lim.diffLines);
  if (fileSection) sections.push(fileSection);

  const cmdSection = buildCommands(thread, lim.commands, full);
  if (cmdSection) sections.push(cmdSection);

  const todoSection = buildTodo(thread);
  if (todoSection) sections.push(todoSection);

  const reasoningSection = buildReasoning(thread, lim.reasoningItems, lim.reasoningChars);
  if (reasoningSection) sections.push(reasoningSection);

  const recapSection = buildRecentRecap(thread, lim.recentTurns, lim.turnTextChars);
  if (recapSection) sections.push(recapSection);

  sections.push(buildFooter(thread, full));

  const output = sections.filter(Boolean).join("\n\n") + "\n";

  if (!full && output.length > budget) {
    return (
      output.slice(0, budget) +
      "\n\n---\n_Context truncated to budget. Use `--full` for the complete output or `--format=markdown` for the full conversation._\n"
    );
  }

  return output;
}

// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------

function buildHeader(thread: Thread, full: boolean): string {
  const title = thread.title ?? `Thread ${thread.id}`;
  const lines = [`# ${title}`, ""];

  const meta: string[] = [];
  if (thread.provider) meta.push(`**Source:** ${thread.provider}`);
  if (thread.cwd) meta.push(`**CWD:** \`${thread.cwd}\``);
  if (thread.model) meta.push(`**Model:** ${thread.model}`);
  if (thread.updatedAt) meta.push(`**Last updated:** ${formatDate(thread.updatedAt)}`);
  meta.push(`**Thread ID:** \`${thread.id}\``);
  if (full) meta.push(`**Mode:** full`);

  lines.push(meta.join(" · "));
  return lines.join("\n");
}

/**
 * Task description: uses the last substantive user message (>80 chars after cleaning),
 * falling back to the first one. This captures the current task better than
 * always using the first message, which is often IDE context or boilerplate.
 */
export function buildTask(thread: Thread, maxChars: number, filter: boolean): string {
  const SUBSTANCE_THRESHOLD = 80;

  // Collect all user text items
  const candidates: string[] = [];
  for (const turn of thread.turns) {
    if (turn.role !== "user") continue;
    for (const item of turn.items) {
      if (item.type === "text" && item.text.trim().length > SUBSTANCE_THRESHOLD) {
        candidates.push(item.text.trim());
      }
    }
  }

  if (candidates.length === 0) return "";

  // Prefer last substantive message; if it's clearly a continuation ("continue",
  // "prossiga", "ok", etc.) walk backwards to find one with real content.
  let chosen = candidates[candidates.length - 1]!;
  for (let i = candidates.length - 1; i >= 0; i--) {
    const c = candidates[i]!;
    if (!/^(continue|prossig|ok\b|sim\b|yes\b|go\b|proceed)/i.test(c.trim())) {
      chosen = c;
      break;
    }
  }

  const cleaned = filter ? cleanUserText(chosen) : chosen;
  const snippet = truncate(cleaned, maxChars);

  return `## Task\n\n${snippet}`;
}

/**
 * Last substantive assistant message (>80 chars).
 * Skips short transitional messages like "Ok" or "Let me check...".
 */
export function buildCurrentState(thread: Thread, maxChars: number): string {
  const SUBSTANCE_THRESHOLD = 80;
  for (let i = thread.turns.length - 1; i >= 0; i--) {
    const turn = thread.turns[i];
    if (!turn || turn.role !== "assistant") continue;
    for (const item of [...turn.items].reverse()) {
      if (item.type === "text" && item.text.trim().length >= SUBSTANCE_THRESHOLD) {
        return `## Current State\n\n${truncate(item.text.trim(), maxChars)}`;
      }
    }
  }
  return "";
}

/**
 * Deduplicated list of files changed, ordered by last-modified turn index
 * (most recently touched files last → slice(-N) picks the truly recent ones).
 * Only the most recent diff per file is kept.
 */
export function buildFilesChanged(
  thread: Thread,
  maxFiles: number,
  maxDiffs: number,
  maxDiffLines: number
): string {
  // Map: path → { kind, diff, lastTurnIdx }
  const byPath = new Map<string, { kind?: string; diff?: string; lastTurnIdx: number }>();

  thread.turns.forEach((turn, turnIdx) => {
    for (const item of turn.items) {
      if (item.type === "file_change") {
        byPath.set(item.path, {
          kind: item.changeKind,
          diff: item.diff,
          lastTurnIdx: turnIdx,  // always overwrite → keeps most recent
        });
      }
    }
  });

  if (byPath.size === 0) return "";

  // Sort by last modified turn ascending so slice(-N) gives the N most recently touched
  const sorted = [...byPath.entries()].sort(
    ([, a], [, b]) => a.lastTurnIdx - b.lastTurnIdx
  );

  const omittedFiles = Math.max(0, sorted.length - maxFiles);
  const listedEntries = sorted.slice(-maxFiles);

  const lines = ["## Files Changed", ""];

  if (omittedFiles > 0) {
    lines.push(`_(${omittedFiles} earlier files omitted — use \`--full\` to see all)_`, "");
  }

  for (const [path, info] of listedEntries) {
    const badge = info.kind ? ` _(${info.kind})_` : "";
    lines.push(`- \`${path}\`${badge}`);
  }

  const withDiff = listedEntries
    .filter(([, v]) => v.diff)
    .slice(-maxDiffs);

  if (withDiff.length > 0) {
    const diffLabel = omittedFiles > 0 ? "### Key diffs (most recently changed)" : "### Diffs";
    lines.push("", diffLabel);
    for (const [path, info] of withDiff) {
      const diffLines = (info.diff ?? "").split("\n");
      const shown =
        diffLines.length > maxDiffLines
          ? diffLines.slice(0, maxDiffLines).join("\n") +
            `\n... (+${diffLines.length - maxDiffLines} lines omitted — use \`--full\` to see all)`
          : info.diff ?? "";

      lines.push(
        "",
        `<details>`,
        `<summary><code>${path}</code></summary>`,
        "",
        "```diff",
        shown,
        "```",
        "",
        "</details>"
      );
    }
  }

  return lines.join("\n");
}

/**
 * Commands list. Keeps the LAST occurrence of each unique command so the
 * final exit code (success after retries) is shown, not the first attempt.
 * Trivial navigation commands (cd, ls, dir, echo, clear, cls) are skipped.
 * In full mode every run is included (with output); in compact, last-unique + no output.
 */
export function buildCommands(
  thread: Thread,
  maxCommands: number,
  includeOutput: boolean
): string {
  const TRIVIAL = /^(cd|ls|dir|echo|clear|cls|pwd|exit)\b/i;

  if (includeOutput) {
    // Full mode: every execution in order, with output
    const all: Array<{ command: string; output?: string; exitCode?: number | null }> = [];
    for (const turn of thread.turns) {
      for (const item of turn.items) {
        if (item.type === "command") {
          all.push({ command: item.command, output: item.output, exitCode: item.exitCode });
        }
      }
    }

    if (all.length === 0) return "";
    const shown = all.slice(-maxCommands);
    const omitted = all.length - shown.length;
    const lines = ["## Commands Executed", ""];
    if (omitted > 0) lines.push(`_(${omitted} earlier commands omitted)_`, "");
    for (const { command, output, exitCode } of shown) {
      const badge = exitCode != null ? (exitCode === 0 ? " ✓" : ` ✗ exit ${exitCode}`) : "";
      lines.push(`\`\`\`sh${badge}`);
      lines.push(command);
      lines.push("```");
      if (output) {
        lines.push(`<details><summary>output</summary>\n\n\`\`\`\n${output}\n\`\`\`\n\n</details>`);
      }
      lines.push("");
    }
    return lines.join("\n");
  }

  // Compact mode: keep LAST occurrence per unique command (last exit code wins)
  const lastByCmd = new Map<
    string,
    { command: string; exitCode?: number | null; order: number }
  >();
  let order = 0;
  for (const turn of thread.turns) {
    for (const item of turn.items) {
      if (item.type === "command" && !TRIVIAL.test(item.command.trim())) {
        lastByCmd.set(item.command, {
          command: item.command,
          exitCode: item.exitCode,
          order: order++,
        });
      }
    }
  }

  if (lastByCmd.size === 0) return "";

  // Sort by last-seen order so slice(-N) picks the most recently executed
  const sorted = [...lastByCmd.values()].sort((a, b) => a.order - b.order);
  const shown = sorted.slice(-maxCommands);
  const omitted = sorted.length - shown.length;

  const lines = ["## Commands Executed", ""];
  if (omitted > 0) {
    lines.push(`_(${omitted} earlier commands omitted — use \`--full\` to see all)_`, "");
  }

  // Surface any failing command prominently
  const failures = shown.filter((c) => c.exitCode != null && c.exitCode !== 0);
  if (failures.length > 0) {
    lines.push("**⚠ Commands with non-zero exit:**");
    for (const { command, exitCode } of failures) {
      lines.push(`- \`${command}\` → exit ${exitCode}`);
    }
    lines.push("");
  }

  lines.push("```sh");
  for (const { command, exitCode } of shown) {
    const badge =
      exitCode != null ? (exitCode === 0 ? "  # ✓" : `  # ✗ exit ${exitCode}`) : "";
    lines.push(command + badge);
  }
  lines.push("```");

  return lines.join("\n");
}

export type TodoStep = { step: string; status: string };
export type TodoSnapshot = { explanation?: string | null; steps: TodoStep[] };

/** Most recent todo list in the thread, if any. */
export function getLatestTodo(thread: Thread): TodoSnapshot | null {
  for (let i = thread.turns.length - 1; i >= 0; i--) {
    const turn = thread.turns[i];
    if (!turn) continue;
    for (const item of turn.items) {
      if (item.type === "todo_list" && item.steps.length > 0) {
        return { explanation: item.explanation ?? undefined, steps: item.steps };
      }
    }
  }
  return null;
}

/** Commands with non-zero exit codes (last occurrence per command). */
export function collectCommandFailures(
  thread: Thread,
  maxCommands: number
): Array<{ command: string; exitCode: number }> {
  const TRIVIAL = /^(cd|ls|dir|echo|clear|cls|pwd|exit)\b/i;
  const lastByCmd = new Map<string, { command: string; exitCode: number; order: number }>();
  let order = 0;

  for (const turn of thread.turns) {
    for (const item of turn.items) {
      if (
        item.type === "command" &&
        !TRIVIAL.test(item.command.trim()) &&
        item.exitCode != null &&
        item.exitCode !== 0
      ) {
        lastByCmd.set(item.command, {
          command: item.command,
          exitCode: item.exitCode,
          order: order++,
        });
      }
    }
  }

  return [...lastByCmd.values()]
    .sort((a, b) => a.order - b.order)
    .slice(-maxCommands);
}

export function buildTodo(thread: Thread): string {
  const todo = getLatestTodo(thread);
  if (!todo) return "";

  const lines = ["## Plan Status", ""];
  if (todo.explanation) lines.push(todo.explanation, "");
  for (const { step, status } of todo.steps) {
    const icon =
      status === "completed"
        ? "- [x]"
        : status === "in_progress"
          ? "- [ ] _(in progress)_"
          : "- [ ]";
    lines.push(`${icon} ${step}`);
  }
  return lines.join("\n");
}

/**
 * Most recent reasoning snippets — iterates from the END of the thread so we
 * capture the latest decisions, not the ones from early turns that may be stale.
 */
function buildReasoning(thread: Thread, maxItems: number, maxChars: number): string {
  const items: string[] = [];

  for (let i = thread.turns.length - 1; i >= 0 && items.length < maxItems; i--) {
    const turn = thread.turns[i];
    if (!turn || turn.role !== "assistant") continue;
    for (const item of [...turn.items].reverse()) {
      if (item.type === "reasoning" && item.text.trim().length > 30) {
        // Use first non-empty line as the decision headline
        const headline =
          item.text.split("\n").find((l) => l.trim().length > 20) ?? item.text;
        items.push(truncate(headline.trim(), maxChars));
        if (items.length >= maxItems) break;
      }
    }
  }

  if (items.length === 0) return "";

  // Reverse so they appear in chronological order in the output
  items.reverse();
  const lines = ["## Key Decisions", ""];
  items.forEach((d, i) => lines.push(`${i + 1}. ${d}`));
  return lines.join("\n");
}

/**
 * Recent conversation recap. Uses only `type === "text"` items (the actual
 * human-visible content), not reasoning — reasoning is surfaced separately.
 * Falls back to the first non-empty text if none found in a turn.
 */
function buildRecentRecap(thread: Thread, maxTurns: number, maxTextChars: number): string {
  const recent = thread.turns.slice(-maxTurns);
  if (recent.length === 0) return "";

  const label =
    maxTurns >= thread.turns.length ? "## Full Conversation" : "## Recent Conversation";
  const lines = [label, ""];

  for (const turn of recent) {
    const roleLabel = turn.role === "user" ? "**User**" : "**Assistant**";

    // Prefer explicit text items; skip pure-reasoning turns in the recap
    const textItems = turn.items
      .filter((i) => i.type === "text")
      .map((i) => (i as { text: string }).text.trim())
      .filter(Boolean);

    if (textItems.length === 0) continue;

    const combined = textItems.join(" ").replace(/\n+/g, " ");
    lines.push(`${roleLabel}: ${truncate(combined, maxTextChars)}`);
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

function buildFooter(thread: Thread, full: boolean): string {
  const total = thread.turns.length;
  const lines = [
    "---",
    `_Migrated from **${thread.provider}** · ${total} turn${total === 1 ? "" : "s"} total._`,
  ];
  if (!full) {
    lines.push(`_For the full conversation: \`ctx migrate ${thread.id} --format=markdown\`_`);
    lines.push(`_For unfiltered agents-md: \`ctx migrate ${thread.id} --full\`_`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

/**
 * Strip noise from user messages: log lines, hex dumps, stack traces,
 * IDE metadata headers. Return the meaningful part only.
 */
function cleanUserText(raw: string): string {
  const lines = raw.split("\n");

  // If the message contains "My request for Codex:" or similar,
  // extract just that section, then still apply noise filtering
  const requestIdx = lines.findIndex((l) =>
    /my request (for codex|to codex)?:/i.test(l)
  );
  const sourceLines = requestIdx !== -1 ? lines.slice(requestIdx + 1) : lines;

  // Filter out noisy lines
  const cleaned = sourceLines.filter((l) => {
    const t = l.trim();
    if (!t) return false;
    // Structured log lines: [HH:MM:SS DBG/INF/ERR/WRN] …
    if (/^\[\d{2}:\d{2}:\d{2}(\.\d+)?\s+(DBG|INF|WRN|ERR|VRB|FTL|TRC)]/i.test(t)) return false;
    // Hex dump lines: "0000: AA BB CC …"
    if (/^[0-9a-f]{4}:\s+([0-9a-f]{2}\s+){3,}/i.test(t)) return false;
    // .NET / Java stack trace lines: "   at Namespace.Class.Method("
    if (/^\s{3,}at\s+[\w.<>[\]]+\(/.test(t)) return false;
    // IDE context headers injected by Cursor/Codex IDE plugin
    if (/^##\s+(Active file|Open tabs|Active selection|My request)/i.test(t)) return false;
    // IDE tab list lines: "- README.md: path/to/file"
    if (/^-\s+\w[\w. ]+:\s+\S+[/\\]\S+$/.test(t)) return false;
    // Long repeated separator lines (===, ---, ___)
    if (/^[-=_]{20,}$/.test(t)) return false;
    return true;
  });

  return cleaned.join("\n").trim();
}


export function formatDate(ts: number): string {
  return new Date(ts < 1e12 ? ts * 1000 : ts).toLocaleString();
}
