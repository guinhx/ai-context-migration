import { join, resolve } from "node:path";
import type { OutputProvider, Thread, WriteOptions, WriteResult } from "@ctx/core";
import { generateAgentsMd } from "./agents-md.ts";
import { generateCursorRules } from "./cursor-rules.ts";
import { generateHandoffMd } from "./handoff-md.ts";
import { generateMarkdown } from "./markdown.ts";

export class CursorProvider implements OutputProvider {
  readonly id = "cursor";
  readonly name = "Cursor";

  async write(thread: Thread, opts: WriteOptions = {}): Promise<WriteResult> {
    const format = opts.format ?? "agents-md";
    const outDir = resolve(opts.outDir ?? ".");
    const files: string[] = [];

    switch (format) {
      case "agents-md": {
        const content = generateAgentsMd(thread, {
          mode: opts.agentsMdMode ?? "compact",
          budget: opts.agentsMdBudget,
        });
        const filename = `AGENTS-${sanitize(thread.id)}.md`;
        const path = join(outDir, filename);
        await Bun.write(path, content);
        files.push(path);
        break;
      }

      case "markdown": {
        const content = generateMarkdown(thread);
        const filename = `thread-${sanitize(thread.id)}.md`;
        const path = join(outDir, filename);
        await Bun.write(path, content);
        files.push(path);
        break;
      }

      case "json": {
        const content = JSON.stringify(thread, null, 2);
        const filename = `thread-${sanitize(thread.id)}.json`;
        const path = join(outDir, filename);
        await Bun.write(path, content);
        files.push(path);
        break;
      }

      case "handoff": {
        const content = generateHandoffMd(thread);
        const filename = `HANDOFF-${sanitize(thread.id)}.md`;
        const path = join(outDir, filename);
        await Bun.write(path, content);
        files.push(path);
        break;
      }

      case "cursor-rules": {
        const rules = generateCursorRules(thread, {
          mode: opts.agentsMdMode ?? "compact",
          budget: opts.cursorRulesBudget,
        });
        for (const rule of rules) {
          const path = join(outDir, rule.filename);
          await Bun.write(path, rule.content);
          files.push(path);
        }
        break;
      }

      default: {
        throw new Error(`Unknown output format: ${String(format)}`);
      }
    }

    return { files };
  }
}

function sanitize(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}

export { generateAgentsMd } from "./agents-md.ts";
export { generateCursorRules } from "./cursor-rules.ts";
export { generateHandoffMd } from "./handoff-md.ts";
export { generateMarkdown } from "./markdown.ts";
