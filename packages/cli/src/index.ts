#!/usr/bin/env bun

import { registry } from "@ctx/core";
import { CodexProvider } from "@ctx/provider-codex";
import { CursorProvider } from "@ctx/provider-cursor";

import { parseArgs } from "./args.ts";
import { commandList } from "./commands/list.ts";
import { commandRead } from "./commands/read.ts";
import { commandExport } from "./commands/export.ts";
import { commandMigrate } from "./commands/migrate.ts";
import { commandSetup } from "./commands/setup.ts";
import { log, info, die, fmt } from "./output.ts";
import {
  loadConfig,
  isFirstRun,
  resolveCodexPath,
  getConfigPath,
} from "./config.ts";

// ---------------------------------------------------------------------------
// Load config (always, before anything else)
// ---------------------------------------------------------------------------

const config = await loadConfig();

// ---------------------------------------------------------------------------
// Register built-in providers (using config for paths/options)
// ---------------------------------------------------------------------------

registry.registerInput(
  new CodexProvider({
    executablePath: resolveCodexPath(config),
    experimentalApi: config.providers?.codex?.experimentalApi,
  })
);
registry.registerOutput(new CursorProvider());

// ---------------------------------------------------------------------------
// Parse args
// ---------------------------------------------------------------------------

const args = parseArgs(process.argv.slice(2));

// ---------------------------------------------------------------------------
// Help shortcut
// ---------------------------------------------------------------------------

if (args.flags["help"] || args.flags["h"]) {
  printHelp();
  process.exit(0);
}

// ---------------------------------------------------------------------------
// No command → show help (with first-run hint if applicable)
// ---------------------------------------------------------------------------

if (!args.command) {
  if (isFirstRun(config) && process.stdout.isTTY) {
    log("");
    log(
      `${fmt.bold("Welcome to ctx!")} It looks like this is your first time running it.`
    );
    log(
      `Run ${fmt.bold("ctx setup")} to configure your providers, or jump straight in:`
    );
  }
  printHelp();
  process.exit(1);
}

// ---------------------------------------------------------------------------
// First-run guard — auto-trigger setup for real commands (not setup itself)
// ---------------------------------------------------------------------------

if (
  isFirstRun(config) &&
  args.command !== "setup" &&
  args.command !== "--help" &&
  process.stdout.isTTY &&
  process.stdin.isTTY
) {
  log("");
  log(fmt.yellow("⚠") + "  " + fmt.bold("ctx has not been configured yet."));
  log(fmt.dim(`   Config file: ${getConfigPath()}`));
  log("");
  info(`Run ${fmt.bold("ctx setup")} first, or pass ${fmt.bold("--provider")} and ${fmt.bold("--from")} flags manually.`);
  log("");

  const { promptConfirm } = await import("./prompt.ts");
  const run = await promptConfirm("Run setup now?", true);
  if (run) {
    await commandSetup({ command: "setup", positional: [], flags: {} });
    log("");
  }
}

// ---------------------------------------------------------------------------
// Command dispatch
// ---------------------------------------------------------------------------

try {
  switch (args.command) {
    case "setup":
      await commandSetup(args);
      break;

    case "list":
      await commandList(args);
      break;

    case "read":
      await commandRead(args);
      break;

    case "export":
      await commandExport(args);
      break;

    case "migrate":
      await commandMigrate(args);
      break;

    default:
      die(`Unknown command: "${args.command}". Run ${fmt.bold("ctx --help")} for usage.`);
  }
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  die(`Error: ${message}`);
}

// ---------------------------------------------------------------------------
// Help text
// ---------------------------------------------------------------------------

function printHelp(): void {
  log(`
${fmt.bold("ctx")} — AI Context Migration CLI

${fmt.bold("USAGE")}
  ctx <command> [options]

${fmt.bold("COMMANDS")}
  ${fmt.cyan("setup")}    Configure providers and preferences  ${fmt.dim("← start here")}
  ${fmt.cyan("list")}     List threads from an AI provider
  ${fmt.cyan("read")}     Read and display a thread
  ${fmt.cyan("export")}   Export a thread as canonical JSON
  ${fmt.cyan("migrate")}  Migrate a thread to another AI's format

${fmt.bold("COMMON FLAGS")}
  --provider=<id>   Input provider  ${fmt.dim(`(configured: ${config.defaults?.inputProvider ?? "codex"})`)}
  --from=<id>       Input provider for migrate/export
  --to=<id>         Output provider for migrate  ${fmt.dim(`(configured: ${config.defaults?.outputProvider ?? "cursor"})`)}
  --format=<fmt>    Output format: agents-md | markdown | json  ${fmt.dim(`(configured: ${config.defaults?.format ?? "agents-md"})`)}
  --out=<path>      Output directory or file path
  --json            Print raw JSON output
  --help            Show this help

${fmt.bold("EXAMPLES")}
  ${fmt.dim("# First-time configuration")}
  ctx setup

  ${fmt.dim("# List all Codex threads")}
  ctx list

  ${fmt.dim("# Migrate a thread to AGENTS.md for Cursor")}
  ctx migrate abc123 --from=codex --to=cursor

  ${fmt.dim("# Batch migrate all threads")}
  ctx migrate --all --from=codex --to=cursor --out=./context/

${fmt.bold("PROVIDERS")}
  Input:   ${registry.listInputs().map((p) => fmt.cyan(p.id)).join(", ")}
  Output:  ${registry.listOutputs().map((p) => fmt.cyan(p.id)).join(", ")}

${fmt.bold("CONFIG")}
  ${fmt.dim(getConfigPath())}
  Run ${fmt.bold("ctx setup --force")} to reconfigure.
`);
}
