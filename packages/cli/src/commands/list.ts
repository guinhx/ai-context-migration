import type { ParsedArgs } from "../args.ts";
import { getFlag, getNumberFlag, getBoolFlag } from "../args.ts";
import { registry } from "@ctx/core";
import { log, info, die, printTable, fmt } from "../output.ts";
import type { ThreadSummary } from "@ctx/core";
import { loadConfig, resolveDefaultInputProvider, resolveInputProviderFlag } from "../config.ts";

export async function commandList(args: ParsedArgs): Promise<void> {
  const config = await loadConfig();
  const providerId = resolveDefaultInputProvider(config, resolveInputProviderFlag(args.flags));
  const limit = getNumberFlag(args.flags, "limit", 50);
  const archived = getBoolFlag(args.flags, "archived");
  const jsonOutput = getBoolFlag(args.flags, "json");

  let provider;
  try {
    provider = registry.getInput(providerId);
  } catch (e) {
    die(String(e));
  }

  info(`Listing threads from ${fmt.bold(provider.name)}…`);

  let threads: ThreadSummary[];
  try {
    threads = await provider.listThreads({ limit, archived });
  } finally {
    await provider.close();
  }

  if (jsonOutput) {
    log(JSON.stringify(threads, null, 2));
    return;
  }

  if (threads.length === 0) {
    log(fmt.dim("No threads found."));
    return;
  }

  const rows = threads.map((t) => ({
    ID: t.id.slice(0, 36),
    Title: truncate(t.title ?? t.preview ?? "(untitled)", 48),
    Model: t.model ?? "",
    Updated: t.updatedAt ? formatRelative(t.updatedAt) : "",
    CWD: truncate(t.cwd ?? "", 32),
  }));

  printTable(rows);
  log("");
  log(fmt.dim(`${threads.length} thread(s) from ${provider.name}.`));
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function formatRelative(ts: number): string {
  const ms = ts < 1e12 ? ts * 1000 : ts;
  const diff = Date.now() - ms;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
