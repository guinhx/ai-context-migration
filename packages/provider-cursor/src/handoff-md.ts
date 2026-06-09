import type { Thread } from "@ctx/core";
import {
  AGENTS_MD_DEFAULTS,
  buildCurrentState,
  buildFilesChanged,
  buildTask,
  collectCommandFailures,
  formatDate,
  getLatestTodo,
  truncate,
} from "./agents-md.ts";

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function generateHandoffMd(thread: Thread): string {
  const lim = AGENTS_MD_DEFAULTS;
  const title = thread.title ?? `Thread ${thread.id}`;
  const sections: string[] = [];

  sections.push(buildHeader(thread, title));
  sections.push(buildObjective(thread, lim.requestChars));
  sections.push(buildDone(thread, lim.filesListed));
  sections.push(buildNext(thread, lim.lastMsgChars));
  sections.push(buildBlockers(thread, lim.commands));
  sections.push(buildFooter(thread));

  return sections.filter(Boolean).join("\n\n") + "\n";
}

// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------

function buildHeader(thread: Thread, title: string): string {
  const meta: string[] = [];
  if (thread.provider) meta.push(`**Source:** ${thread.provider}`);
  if (thread.cwd) meta.push(`**CWD:** \`${thread.cwd}\``);
  if (thread.updatedAt) meta.push(`**Updated:** ${formatDate(thread.updatedAt)}`);
  meta.push(`**Thread ID:** \`${thread.id}\``);

  return [`# Handoff: ${title}`, "", meta.join(" · ")].join("\n");
}

function buildObjective(thread: Thread, maxChars: number): string {
  const task = buildTask(thread, maxChars, true);
  if (!task) return "## Objective\n\n_No task identified._";
  return task.replace("## Task", "## Objective");
}

function buildDone(thread: Thread, maxFiles: number): string {
  const lines = ["## Done", ""];
  let hasContent = false;

  const todo = getLatestTodo(thread);
  if (todo) {
    const completed = todo.steps.filter((s) => s.status === "completed");
    if (completed.length > 0) {
      hasContent = true;
      for (const { step } of completed) {
        lines.push(`- [x] ${step}`);
      }
      lines.push("");
    }
  }

  const filesSection = buildFilesChanged(thread, maxFiles, 0, 0);
  if (filesSection) {
    const fileLines = filesSection
      .split("\n")
      .filter((l) => l.startsWith("- `") || l.startsWith("_("));
    if (fileLines.some((l) => l.startsWith("- `"))) {
      hasContent = true;
      lines.push("**Files changed:**");
      lines.push(...fileLines.filter((l) => l.startsWith("- `") || l.startsWith("_(")));
      lines.push("");
    }
  }

  if (!hasContent) {
    lines.push("_No completed work recorded._");
  }

  return lines.join("\n").trimEnd();
}

function buildNext(thread: Thread, maxChars: number): string {
  const lines = ["## Next", ""];
  const todo = getLatestTodo(thread);

  if (todo) {
    const pending = todo.steps.filter((s) => s.status !== "completed");
    if (pending.length > 0) {
      if (todo.explanation) lines.push(todo.explanation, "");
      for (const { step, status } of pending) {
        const icon =
          status === "in_progress" ? "- [ ] _(in progress)_" : "- [ ]";
        lines.push(`${icon} ${step}`);
      }
      return lines.join("\n");
    }
  }

  const state = buildCurrentState(thread, maxChars);
  if (state) {
    const body = state.replace(/^## Current State\n\n/, "");
    lines.push("_Inferred from last assistant message:_", "", truncate(body, maxChars));
    return lines.join("\n");
  }

  lines.push("_No pending steps identified._");
  return lines.join("\n");
}

function buildBlockers(thread: Thread, maxCommands: number): string {
  const lines = ["## Blockers", ""];
  let hasContent = false;

  const failures = collectCommandFailures(thread, maxCommands);
  if (failures.length > 0) {
    hasContent = true;
    lines.push("**Failed commands:**");
    for (const { command, exitCode } of failures) {
      lines.push(`- \`${command}\` → exit ${exitCode}`);
    }
    lines.push("");
  }

  const questions = extractOpenQuestions(thread);
  if (questions.length > 0) {
    hasContent = true;
    lines.push("**Open questions:**");
    for (const q of questions) {
      lines.push(`- ${q}`);
    }
  }

  if (!hasContent) {
    lines.push("_None identified._");
  }

  return lines.join("\n").trimEnd();
}

function buildFooter(thread: Thread): string {
  const total = thread.turns.length;
  return [
    "---",
    `_Handoff from **${thread.provider}** · ${total} turn${total === 1 ? "" : "s"} total._`,
    `_Full context: \`ctx migrate ${thread.id} --format=agents-md\`_`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract question-like lines from the last substantive assistant message. */
function extractOpenQuestions(thread: Thread): string[] {
  const SUBSTANCE_THRESHOLD = 80;
  const questions: string[] = [];

  for (let i = thread.turns.length - 1; i >= 0; i--) {
    const turn = thread.turns[i];
    if (!turn || turn.role !== "assistant") continue;

    for (const item of [...turn.items].reverse()) {
      if (item.type !== "text" || item.text.trim().length < SUBSTANCE_THRESHOLD) continue;

      for (const line of item.text.split("\n")) {
        const t = line.trim();
        if (!t.endsWith("?")) continue;
        if (t.length < 15 || t.length > 300) continue;
        if (/^(what|which|how|why|when|where|should|can|could|would|do you|are you)/i.test(t)) {
          questions.push(truncate(t, 200));
        }
      }

      if (questions.length > 0) return questions.slice(0, 5);
    }
  }

  return questions;
}
