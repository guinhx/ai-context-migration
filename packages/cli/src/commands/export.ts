import { resolve } from "node:path";
import type { ParsedArgs } from "../args.ts";
import { getFlag } from "../args.ts";
import { registry } from "@ctx/core";
import type { Thread } from "@ctx/core";
import { log, info, success, die, fmt } from "../output.ts";
import { loadConfig, resolveDefaultInputProvider } from "../config.ts";

export async function commandExport(args: ParsedArgs): Promise<void> {
  const threadId = args.positional[0] ?? getFlag(args.flags, "id");
  if (!threadId) {
    die("Usage: ctx export <thread-id> --from=codex [--out=file.json]");
  }

  const config = await loadConfig();
  const fromId = resolveDefaultInputProvider(config, getFlag(args.flags, "from"));
  const outPath =
    getFlag(args.flags, "out") ??
    `thread-${threadId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 32)}.json`;

  let provider;
  try {
    provider = registry.getInput(fromId);
  } catch (e) {
    die(String(e));
  }

  info(`Reading thread ${fmt.bold(threadId)} from ${fmt.bold(provider.name)}…`);

  let thread: Thread;
  try {
    thread = await provider.readThread(threadId);
  } finally {
    await provider.close();
  }

  const absPath = resolve(outPath);
  await Bun.write(absPath, JSON.stringify(thread, null, 2));

  success(`Exported canonical JSON → ${fmt.bold(absPath)}`);
  log(
    fmt.dim(
      `  ${thread.turns.length} turn(s) · ${countItems(thread)} item(s)`
    )
  );
}

function countItems(thread: Thread): number {
  return thread.turns.reduce((n, t) => n + t.items.length, 0);
}
