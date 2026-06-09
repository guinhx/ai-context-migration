import { readdir, stat } from "node:fs/promises";
import { basename, join } from "node:path";

export interface SessionFile {
  id: string;
  path: string;
  projectKey: string;
  mtimeMs: number;
  size: number;
}

export async function walkJsonlFiles(rootDirs: string[]): Promise<SessionFile[]> {
  const results: SessionFile[] = [];

  for (const root of rootDirs) {
    await walkDir(root, results);
  }

  return results;
}

async function walkDir(dir: string, results: SessionFile[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === "subagents") continue;
      await walkDir(fullPath, results);
      continue;
    }

    if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
    if (entry.name.startsWith("agent-")) continue;

    const id = basename(entry.name, ".jsonl");
    let fileStat;
    try {
      fileStat = await stat(fullPath);
    } catch {
      continue;
    }

    results.push({
      id,
      path: fullPath,
      projectKey: basename(dir),
      mtimeMs: fileStat.mtimeMs,
      size: fileStat.size,
    });
  }
}

export async function findSessionFile(
  rootDirs: string[],
  sessionId: string
): Promise<SessionFile | null> {
  const files = await walkJsonlFiles(rootDirs);
  return files.find((f) => f.id === sessionId) ?? null;
}

export async function readJsonlLines(path: string): Promise<unknown[]> {
  const text = await Bun.file(path).text();
  const lines = text.split("\n").filter((line) => line.trim());
  const records: unknown[] = [];

  for (const line of lines) {
    try {
      records.push(JSON.parse(line));
    } catch {
      // skip malformed lines
    }
  }

  return records;
}
