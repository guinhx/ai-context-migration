import { existsSync } from "node:fs";
import type { ParsedArgs } from "../args.ts";
import { getBoolFlag } from "../args.ts";
import {
  loadConfig,
  saveConfig,
  getConfigPath,
  type Config,
} from "../config.ts";
import { promptText, promptSelect, promptConfirm, promptPath } from "../prompt.ts";
import { log, info, success, warn, fmt } from "../output.ts";
import { resolveCodexExecutablePath } from "@ctx/provider-codex";

// ---------------------------------------------------------------------------
// Available providers registry (for the wizard)
// ---------------------------------------------------------------------------

const INPUT_PROVIDERS = [
  {
    value: "codex" as const,
    label: "OpenAI Codex",
    description: "Reads threads via codex app-server (JSON-RPC)",
  },
  {
    value: "claude" as const,
    label: "Claude Code (experimental)",
    description: "Reads sessions from ~/.claude/projects/**/*.jsonl — format may change",
  },
  {
    value: "cursor" as const,
    label: "Cursor",
    description: "Reads agent transcripts (JSONL + SQLite metadata)",
  },
];

const OUTPUT_PROVIDERS = [
  {
    value: "cursor" as const,
    label: "Cursor",
    description: "Generates AGENTS.md / Markdown for Cursor",
  },
];

const FORMATS = [
  {
    value: "agents-md" as const,
    label: "agents-md",
    description: "AGENTS.md — distilled context file (recommended for Cursor)",
  },
  {
    value: "handoff" as const,
    label: "handoff",
    description: "HANDOFF.md — Objective / Done / Next / Blockers",
  },
  {
    value: "cursor-rules" as const,
    label: "cursor-rules",
    description: ".cursor/rules/*.mdc — split context for Cursor rules",
  },
  {
    value: "markdown" as const,
    label: "markdown",
    description: "Full conversation as readable Markdown",
  },
  {
    value: "json" as const,
    label: "json",
    description: "Portable canonical JSON — use to build other integrations",
  },
];

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export async function commandSetup(args: ParsedArgs): Promise<void> {
  const force = getBoolFlag(args.flags, "force");
  const existing = await loadConfig();

  if (existing.setupComplete && !force) {
    log("");
    info(`ctx is already configured. Run ${fmt.bold("ctx setup --force")} to reconfigure.`);
    log(fmt.dim(`  Config: ${getConfigPath()}`));
    log("");

    const rerun = await promptConfirm("Re-run setup anyway?", false);
    if (!rerun) return;
  }

  printBanner();

  // -------------------------------------------------------------------------
  // Step 1: Codex executable
  // -------------------------------------------------------------------------
  printStep(1, 4, "Codex executable");

  const detected = resolveCodexExecutablePath();
  const isAutoDetected = detected !== "codex" && existsSync(detected);

  if (isAutoDetected) {
    success(`Detected: ${fmt.bold(detected)}`);
  } else {
    warn("Could not auto-detect Codex. Please install it from openai.com/codex");
    log(fmt.dim("  You can also set CODEX_CLI_PATH to point to the binary."));
  }

  log("");

  const codexPath = await promptPath("Path to codex executable", {
    default: isAutoDetected ? detected : undefined,
    hint: isAutoDetected ? detected : "e.g. C:\\...\\codex.exe or /usr/local/bin/codex",
    mustExist: false, // allow non-existing so user can configure before installing
  });

  const codexExists = existsSync(codexPath);
  if (!codexExists) {
    warn(`File not found at ${fmt.bold(codexPath)} — saved anyway. Update when Codex is installed.`);
  } else {
    success(`Codex found at ${fmt.bold(codexPath)}`);
  }

  // -------------------------------------------------------------------------
  // Step 2: Default input provider
  // -------------------------------------------------------------------------
  printStep(2, 4, "Default input provider");

  const inputProvider = await promptSelect(
    "Which AI to read threads from",
    INPUT_PROVIDERS,
    "codex"
  );

  // -------------------------------------------------------------------------
  // Step 3: Default output format
  // -------------------------------------------------------------------------
  printStep(3, 4, "Default output format");

  log(fmt.dim("  This is what ctx migrate will produce when --format is not specified.\n"));

  const format = await promptSelect("Default output format", FORMATS, "agents-md");

  // -------------------------------------------------------------------------
  // Step 4: Test connection
  // -------------------------------------------------------------------------
  printStep(4, 4, "Test connection");

  let testedOk = false;

  if (codexExists) {
    const doTest = await promptConfirm("Test connection to Codex now?", true);

    if (doTest) {
      log("");
      info("Launching codex app-server…");
      testedOk = await testCodexConnection(codexPath);
    }
  } else {
    log(fmt.dim("  Skipping connection test (binary not found)."));
  }

  // -------------------------------------------------------------------------
  // Save config
  // -------------------------------------------------------------------------
  const config: Config = {
    version: 1,
    setupComplete: true,
    providers: {
      codex: {
        executablePath: codexPath,
      },
    },
    defaults: {
      inputProvider,
      outputProvider: "cursor",
      format,
    },
  };

  await saveConfig(config);

  log("");
  success(`Configuration saved → ${fmt.bold(getConfigPath())}`);
  log("");

  printNextSteps(testedOk);
}

// ---------------------------------------------------------------------------
// Test Codex connection
// ---------------------------------------------------------------------------

async function testCodexConnection(executablePath: string): Promise<boolean> {
  const { AppServerTransport } = await import("@ctx/provider-codex");
  const { AppServerClient } = await import("@ctx/provider-codex");

  const transport = new AppServerTransport({
    executablePath,
    requestTimeoutMs: 15_000,
    onStderr: () => {}, // silence codex stderr during test
  });

  const client = new AppServerClient(transport);

  try {
    const result = await client.listThreads({ limit: 3 });
    const count = result.data.length;
    success(
      `Connected! Found ${fmt.bold(String(count))} thread${count === 1 ? "" : "s"} ` +
        fmt.dim("(showing first 3)")
    );

    for (const t of result.data) {
      const title = t.name ?? t.preview ?? "(untitled)";
      log(fmt.dim(`  · ${title.slice(0, 72)}`));
    }

    return true;
  } catch (err) {
    warn(`Connection failed: ${String(err)}`);
    log(fmt.dim("  Make sure Codex is installed and you are logged in."));
    return false;
  } finally {
    await client.close();
  }
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

function printBanner(): void {
  const line = "─".repeat(44);
  log("");
  log(fmt.cyan(`  ╭${line}╮`));
  log(fmt.cyan("  │") + fmt.bold("   ctx  ·  AI Context Migration CLI        ") + fmt.cyan("│"));
  log(fmt.cyan("  │") + fmt.dim("   First-time setup                        ") + fmt.cyan("│"));
  log(fmt.cyan(`  ╰${line}╯`));
  log("");
}

function printStep(step: number, total: number, title: string): void {
  log("");
  log(
    `${fmt.dim(`Step ${step}/${total}`)} ${fmt.bold(`· ${title}`)}`
  );
  log(fmt.dim("  " + "─".repeat(38)));
  log("");
}

function printNextSteps(connected: boolean): void {
  log(`${fmt.bold("You're all set!")} Try:`);
  log("");
  log(`  ${fmt.cyan("ctx list")}                          list your threads`);
  log(
    `  ${fmt.cyan("ctx migrate")} ${fmt.dim("<id>")} ${fmt.dim("--to=cursor")}    migrate a thread to Cursor`
  );
  if (!connected) {
    log("");
    warn("Codex connection was not tested. Run `ctx list` when Codex is ready.");
  }
  log("");
}
