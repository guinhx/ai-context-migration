import * as readline from "node:readline";
import { fmt } from "./output.ts";

// ---------------------------------------------------------------------------
// Primitives — all read from process.stdin, write to process.stdout
// ---------------------------------------------------------------------------

// ANSI escape codes for cursor and line control
const ESC = "\x1b[";
const CLEAR_LINE = `\r${ESC}2K`;
const CURSOR_UP = (n: number) => `${ESC}${n}A`;
const HIDE_CURSOR = `${ESC}?25l`;
const SHOW_CURSOR = `${ESC}?25h`;

function write(s: string): void {
  process.stdout.write(s);
}

// ---------------------------------------------------------------------------
// promptText — single-line text input with optional default
// ---------------------------------------------------------------------------

export async function promptText(
  message: string,
  options: {
    default?: string;
    hint?: string;
    // validate can be sync or async
    validate?: (v: string) => string | null | Promise<string | null>;
  } = {}
): Promise<string> {
  const hint = options.default
    ? fmt.dim(` (${options.hint ?? options.default})`)
    : options.hint
      ? fmt.dim(` (${options.hint})`)
      : "";

  return new Promise<string>((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    const ask = (): void => {
      rl.question(`  ${fmt.cyan("?")} ${message}${hint}: `, (answer) => {
        const value = answer.trim() || options.default || "";

        if (options.validate) {
          void Promise.resolve(options.validate(value)).then((err) => {
            if (err) {
              write(`  ${fmt.red("✗")} ${err}\n`);
              ask();
              return;
            }
            rl.close();
            resolve(value);
          });
        } else {
          rl.close();
          resolve(value);
        }
      });
    };

    ask();
  });
}

// ---------------------------------------------------------------------------
// promptConfirm — y/n prompt
// ---------------------------------------------------------------------------

export async function promptConfirm(
  message: string,
  defaultValue = true
): Promise<boolean> {
  const hint = defaultValue ? fmt.dim("Y/n") : fmt.dim("y/N");

  return new Promise<boolean>((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    rl.question(`  ${fmt.cyan("?")} ${message} ${hint}: `, (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      if (!trimmed) return resolve(defaultValue);
      resolve(trimmed === "y" || trimmed === "yes");
    });
  });
}

// ---------------------------------------------------------------------------
// promptSelect — arrow-key navigable option list
// ---------------------------------------------------------------------------

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  description?: string;
}

export async function promptSelect<T extends string>(
  message: string,
  options: SelectOption<T>[],
  defaultValue?: T
): Promise<T> {
  if (options.length === 0) {
    throw new Error("promptSelect requires at least one option");
  }

  let selected = Math.max(
    0,
    options.findIndex((o) => o.value === defaultValue)
  );

  // Fallback: if TTY is not interactive, just return default
  if (!process.stdin.isTTY) {
    return options[selected]?.value ?? (options[0]!.value);
  }

  const render = (initial: boolean): void => {
    if (!initial) {
      // Move cursor up to overwrite previously rendered lines
      write(CURSOR_UP(options.length + 1));
    }

    write(`${CLEAR_LINE}  ${fmt.cyan("?")} ${message}\n`);

    for (let i = 0; i < options.length; i++) {
      const opt = options[i]!;
      const isSelected = i === selected;
      const pointer = isSelected ? fmt.cyan("❯") : " ";
      const label = isSelected ? fmt.bold(opt.label) : opt.label;
      const desc = opt.description ? fmt.dim(`  ${opt.description}`) : "";
      write(`${CLEAR_LINE}  ${pointer} ${label}${desc}\n`);
    }
  };

  return new Promise<T>((resolve) => {
    write(HIDE_CURSOR);
    render(true);

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    const onData = (key: string): void => {
      // Ctrl+C
      if (key === "\u0003") {
        write(SHOW_CURSOR);
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.exit(130);
      }

      // Up arrow: \x1b[A  or  k
      if (key === "\x1b[A" || key === "k") {
        selected = (selected - 1 + options.length) % options.length;
        render(false);
        return;
      }

      // Down arrow: \x1b[B  or  j
      if (key === "\x1b[B" || key === "j") {
        selected = (selected + 1) % options.length;
        render(false);
        return;
      }

      // Enter or Space
      if (key === "\r" || key === "\n" || key === " ") {
        write(SHOW_CURSOR);
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener("data", onData);

        const chosen = options[selected]!;
        // Rewrite last selected as confirmed
        write(CURSOR_UP(options.length + 1));
        write(`${CLEAR_LINE}  ${fmt.green("✓")} ${message}: ${fmt.bold(chosen.label)}\n`);
        for (let i = 0; i < options.length; i++) {
          write(`${CLEAR_LINE}`);
          if (i < options.length - 1) write("\n");
        }
        write("\n");

        resolve(chosen.value);
      }
    };

    process.stdin.on("data", onData);
  });
}

// ---------------------------------------------------------------------------
// promptPath — file path with existence check option
// ---------------------------------------------------------------------------

export async function promptPath(
  message: string,
  options: {
    default?: string;
    mustExist?: boolean;
    hint?: string;
  } = {}
): Promise<string> {
  return promptText(message, {
    default: options.default,
    hint: options.hint,
    // async validate using Bun.file().exists() — no node:fs needed
    validate: async (v) => {
      if (!v) return "Path cannot be empty";
      if (options.mustExist && !(await Bun.file(v).exists())) {
        return `File not found: ${v}`;
      }
      return null;
    },
  });
}
