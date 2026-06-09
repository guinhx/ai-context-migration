import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import type { ParsedArgs } from "../args.ts";
import { getFlag } from "../args.ts";
import { log, info, warn, error, success, die, fmt } from "../output.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProjectScripts {
  packageScripts: Set<string>;
  makeTargets: Set<string>;
  justRecipes: Set<string>;
}

interface ExtractedRefs {
  npmScripts: Map<string, string[]>;
  makeTargets: Map<string, string[]>;
  justRecipes: Map<string, string[]>;
  dotnetRuns: string[];
  paths: Map<string, string[]>;
}

interface ValidationIssue {
  kind: "missing-script" | "missing-make" | "missing-just" | "dead-path" | "stale-command";
  ref: string;
  source: string;
  detail?: string;
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

export async function commandValidate(args: ParsedArgs): Promise<void> {
  const cwd = process.cwd();
  const fileFlag = getFlag(args.flags, "file");

  const agentsFile = fileFlag
    ? path.resolve(cwd, fileFlag)
    : await resolveAgentsFile(cwd);

  if (!agentsFile) {
    die(
      `No AGENTS.md, HANDOFF.md, or AGENTS*.md found in ${fmt.bold(cwd)}. Pass ${fmt.bold("--file=<path>")}.`
    );
  }

  if (!(await Bun.file(agentsFile).exists())) {
    die(`File not found: ${agentsFile}`);
  }

  const content = await Bun.file(agentsFile).text();
  const relFile = path.relative(cwd, agentsFile) || path.basename(agentsFile);

  info(`Validating ${fmt.bold(relFile)} against project files…`);

  const refs = extractRefs(content, relFile);
  const project = await loadProjectScripts(cwd);
  const issues = await compareRefs(refs, project, cwd);

  printReport(relFile, refs, project, issues);

  if (issues.length > 0) {
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// File resolution
// ---------------------------------------------------------------------------

async function resolveAgentsFile(cwd: string): Promise<string | undefined> {
  const candidates = ["AGENTS.md", "HANDOFF.md", ".cursor/AGENTS.md"];

  for (const name of candidates) {
    const full = path.join(cwd, name);
    if (await Bun.file(full).exists()) return full;
  }

  try {
    const entries = await readdir(cwd);
    const agentsGlob = entries
      .filter((e) => /^AGENTS-.+\.md$/i.test(e))
      .sort();
    if (agentsGlob[0]) return path.join(cwd, agentsGlob[0]);
  } catch {
    // unreadable cwd
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

function extractRefs(content: string, sourceLabel: string): ExtractedRefs {
  const npmScripts = new Map<string, string[]>();
  const makeTargets = new Map<string, string[]>();
  const justRecipes = new Map<string, string[]>();
  const dotnetRuns: string[] = [];
  const paths = new Map<string, string[]>();

  const add = (map: Map<string, string[]>, key: string, ctx: string) => {
    const list = map.get(key) ?? [];
    list.push(ctx);
    map.set(key, list);
  };

  // Fenced shell blocks
  for (const match of content.matchAll(/```(?:sh|bash|shell|zsh|console)?\r?\n([\s\S]*?)```/gi)) {
    const block = match[1] ?? "";
    const ctx = `code block in ${sourceLabel}`;
    scanLineRefs(block, ctx, add, makeTargets, justRecipes, npmScripts, dotnetRuns);
    scanPaths(block, ctx, paths);
  }

  // Inline backticks — commands and file paths
  for (const match of content.matchAll(/`([^`\n]+)`/g)) {
    const text = (match[1] ?? "").trim();
    const ctx = `inline \`${truncate(text, 40)}\``;
    if (looksLikeCommand(text)) {
      scanLineRefs(text, ctx, add, makeTargets, justRecipes, npmScripts, dotnetRuns);
    }
    if (looksLikePath(text)) {
      addPath(paths, normalizePath(text), ctx);
    }
  }

  // Bare paths in prose (outside backticks)
  scanPaths(content, `prose in ${sourceLabel}`, paths);

  return { npmScripts, makeTargets, justRecipes, dotnetRuns, paths };
}

function scanLineRefs(
  text: string,
  ctx: string,
  add: (map: Map<string, string[]>, key: string, ctx: string) => void,
  makeTargets: Map<string, string[]>,
  justRecipes: Map<string, string[]>,
  npmScripts: Map<string, string[]>,
  dotnetRuns: string[]
): void {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    for (const m of trimmed.matchAll(/\b(?:npm|bun|pnpm)\s+run\s+([a-zA-Z0-9:_-]+)\b/g)) {
      if (m[1]) add(npmScripts, m[1], ctx);
    }
    for (const m of trimmed.matchAll(/\byarn(?:\s+run)?\s+([a-zA-Z0-9:_-]+)\b/g)) {
      if (m[1] && m[1] !== "install" && m[1] !== "add") add(npmScripts, m[1], ctx);
    }
    for (const m of trimmed.matchAll(/\bmake\s+([a-zA-Z0-9_-]+)\b/g)) {
      if (m[1]) add(makeTargets, m[1], ctx);
    }
    for (const m of trimmed.matchAll(/\bjust\s+([a-zA-Z0-9_-]+)\b/g)) {
      if (m[1]) add(justRecipes, m[1], ctx);
    }
    if (/\bdotnet\s+run\b/.test(trimmed)) {
      dotnetRuns.push(ctx);
    }
  }
}

function scanPaths(text: string, ctx: string, paths: Map<string, string[]>) {
  for (const m of text.matchAll(
    /(?:^|[\s`'"(])((?:\.\/)?(?:[\w@.-]+\/)+[\w.-]+\.(?:ts|tsx|js|jsx|mjs|cjs|cs|json|md|yaml|yml|toml|sh|ps1|css|scss|html|vue|svelte|go|rs|py|rb|php))(?:[\s`'")]|$)/gm
  )) {
    addPath(paths, normalizePath(m[1] ?? ""), ctx);
  }
}

function addPath(paths: Map<string, string[]>, filePath: string, ctx: string) {
  if (!filePath || filePath.includes("node_modules/") || filePath.startsWith("http")) return;
  const list = paths.get(filePath) ?? [];
  list.push(ctx);
  paths.set(filePath, list);
}

function normalizePath(p: string): string {
  return p.replace(/^\.\//, "");
}

function looksLikePath(text: string): boolean {
  return /^(?:\.\/)?(?:[\w@.-]+\/)+[\w.-]+\.\w+$/.test(text) && !text.startsWith("http");
}

function looksLikeCommand(text: string): boolean {
  return (
    /^(npm|bun|pnpm|yarn|make|just|dotnet|cargo|go|python|node)\b/.test(text) ||
    /\b(?:npm|bun|pnpm)\s+run\s+/.test(text) ||
    /\bmake\s+\w+/.test(text) ||
    /\bjust\s+\w+/.test(text)
  );
}

// ---------------------------------------------------------------------------
// Project script loading
// ---------------------------------------------------------------------------

async function loadProjectScripts(cwd: string): Promise<ProjectScripts> {
  const packageScripts = new Set<string>();
  const makeTargets = new Set<string>();
  const justRecipes = new Set<string>();

  const pkgPath = path.join(cwd, "package.json");
  if (await Bun.file(pkgPath).exists()) {
    try {
      const pkg = JSON.parse(await Bun.file(pkgPath).text()) as { scripts?: Record<string, string> };
      for (const name of Object.keys(pkg.scripts ?? {})) {
        packageScripts.add(name);
      }
    } catch {
      warn(`Could not parse ${fmt.bold("package.json")}`);
    }
  }

  const makefilePath = path.join(cwd, "Makefile");
  if (await Bun.file(makefilePath).exists()) {
    const content = await Bun.file(makefilePath).text();
    for (const name of parseMakefileTargets(content)) {
      makeTargets.add(name);
    }
  }

  const justfilePath = await findJustfile(cwd);
  if (justfilePath) {
    const content = await Bun.file(justfilePath).text();
    for (const name of parseJustRecipes(content)) {
      justRecipes.add(name);
    }
  }

  return { packageScripts, makeTargets, justRecipes };
}

async function findJustfile(cwd: string): Promise<string | undefined> {
  for (const name of ["justfile", "Justfile", "justfile.unix", "justfile.windows"]) {
    const full = path.join(cwd, name);
    if (await Bun.file(full).exists()) return full;
  }
  return undefined;
}

function parseMakefileTargets(content: string): string[] {
  const targets: string[] = [];
  for (const line of content.split(/\r?\n/)) {
    if (line.startsWith("\t") || line.startsWith("#") || !line.trim()) continue;
    const m = line.match(/^([a-zA-Z0-9_.-]+)\s*(?:::.*)?\s*:/);
    if (m?.[1] && m[1] !== ".PHONY") targets.push(m[1]);
  }
  return targets;
}

function parseJustRecipes(content: string): string[] {
  const recipes: string[] = [];
  for (const line of content.split(/\r?\n/)) {
    if (line.startsWith("\t") || line.startsWith("#") || !line.trim()) continue;
    const m = line.match(/^([a-zA-Z0-9_-]+)\s*:/);
    if (m?.[1]) recipes.push(m[1]);
  }
  return recipes;
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

async function compareRefs(
  refs: ExtractedRefs,
  project: ProjectScripts,
  cwd: string
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];

  for (const [script, sources] of refs.npmScripts) {
    if (!project.packageScripts.has(script)) {
      issues.push({
        kind: "missing-script",
        ref: script,
        source: sources[0] ?? "unknown",
        detail:
          project.packageScripts.size > 0
            ? `not in package.json scripts (${[...project.packageScripts].slice(0, 5).join(", ")}${project.packageScripts.size > 5 ? ", …" : ""})`
            : "no package.json scripts found",
      });
    }
  }

  for (const [target, sources] of refs.makeTargets) {
    if (project.makeTargets.size === 0) continue;
    if (!project.makeTargets.has(target)) {
      issues.push({
        kind: "missing-make",
        ref: target,
        source: sources[0] ?? "unknown",
      });
    }
  }

  for (const [recipe, sources] of refs.justRecipes) {
    if (project.justRecipes.size === 0) continue;
    if (!project.justRecipes.has(recipe)) {
      issues.push({
        kind: "missing-just",
        ref: recipe,
        source: sources[0] ?? "unknown",
      });
    }
  }

  for (const [filePath, sources] of refs.paths) {
    const full = path.join(cwd, filePath);
    if (!existsSync(full)) {
      issues.push({
        kind: "dead-path",
        ref: filePath,
        source: sources[0] ?? "unknown",
      });
    }
  }

  if (refs.dotnetRuns.length > 0 && !(await hasFileMatching(cwd, /\.csproj$/))) {
    issues.push({
      kind: "stale-command",
      ref: "dotnet run",
      source: refs.dotnetRuns[0] ?? "unknown",
      detail: "no .csproj found in project root",
    });
  }

  return issues;
}

async function hasFileMatching(cwd: string, pattern: RegExp): Promise<boolean> {
  try {
    const entries = await readdir(cwd);
    return entries.some((e) => pattern.test(e));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function printReport(
  file: string,
  refs: ExtractedRefs,
  project: ProjectScripts,
  issues: ValidationIssue[]
): void {
  log("");
  log(fmt.bold("Drift check") + fmt.dim(` — ${file}`));
  log("");

  const scriptCount = refs.npmScripts.size;
  const pathCount = refs.paths.size;

  log(
    fmt.dim("Found") +
      ` ${scriptCount} script ref(s), ${refs.makeTargets.size} make target(s), ${refs.justRecipes.size} just recipe(s), ${pathCount} path ref(s)`
  );
  log(
    fmt.dim("Project has") +
      ` ${project.packageScripts.size} npm script(s), ${project.makeTargets.size} make target(s), ${project.justRecipes.size} just recipe(s)`
  );
  log("");

  if (issues.length === 0) {
    success("No drift detected — referenced commands and paths look current.");
    return;
  }

  warn(`${issues.length} issue(s) found:`);
  log("");

  for (const issue of issues) {
    const label = issueLabel(issue.kind);
    error(`${label}: ${fmt.bold(issue.ref)}`);
    log(fmt.dim(`   cited in: ${issue.source}`));
    if (issue.detail) log(fmt.dim(`   ${issue.detail}`));
  }

  log("");
  log(fmt.dim("Fix stale AGENTS.md commands or update project scripts to match."));
}

function issueLabel(kind: ValidationIssue["kind"]): string {
  switch (kind) {
    case "missing-script":
      return "Missing npm script";
    case "missing-make":
      return "Missing Makefile target";
    case "missing-just":
      return "Missing just recipe";
    case "dead-path":
      return "Dead path";
    case "stale-command":
      return "Stale command";
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}
