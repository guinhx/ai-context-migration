import { readdir, stat } from "node:fs/promises";
import { basename, join } from "node:path";

export interface TranscriptFile {
  id: string;
  path: string;
  projectKey: string;
  mtimeMs: number;
}

export async function walkTranscriptFiles(rootDir: string): Promise<TranscriptFile[]> {
  const results: TranscriptFile[] = [];
  await walkProjectsDir(rootDir, results);
  return results;
}

async function walkProjectsDir(projectsDir: string, results: TranscriptFile[]): Promise<void> {
  let projectEntries;
  try {
    projectEntries = await readdir(projectsDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const projectEntry of projectEntries) {
    if (!projectEntry.isDirectory()) continue;

    const transcriptsDir = join(
      projectsDir,
      projectEntry.name,
      "agent-transcripts"
    );

    let transcriptEntries;
    try {
      transcriptEntries = await readdir(transcriptsDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const transcriptEntry of transcriptEntries) {
      // Flat layout: agent-transcripts/<uuid>.jsonl
      if (transcriptEntry.isFile() && transcriptEntry.name.endsWith(".jsonl")) {
        const id = basename(transcriptEntry.name, ".jsonl");
        const jsonlPath = join(transcriptsDir, transcriptEntry.name);
        const fileStat = await safeStat(jsonlPath);
        if (fileStat) {
          results.push({
            id,
            path: jsonlPath,
            projectKey: projectEntry.name,
            mtimeMs: fileStat.mtimeMs,
          });
        }
        continue;
      }

      // Nested layout: agent-transcripts/<uuid>/<uuid>.jsonl
      if (!transcriptEntry.isDirectory()) continue;

      const id = transcriptEntry.name;
      const jsonlPath = join(transcriptsDir, id, `${id}.jsonl`);
      const fileStat = await safeStat(jsonlPath);
      if (fileStat) {
        results.push({
          id,
          path: jsonlPath,
          projectKey: projectEntry.name,
          mtimeMs: fileStat.mtimeMs,
        });
      }
    }
  }
}

async function safeStat(path: string) {
  try {
    return await stat(path);
  } catch {
    return null;
  }
}

export async function findTranscriptFile(
  rootDir: string,
  threadId: string
): Promise<TranscriptFile | null> {
  const files = await walkTranscriptFiles(rootDir);
  return files.find((f) => f.id === threadId) ?? null;
}

export async function readJsonlLines(path: string): Promise<unknown[]> {
  const text = await Bun.file(path).text();
  const records: unknown[] = [];

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      records.push(JSON.parse(trimmed));
    } catch {
      // skip malformed lines
    }
  }

  return records;
}

export function extractProjectKeyFromPath(path: string): string | undefined {
  const normalized = path.replace(/\\/g, "/");
  const match = normalized.match(/\/projects\/([^/]+)\/agent-transcripts\//);
  return match?.[1];
}

export function threadIdFromPath(path: string): string | undefined {
  const name = basename(path);
  return name.endsWith(".jsonl") ? basename(name, ".jsonl") : undefined;
}
