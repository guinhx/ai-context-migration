import { resolve } from "node:path";
import type { ParsedArgs } from "../args.ts";
import { getFlag, getBoolFlag, getNumberFlag } from "../args.ts";
import { registry } from "@ctx/core";
import type { Thread, WriteOptions } from "@ctx/core";
import { log, info, success, warn, error, die, fmt } from "../output.ts";
import {
  loadConfig,
  resolveDefaultInputProvider,
  resolveDefaultOutputProvider,
  resolveDefaultFormat,
} from "../config.ts";

export async function commandMigrate(args: ParsedArgs): Promise<void> {
  const config = await loadConfig();
  const fromId = resolveDefaultInputProvider(config, getFlag(args.flags, "from"));
  const toId = resolveDefaultOutputProvider(config, getFlag(args.flags, "to"));
  const outDir = getFlag(args.flags, "out") ?? ".";
  const format = resolveDefaultFormat(config, getFlag(args.flags, "format")) as WriteOptions["format"];
  const migrateAll = getBoolFlag(args.flags, "all");
  const threadId = args.positional[0] ?? getFlag(args.flags, "id");

  // agents-md output controls
  const full = getBoolFlag(args.flags, "full");
  const budgetKb = getNumberFlag(args.flags, "budget", 0);

  if (!migrateAll && !threadId) {
    die(
      "Usage:\n" +
        "  ctx migrate <thread-id> --from=codex --to=cursor\n" +
        "                          [--format=agents-md|markdown|json|handoff|cursor-rules]\n" +
        "                          [--out=./] [--full] [--budget=<KB>]\n" +
        "  ctx migrate --all --from=codex --to=cursor [--format=agents-md] [--out=./]\n" +
        "\n" +
        "  --full          No filtering or truncation (complete history)\n" +
        "  --budget=<KB>   Custom size cap for agents-md compact mode (default: 32)"
    );
  }

  let inputProvider;
  let outputProvider;

  try {
    inputProvider = registry.getInput(fromId);
  } catch (e) {
    die(String(e));
  }

  try {
    outputProvider = registry.getOutput(toId);
  } catch (e) {
    die(String(e));
  }

  const absOutDir = resolve(outDir);
  const writeOpts: WriteOptions = {
    outDir: absOutDir,
    format,
    agentsMdMode: full ? "full" : "compact",
    agentsMdBudget: budgetKb > 0 ? budgetKb * 1024 : undefined,
  };

  if (migrateAll) {
    await migrateAllThreads(inputProvider, outputProvider, writeOpts);
  } else {
    await migrateSingleThread(threadId!, inputProvider, outputProvider, writeOpts);
  }
}

// ---------------------------------------------------------------------------
// Single thread migration
// ---------------------------------------------------------------------------

async function migrateSingleThread(
  threadId: string,
  input: ReturnType<typeof registry.getInput>,
  output: ReturnType<typeof registry.getOutput>,
  opts: WriteOptions
): Promise<void> {
  info(
    `Migrating thread ${fmt.bold(threadId)} from ${fmt.bold(input.name)} → ${fmt.bold(output.name)}…`
  );

  let thread: Thread;
  try {
    thread = await input.readThread(threadId);
  } finally {
    await input.close();
  }

  const result = await output.write(thread, opts);
  for (const file of result.files) {
    success(`Written → ${fmt.bold(file)}`);
  }
}

// ---------------------------------------------------------------------------
// Batch migration
// ---------------------------------------------------------------------------

async function migrateAllThreads(
  input: ReturnType<typeof registry.getInput>,
  output: ReturnType<typeof registry.getOutput>,
  opts: WriteOptions
): Promise<void> {
  info(`Listing all threads from ${fmt.bold(input.name)}…`);

  const summaries = await input.listThreads({ limit: 50, maxPages: 20 });
  log(fmt.dim(`  Found ${summaries.length} thread(s).`));

  let ok = 0;
  let fail = 0;

  for (const summary of summaries) {
    const label = fmt.bold(summary.title ?? summary.preview ?? summary.id);
    try {
      info(`  Migrating ${label}…`);
      const thread = await input.readThread(summary.id);
      const result = await output.write(thread, opts);
      for (const file of result.files) {
        success(`    → ${file}`);
      }
      ok += 1;
    } catch (err) {
      error(`    Failed: ${String(err)}`);
      fail += 1;
    }
  }

  await input.close();

  log("");
  if (ok > 0) success(`${ok} thread(s) migrated successfully.`);
  if (fail > 0) warn(`${fail} thread(s) failed.`);
}
