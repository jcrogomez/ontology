import { test, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

let tempDir: string;

function runCli(args: string[]): ReturnType<typeof spawnSync> {
  return spawnSync(process.execPath, [path.join(process.cwd(), "dist/cli.js"), ...args], {
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

// These --provider ollama tests pin the *soft-fail* contract. They
// target an unreachable host (127.0.0.1:9999) so the dispatch fails
// fast (connection refused) and the test is deterministic — without
// it, a running local Ollama does a real (multi-second) generation
// and the test times out. The accept-branch assertions remain for
// documentation; in practice the unreachable host always takes the
// soft-fail branch.
test("onto run context --provider ollama soft-fails or returns response", () => {
  const result = runCli(["run", "context", "node_0000_canon", "--provider", "ollama", "--ollama-host", "http://127.0.0.1:9999"]);
  if (result.status === 0) {
    expect(result.stdout).toContain("=== ONTOLOGY RUN CONTEXT ===");
    expect(result.stdout).toContain("Provider:  ollama");
  } else {
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("✖ Ollama unavailable:");
  }
});

test("onto run context --provider ollama --json soft-fails or returns parseable JSON", () => {
  const result = runCli(["run", "context", "node_0000_canon", "--provider", "ollama", "--json", "--ollama-host", "http://127.0.0.1:9999"]);
  if (result.status === 0) {
    expect(() => JSON.parse(result.stdout)).not.toThrow();
    const parsed = JSON.parse(result.stdout);
    expect(parsed.response.provider).toBe("ollama");
  } else {
    expect(result.status).toBe(1);
    expect(() => JSON.parse(result.stdout)).not.toThrow();
    const parsed = JSON.parse(result.stdout);
    expect(parsed.ok).toBe(false);
    expect(parsed.provider).toBe("ollama");
    expect(parsed.error).toBeDefined();
  }
});

test("onto run context --provider ollama --validate soft-fails or validates response", () => {
  const result = runCli(["run", "context", "node_0000_canon", "--provider", "ollama", "--validate", "--ollama-host", "http://127.0.0.1:9999"]);
  if (result.status === 0) {
    expect(result.stdout).toContain("Validation:");
  } else {
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("✖ Ollama unavailable:");
  }
});

test("onto run context --provider ollama does not mutate .ontology", () => {
  const ontologyDir = path.join(tempDir, ".ontology");
  const beforeHash = hashDirectory(ontologyDir);

  const result = runCli(["run", "context", "node_0000_canon", "--provider", "ollama", "--ollama-host", "http://127.0.0.1:9999"]);
  // Whether it succeeds or soft-fails, it should not mutate
  const afterHash = hashDirectory(ontologyDir);
  expect(beforeHash).toBe(afterHash);
});

test("onto run context accepts --model", () => {
  const result = runCli(["run", "context", "node_0000_canon", "--provider", "ollama", "--model", "custom-model"]);
  if (result.status === 0) {
    expect(result.stdout).toContain("Model:     custom-model");
  } else {
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("✖ Ollama unavailable:");
  }
});

test("onto run context accepts --ollama-host", () => {
  const result = runCli(["run", "context", "node_0000_canon", "--provider", "ollama", "--ollama-host", "http://fake-host:11434"]);
  // It will likely soft-fail because the host is fake, but we verify it processes it.
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("✖ Ollama unavailable:");
});

test("onto run context fails for unsupported provider", () => {
  const result = runCli(["run", "context", "node_0000_canon", "--provider", "unknown"]);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("Unsupported LLM provider: unknown");
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

test("onto run context --validate returns validation block", () => {
  const result = runCli(["run", "context", "node_0000_canon", "--provider", "mock", "--validate"]);
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("Validation:");
  expect(result.stdout).toContain("OK:       true");
  expect(result.stdout).toContain("Score:    1");
  expect(result.stdout).toContain("Warnings: 0");
  expect(result.stdout).toContain("Violations: 0");
});

test("onto run context --validate --json outputs parseable validation", () => {
  const result = runCli(["run", "context", "node_0000_canon", "--provider", "mock", "--validate", "--json"]);
  expect(result.status).toBe(0);
  expect(() => JSON.parse(result.stdout)).not.toThrow();
  const parsed = JSON.parse(result.stdout);
  expect(parsed.validation).toBeDefined();
  expect(parsed.validation.ok).toBe(true);
  expect(parsed.validation.score).toBe(1);
  expect(parsed.validation.violations).toEqual([]);
  expect(parsed.validation.warnings).toEqual([]);
});

test("onto run context --validate does not mutate .ontology", () => {
  const ontologyDir = path.join(tempDir, ".ontology");
  const beforeHash = hashDirectory(ontologyDir);

  const result = runCli(["run", "context", "node_0000_canon", "--provider", "mock", "--validate"]);
  expect(result.status).toBe(0);

  const afterHash = hashDirectory(ontologyDir);
  expect(beforeHash).toBe(afterHash);
});

test("onto run context default does not surface an Edges line", () => {
  const result = runCli(["run", "context", "node_0000_canon", "--provider", "mock"]);
  expect(result.status).toBe(0);
  expect(result.stdout).not.toContain("Edges:");
});

test("onto run context --include-edges surfaces an Edges line and edgeContext in JSON", () => {
  // Create a child node and link it to canon so there is an edge to project.
  const c = runCli(["node", "create", "--level", "domain", "--kind", "entity", "--prompt", "Harvest entity"]);
  expect(c.status).toBe(0);
  const link = runCli(["node", "link", "--from", "node_0000_canon", "--to", "node_0001", "--type", "documents"]);
  expect(link.status).toBe(0);

  const human = runCli(["run", "context", "node_0000_canon", "--provider", "mock", "--include-edges"]);
  expect(human.status).toBe(0);
  expect(human.stdout).toContain("Edges:");

  const json = runCli(["run", "context", "node_0000_canon", "--provider", "mock", "--include-edges", "--json"]);
  expect(json.status).toBe(0);
  const parsed = JSON.parse(json.stdout);
  expect(parsed.context.edgeContext).toBeDefined();
  expect(parsed.context.edgeContext.edges.length).toBeGreaterThan(0);
});

test("onto run context --edge-types filters by edge type", () => {
  runCli(["node", "create", "--level", "domain", "--kind", "entity", "--prompt", "Harvest entity"]);
  runCli(["node", "link", "--from", "node_0000_canon", "--to", "node_0001", "--type", "documents"]);

  // Filter for a different edge type than the one created. Edge context should be empty.
  const result = runCli([
    "run", "context", "node_0000_canon",
    "--provider", "mock",
    "--include-edges",
    "--edge-types", "depends_on",
    "--json",
  ]);
  expect(result.status).toBe(0);
  const parsed = JSON.parse(result.stdout);
  expect(parsed.context.edgeContext).toBeDefined();
  expect(parsed.context.edgeContext.edges.length).toBe(0);
});

test("onto run context --edge-types rejects an invalid edge type", () => {
  const result = runCli([
    "run", "context", "node_0000_canon",
    "--provider", "mock",
    "--include-edges",
    "--edge-types", "fake_type",
  ]);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Invalid edge type: fake_type");
});

test("onto run context --include-edges does not mutate .ontology", () => {
  // Create the edge so include-edges has something to project.
  runCli(["node", "create", "--level", "domain", "--kind", "entity", "--prompt", "Harvest entity"]);
  runCli(["node", "link", "--from", "node_0000_canon", "--to", "node_0001", "--type", "documents"]);

  const ontologyDir = path.join(tempDir, ".ontology");
  const beforeHash = hashDirectory(ontologyDir);

  const result = runCli(["run", "context", "node_0000_canon", "--provider", "mock", "--include-edges"]);
  expect(result.status).toBe(0);

  const afterHash = hashDirectory(ontologyDir);
  expect(beforeHash).toBe(afterHash);
});

test("onto run context --include-edges --persist produces a different runId than without --include-edges", () => {
  runCli(["node", "create", "--level", "domain", "--kind", "entity", "--prompt", "Harvest entity"]);
  runCli(["node", "link", "--from", "node_0000_canon", "--to", "node_0001", "--type", "documents"]);

  const without = runCli(["run", "context", "node_0000_canon", "--provider", "mock", "--persist", "--json"]);
  expect(without.status).toBe(0);
  const idWithout = JSON.parse(without.stdout).persisted.runId;

  const withEdges = runCli(["run", "context", "node_0000_canon", "--provider", "mock", "--include-edges", "--persist", "--json"]);
  expect(withEdges.status).toBe(0);
  const idWith = JSON.parse(withEdges.stdout).persisted.runId;

  expect(idWith).not.toBe(idWithout);
});
