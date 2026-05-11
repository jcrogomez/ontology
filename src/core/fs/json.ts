import * as fs from "node:fs";
import * as path from "node:path";

// JSONL files are append-oriented logs. They let Ontology record time and topology without rewriting history.

export function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Crash-atomic JSON write: serialize to a sibling temp file, then rename
// into place. POSIX rename is atomic when source and destination live on
// the same filesystem (guaranteed here because the temp is in the parent
// dir). A SIGKILL or out-of-disk mid-write leaves the original target
// intact rather than truncating it. The orphan temp is unlinked on
// rename failure so a crashed run doesn't litter the directory.
export function writeJson(filePath: string, value: unknown): void {
  const dir = path.dirname(filePath);
  ensureDir(dir);
  const tmp = `${filePath}.tmp.${process.pid}`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n", "utf-8");
    fs.renameSync(tmp, filePath);
  } catch (err) {
    try {
      fs.unlinkSync(tmp);
    } catch {
      // best-effort cleanup; ignore if the tmp wasn't created
    }
    throw err;
  }
}

export function readJson<T>(filePath: string): T {
  const content = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(content) as T;
}

export function appendJsonl(filePath: string, value: unknown): void {
  const dir = path.dirname(filePath);
  ensureDir(dir);
  const line = JSON.stringify(value) + "\n";
  fs.appendFileSync(filePath, line, "utf-8");
}

export function readJsonl<T>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n").filter((line) => line.trim() !== "");
  return lines.map((line) => JSON.parse(line) as T);
}
