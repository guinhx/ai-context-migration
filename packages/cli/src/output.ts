// ---------------------------------------------------------------------------
// Terminal output helpers
// ---------------------------------------------------------------------------

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const RED = "\x1b[31m";
const GREY = "\x1b[90m";

function isColorSupported(): boolean {
  return Boolean(process.stdout.isTTY) && process.env["NO_COLOR"] === undefined;
}

function c(code: string, text: string): string {
  if (!isColorSupported()) return text;
  return `${code}${text}${RESET}`;
}

export const fmt = {
  bold: (s: string) => c(BOLD, s),
  dim: (s: string) => c(DIM, s),
  green: (s: string) => c(GREEN, s),
  yellow: (s: string) => c(YELLOW, s),
  cyan: (s: string) => c(CYAN, s),
  red: (s: string) => c(RED, s),
  grey: (s: string) => c(GREY, s),
};

export function log(...args: unknown[]): void {
  console.log(...args);
}

export function info(message: string): void {
  console.log(fmt.cyan("ℹ"), message);
}

export function success(message: string): void {
  console.log(fmt.green("✓"), message);
}

export function warn(message: string): void {
  console.warn(fmt.yellow("⚠"), message);
}

export function error(message: string): void {
  console.error(fmt.red("✗"), message);
}

export function die(message: string, code = 1): never {
  error(message);
  process.exit(code);
}

// ---------------------------------------------------------------------------
// Table printer
// ---------------------------------------------------------------------------

export function printTable(rows: Record<string, string>[]): void {
  if (rows.length === 0) {
    log(fmt.dim("(no results)"));
    return;
  }

  const headers = Object.keys(rows[0] ?? {});
  const widths = headers.map((h) =>
    Math.max(h.length, ...rows.map((r) => (r[h] ?? "").length))
  );

  const divider = widths.map((w) => "─".repeat(w + 2)).join("┼");
  const header = headers
    .map((h, i) => fmt.bold(h.padEnd(widths[i] ?? h.length)))
    .map((h) => ` ${h} `)
    .join("│");

  log(header);
  log(fmt.dim(divider));

  for (const row of rows) {
    const line = headers
      .map((h, i) => ` ${(row[h] ?? "").padEnd(widths[i] ?? 0)} `)
      .join(fmt.dim("│"));
    log(line);
  }
}
