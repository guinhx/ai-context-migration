import type { ParsedArgs } from "../args.ts";
import { getFlag, getBoolFlag } from "../args.ts";
import { registry } from "@ctx/core";
import type { Thread, Turn, TurnItem } from "@ctx/core";
import { log, info, die, fmt } from "../output.ts";
import { loadConfig, resolveDefaultInputProvider, resolveInputProviderFlag } from "../config.ts";

export async function commandRead(args: ParsedArgs): Promise<void> {
  const threadId = args.positional[0] ?? getFlag(args.flags, "id");
  if (!threadId) {
    die("Usage: ctx read <thread-id> [--from=codex|claude|cursor] [--json]");
  }

  const config = await loadConfig();
  const providerId = resolveDefaultInputProvider(config, resolveInputProviderFlag(args.flags));
  const jsonOutput = getBoolFlag(args.flags, "json");

  let provider;
  try {
    provider = registry.getInput(providerId);
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

  if (jsonOutput) {
    log(JSON.stringify(thread, null, 2));
    return;
  }

  printThread(thread);
}

function printThread(thread: Thread): void {
  log("");
  log(fmt.bold(`Thread: ${thread.title ?? "(untitled)"}`));
  log(fmt.dim(`ID: ${thread.id} · Provider: ${thread.provider}`));
  if (thread.cwd) log(fmt.dim(`CWD: ${thread.cwd}`));
  if (thread.model) log(fmt.dim(`Model: ${thread.model}`));
  log("");

  for (const turn of thread.turns) {
    printTurn(turn);
    log("");
  }

  log(fmt.dim(`— ${thread.turns.length} turn(s) total`));
}

function printTurn(turn: Turn): void {
  const roleLabel =
    turn.role === "user"
      ? fmt.cyan(fmt.bold("USER"))
      : fmt.green(fmt.bold("ASSISTANT"));

  const statusStr =
    turn.status && turn.status !== "completed"
      ? fmt.dim(` [${turn.status}]`)
      : "";

  log(`${roleLabel}${statusStr}`);

  for (const item of turn.items) {
    printItem(item);
  }
}

function printItem(item: TurnItem): void {
  switch (item.type) {
    case "text":
      log(item.text);
      break;

    case "reasoning":
      log(fmt.dim(`[reasoning] ${item.text.split("\n")[0] ?? ""}…`));
      break;

    case "file_change":
      log(
        fmt.yellow(`  📄 ${item.changeKind ?? "modified"}: ${item.path}`) +
          (item.diff ? fmt.dim(` (${countLines(item.diff)} lines diff)`) : "")
      );
      break;

    case "command":
      log(fmt.yellow(`  ⚡ $ ${item.command}`));
      if (item.output) {
        const preview = item.output.split("\n").slice(0, 5).join("\n");
        log(fmt.dim(indent(preview, "    ")));
      }
      break;

    case "tool_call":
      log(fmt.dim(`  🔧 ${item.tool}`));
      break;

    case "web_search":
      log(fmt.dim(`  🔍 ${item.query}`));
      break;

    case "image":
      log(fmt.dim(`  🖼  [image: ${item.url}]`));
      break;

    case "todo_list": {
      if (item.explanation) log(item.explanation);
      for (const { step, status } of item.steps) {
        const icon = status === "completed" ? "✓" : "○";
        log(`  ${icon} ${step}`);
      }
      break;
    }
  }
}

function countLines(s: string): number {
  return s.split("\n").length;
}

function indent(s: string, prefix: string): string {
  return s
    .split("\n")
    .map((l) => prefix + l)
    .join("\n");
}
