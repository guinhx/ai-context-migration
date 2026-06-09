// ---------------------------------------------------------------------------
// Minimal argv parser — no external deps
// ---------------------------------------------------------------------------

export interface ParsedArgs {
  command: string | undefined;
  positional: string[];
  flags: Record<string, string | boolean>;
}

/**
 * Parse `process.argv.slice(2)` into a simple structured form.
 *
 * Supported syntax:
 *   --flag            → { flag: true }
 *   --flag=value      → { flag: "value" }
 *   --flag value      → { flag: "value" }  (only if value doesn't start with --)
 *   positional args   → positional[]
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i] ?? "";

    if (arg.startsWith("--")) {
      const eqIdx = arg.indexOf("=");
      if (eqIdx !== -1) {
        const key = arg.slice(2, eqIdx);
        const value = arg.slice(eqIdx + 1);
        flags[key] = value;
      } else {
        const key = arg.slice(2);
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith("--")) {
          flags[key] = next;
          i += 1;
        } else {
          flags[key] = true;
        }
      }
    } else {
      positional.push(arg);
    }

    i += 1;
  }

  const [command, ...rest] = positional;
  return { command, positional: rest, flags };
}

export function getFlag(flags: Record<string, string | boolean>, key: string): string | undefined {
  const v = flags[key];
  return typeof v === "string" ? v : undefined;
}

export function getBoolFlag(flags: Record<string, string | boolean>, key: string): boolean {
  return flags[key] === true || flags[key] === "true";
}

export function getNumberFlag(
  flags: Record<string, string | boolean>,
  key: string,
  defaultValue: number
): number {
  const v = flags[key];
  if (typeof v === "string") {
    const n = parseInt(v, 10);
    return isNaN(n) ? defaultValue : n;
  }
  return defaultValue;
}
