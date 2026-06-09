import type { Thread } from "@ctx/core";
import {
  AGENTS_MD_DEFAULTS,
  buildCommands,
  buildCurrentState,
  buildFilesChanged,
  buildTask,
  buildTodo,
} from "./agents-md.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CursorRuleFile {
  filename: string;
  content: string;
}

export interface CursorRulesOptions {
  /** Max chars per file including frontmatter. Defaults to 2 500. */
  budget?: number;
  /**
   * "compact" (default) — filtered sections sized for rule files.
   * "full"              — no filtering; sections may split across multiple files.
   */
  mode?: "compact" | "full";
}

const DEFAULT_BUDGET = 2_500;
const UNLIMITED = 999_999_999;

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function generateCursorRules(
  thread: Thread,
  opts: CursorRulesOptions = {}
): CursorRuleFile[] {
  const full = opts.mode === "full";
  const budget = opts.budget ?? DEFAULT_BUDGET;
  const lim = full
    ? {
        requestChars: UNLIMITED,
        lastMsgChars: UNLIMITED,
        diffLines: UNLIMITED,
        diffsShown: UNLIMITED,
        filesListed: UNLIMITED,
        commands: UNLIMITED,
      }
    : {
        requestChars: AGENTS_MD_DEFAULTS.requestChars,
        lastMsgChars: AGENTS_MD_DEFAULTS.lastMsgChars,
        diffLines: AGENTS_MD_DEFAULTS.diffLines,
        diffsShown: AGENTS_MD_DEFAULTS.diffsShown,
        filesListed: AGENTS_MD_DEFAULTS.filesListed,
        commands: AGENTS_MD_DEFAULTS.commands,
      };

  const sections: Array<{ baseName: string; description: string; body: string }> = [];

  const task = buildTask(thread, lim.requestChars, !full);
  if (task) {
    sections.push({
      baseName: "ctx-task",
      description: "Migrated task objective from ctx",
      body: stripHeading(task, "Task"),
    });
  }

  const state = buildCurrentState(thread, lim.lastMsgChars);
  if (state) {
    sections.push({
      baseName: "ctx-state",
      description: "Current state from migrated ctx thread",
      body: stripHeading(state, "Current State"),
    });
  }

  const files = buildFilesChanged(thread, lim.filesListed, lim.diffsShown, lim.diffLines);
  if (files) {
    sections.push({
      baseName: "ctx-files",
      description: "Files changed in migrated ctx thread",
      body: stripHeading(files, "Files Changed"),
    });
  }

  const commands = buildCommands(thread, lim.commands, full);
  if (commands) {
    sections.push({
      baseName: "ctx-commands",
      description: "Commands executed in migrated ctx thread",
      body: stripHeading(commands, "Commands Executed"),
    });
  }

  const todo = buildTodo(thread);
  if (todo) {
    sections.push({
      baseName: "ctx-plan",
      description: "Plan status from migrated ctx thread",
      body: stripHeading(todo, "Plan Status"),
    });
  }

  const filesOut: CursorRuleFile[] = [];
  for (const section of sections) {
    filesOut.push(...makeRuleFiles(section.baseName, section.body, section.description, budget));
  }

  return filesOut;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stripHeading(section: string, heading: string): string {
  const prefix = `## ${heading}\n\n`;
  return section.startsWith(prefix) ? section.slice(prefix.length).trimEnd() : section.trimEnd();
}

function makeRuleFiles(
  baseName: string,
  body: string,
  description: string,
  budget: number
): CursorRuleFile[] {
  const frontmatter = `---\ndescription: "${escapeYaml(description)}"\nalwaysApply: false\n---\n\n`;
  const maxBody = Math.max(200, budget - frontmatter.length);
  const chunks = splitContent(body, maxBody);

  return chunks.map((chunk, i) => ({
    filename: chunks.length > 1 ? `${baseName}-${i + 1}.mdc` : `${baseName}.mdc`,
    content: frontmatter + chunk + "\n",
  }));
}

function escapeYaml(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function splitContent(body: string, maxBodyChars: number): string[] {
  if (body.length <= maxBodyChars) return [body];

  const chunks: string[] = [];
  const lines = body.split("\n");
  let current = "";

  for (const line of lines) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length > maxBodyChars && current) {
      chunks.push(current.trimEnd());
      current = line;
    } else {
      current = next;
    }
  }

  if (current) chunks.push(current.trimEnd());
  return chunks.length > 0 ? chunks : [body.slice(0, maxBodyChars)];
}
