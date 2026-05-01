import * as fs from "node:fs";
import * as path from "node:path";

// JSONL files are append-oriented logs. They let Ontology record time and topology without rewriting history.

export function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function writeJson(filePath: string, value: unknown): void {
  const dir = path.dirname(filePath);
  ensureDir(dir);
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf-8");
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
