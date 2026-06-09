import { join } from "node:path";
import { homedir } from "node:os";
import { mkdirSync } from "node:fs"; // only for mkdir — no native Bun equivalent yet
import { z } from "zod";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const CodexProviderConfigSchema = z.object({
  executablePath: z.string().optional(),
  experimentalApi: z.boolean().optional(),
});

const ProvidersConfigSchema = z.object({
  codex: CodexProviderConfigSchema.optional(),
});

const DefaultsConfigSchema = z.object({
  inputProvider: z.string().optional(),
  outputProvider: z.string().optional(),
  format: z
    .enum(["agents-md", "markdown", "json", "handoff", "cursor-rules"])
    .optional(),
});

export const ConfigSchema = z.object({
  version: z.literal(1),
  providers: ProvidersConfigSchema.optional(),
  defaults: DefaultsConfigSchema.optional(),
  /** Set to true once first-time setup has been completed */
  setupComplete: z.boolean().optional(),
});

export type Config = z.infer<typeof ConfigSchema>;
export type CodexProviderConfig = z.infer<typeof CodexProviderConfigSchema>;
export type DefaultsConfig = z.infer<typeof DefaultsConfigSchema>;

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

export function getConfigDir(): string {
  const xdg = process.env["XDG_CONFIG_HOME"];
  if (xdg) return join(xdg, "ctx");
  return join(homedir(), ".ctx");
}

export function getConfigPath(): string {
  return join(getConfigDir(), "config.json");
}

// ---------------------------------------------------------------------------
// Load / Save  — fully Bun-native I/O
// ---------------------------------------------------------------------------

const EMPTY_CONFIG: Config = { version: 1 };

export async function loadConfig(): Promise<Config> {
  const file = Bun.file(getConfigPath());

  // BunFile.exists() is the native way to check file existence
  if (!(await file.exists())) return { ...EMPTY_CONFIG };

  try {
    // BunFile.json() reads + parses in one optimised call
    const raw = await file.json() as unknown;
    const parsed = ConfigSchema.safeParse(raw);
    if (parsed.success) return parsed.data;
    return { ...EMPTY_CONFIG };
  } catch {
    return { ...EMPTY_CONFIG };
  }
}

export async function saveConfig(config: Config): Promise<void> {
  // mkdirSync with recursive:true is a no-op when dir already exists
  mkdirSync(getConfigDir(), { recursive: true });
  // Bun.write is the native, heavily optimised file write
  await Bun.write(getConfigPath(), JSON.stringify(config, null, 2) + "\n");
}

export async function patchConfig(patch: Partial<Config>): Promise<Config> {
  const current = await loadConfig();
  const updated: Config = {
    ...current,
    ...patch,
    providers: { ...current.providers, ...patch.providers },
    defaults: { ...current.defaults, ...patch.defaults },
  };
  await saveConfig(updated);
  return updated;
}

// ---------------------------------------------------------------------------
// Helpers to resolve effective values (config < env < flag)
// ---------------------------------------------------------------------------

export function resolveCodexPath(config: Config, flagValue?: string): string | undefined {
  return (
    flagValue ??
    process.env["CODEX_CLI_PATH"] ??
    config.providers?.codex?.executablePath
  );
}

export function resolveInputProviderFlag(
  flags: Record<string, string | boolean>
): string | undefined {
  const from = flags["from"];
  const provider = flags["provider"];
  if (typeof from === "string") return from;
  if (typeof provider === "string") return provider;
  return undefined;
}

export function resolveDefaultInputProvider(config: Config, flagValue?: string): string {
  return flagValue ?? config.defaults?.inputProvider ?? "codex";
}

export function resolveDefaultOutputProvider(config: Config, flagValue?: string): string {
  return flagValue ?? config.defaults?.outputProvider ?? "cursor";
}

export function resolveDefaultFormat(
  config: Config,
  flagValue?: string
): "agents-md" | "markdown" | "json" | "handoff" | "cursor-rules" {
  const v = flagValue ?? config.defaults?.format ?? "agents-md";
  if (
    v === "markdown" ||
    v === "json" ||
    v === "handoff" ||
    v === "cursor-rules"
  ) {
    return v;
  }
  return "agents-md";
}

export function isFirstRun(config: Config): boolean {
  return !config.setupComplete;
}
