import { test, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

let tempDir: string;

function runCli(args: string[]): ReturnType<typeof spawnSync> {
  return spawnSync("npx", ["tsx", path.join(process.cwd(), "src/cli.ts"), ...args], {
    cwd: tempDir,
    encoding: "utf-8",
    env: { ...process.env },
  });
}

function hashDirectory(dirPath: string): string {
  const files = fs.readdirSync(dirPath, { recursive: true }) as string[];
  files.sort();
  let hashStr = "";
  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isFile()) {
      hashStr += file + ":" + fs.readFileSync(fullPath, "utf-8") + "|";
    }
  }
  return hashStr;
}

beforeAll(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ontology-test-"));
  const initResult = runCli(["init"]);
  expect(initResult.status).toBe(0);
});

afterAll(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("onto run context works with mock", () => {
  const result = runCli(["run", "context", "node_0000_canon", "--provider", "mock"]);
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("=== ONTOLOGY RUN CONTEXT ===");
  expect(result.stdout).toContain("Target:    node_0000_canon");
  expect(result.stdout).toContain("Provider:  mock");
});

test("onto run context --json outputs parseable JSON", () => {
  const result = runCli(["run", "context", "node_0000_canon", "--provider", "mock", "--json"]);
  expect(result.status).toBe(0);
  expect(() => JSON.parse(result.stdout)).not.toThrow();
  const parsed = JSON.parse(result.stdout);
  expect(parsed.context.targetNodeId).toBe("node_0000_canon");
  expect(parsed.response.provider).toBe("mock");
});

test("onto run context defaults provider to mock", () => {
  const result = runCli(["run", "context", "node_0000_canon"]);
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("Provider:  mock");
});

test("onto run context defaults task to semantic_parse", () => {
  const result = runCli(["run", "context", "node_0000_canon", "--provider", "mock"]);
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("Task:      semantic_parse");
  expect(result.stdout).toContain("[mock:semantic_parse]");
});

test("onto run context fails for missing target", () => {
  const result = runCli(["run", "context", "node_missing", "--provider", "mock"]);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("Target node not found: node_missing");
});

test("onto run context fails for unsupported provider", () => {
  const result = runCli(["run", "context", "node_0000_canon", "--provider", "ollama"]);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("Unsupported LLM provider: ollama");
});

test("onto run context fails for compare mode", () => {
  const result = runCli(["run", "context", "node_0000_canon", "--provider", "mock", "--mode", "compare"]);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("Unsupported context assembly mode: compare");
});

test("onto run context does not mutate .ontology", () => {
  const ontologyDir = path.join(tempDir, ".ontology");
  const beforeHash = hashDirectory(ontologyDir);

  const result = runCli(["run", "context", "node_0000_canon", "--provider", "mock"]);
  expect(result.status).toBe(0);

  const afterHash = hashDirectory(ontologyDir);
  expect(beforeHash).toBe(afterHash);
});
