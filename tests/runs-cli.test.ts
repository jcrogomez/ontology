import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { runCli } from "./helpers/run-cli.js";

describe("onto run prompt --persist", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempProject();
    expect(runCli(tempDir, ["init"]).status).toBe(0);
  });

  afterEach(() => {
    cleanupTempProject(tempDir);
  });

  it("ephemeral by default: no .ontology/runs/ created without --persist", () => {
    const result = runCli(tempDir, [
      "run", "prompt",
      "--task", "semantic_parse",
      "--prompt", "hello",
      "--provider", "mock",
    ]);
    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain("Run:");
    expect(fs.existsSync(path.join(tempDir, ".ontology/runs"))).toBe(false);
  });

  it("--persist writes a run record and surfaces the run id", () => {
    const result = runCli(tempDir, [
      "run", "prompt",
      "--task", "semantic_parse",
      "--prompt", "hello",
      "--provider", "mock",
      "--persist",
    ]);
    expect(result.status).toBe(0);
    const match = result.stdout.match(/Run:\s+(run_[0-9a-f]{8})/);
    expect(match).not.toBeNull();
    const runId = match![1];
    expect(fs.existsSync(path.join(tempDir, ".ontology/runs", `${runId}.json`))).toBe(true);
  });

  it("--persist --json includes a persisted block in the output", () => {
    const result = runCli(tempDir, [
      "run", "prompt",
      "--task", "semantic_parse",
      "--prompt", "hello",
      "--provider", "mock",
      "--persist",
      "--json",
    ]);
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.persisted).toBeDefined();
    expect(parsed.persisted.runId).toMatch(/^run_[0-9a-f]{8}$/);
    expect(parsed.persisted.cached).toBe(false);
  });

  it("a second --persist with identical inputs reports cached=true", () => {
    const args = [
      "run", "prompt",
      "--task", "semantic_parse",
      "--prompt", "stable input",
      "--provider", "mock",
      "--persist",
    ];
    const first = runCli(tempDir, args);
    expect(first.status).toBe(0);
    const second = runCli(tempDir, args);
    expect(second.status).toBe(0);
    expect(second.stdout).toContain("(cached)");
  });

  it("--persist appends a run_persisted event", () => {
    runCli(tempDir, [
      "run", "prompt",
      "--task", "semantic_parse",
      "--prompt", "hello",
      "--provider", "mock",
      "--persist",
    ]);
    const events = fs.readFileSync(path.join(tempDir, ".ontology/events.jsonl"), "utf-8");
    expect(events).toContain("\"eventType\":\"run_persisted\"");
  });
});

describe("onto run context --persist", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempProject();
    expect(runCli(tempDir, ["init"]).status).toBe(0);
  });

  afterEach(() => {
    cleanupTempProject(tempDir);
  });

  it("ephemeral by default: no runs file without --persist", () => {
    const result = runCli(tempDir, [
      "run", "context", "node_0000_canon", "--provider", "mock",
    ]);
    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(tempDir, ".ontology/runs"))).toBe(false);
  });

  it("--persist writes a run record with kind=context", () => {
    const result = runCli(tempDir, [
      "run", "context", "node_0000_canon",
      "--provider", "mock",
      "--persist",
      "--json",
    ]);
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.persisted).toBeDefined();
    const runId = parsed.persisted.runId;
    const filePath = path.join(tempDir, ".ontology/runs", `${runId}.json`);
    expect(fs.existsSync(filePath)).toBe(true);
    const stored = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    expect(stored.kind).toBe("context");
    expect(stored.input.targetNodeId).toBe("node_0000_canon");
    expect(stored.input.contextHash).toMatch(/^ctx:hash:/);
  });

  it("--persist --validate stores the validation result inside the run record", () => {
    const result = runCli(tempDir, [
      "run", "context", "node_0000_canon",
      "--provider", "mock",
      "--persist",
      "--validate",
      "--json",
    ]);
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    const runId = parsed.persisted.runId;
    const stored = JSON.parse(fs.readFileSync(path.join(tempDir, ".ontology/runs", `${runId}.json`), "utf-8"));
    expect(stored.validation).not.toBeNull();
    expect(typeof stored.validation.ok).toBe("boolean");
    expect(typeof stored.validation.score).toBe("number");
  });
});

describe("onto runs list / show / verify", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempProject();
    expect(runCli(tempDir, ["init"]).status).toBe(0);
  });

  afterEach(() => {
    cleanupTempProject(tempDir);
  });

  function persistOne(prompt = "hello"): string {
    const result = runCli(tempDir, [
      "run", "prompt",
      "--task", "semantic_parse",
      "--prompt", prompt,
      "--provider", "mock",
      "--persist",
      "--json",
    ]);
    expect(result.status).toBe(0);
    return JSON.parse(result.stdout).persisted.runId;
  }

  it("runs list reports zero runs on a fresh project", () => {
    const result = runCli(tempDir, ["runs", "list", "--json"]);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ runs: [] });
  });

  it("runs list reports persisted runs", () => {
    const id1 = persistOne("first");
    const id2 = persistOne("second");
    const result = runCli(tempDir, ["runs", "list", "--json"]);
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    const ids = parsed.runs.map((r: any) => r.id);
    expect(ids).toContain(id1);
    expect(ids).toContain(id2);
  });

  it("runs list --kind filters by run kind", () => {
    persistOne("first");
    runCli(tempDir, [
      "run", "context", "node_0000_canon",
      "--provider", "mock",
      "--persist",
    ]);
    const promptOnly = JSON.parse(runCli(tempDir, ["runs", "list", "--kind", "prompt", "--json"]).stdout);
    const contextOnly = JSON.parse(runCli(tempDir, ["runs", "list", "--kind", "context", "--json"]).stdout);
    expect(promptOnly.runs.every((r: any) => r.kind === "prompt")).toBe(true);
    expect(contextOnly.runs.every((r: any) => r.kind === "context")).toBe(true);
  });

  it("runs show <id> returns the persisted record as JSON", () => {
    const id = persistOne("hello");
    const result = runCli(tempDir, ["runs", "show", id, "--json"]);
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.id).toBe(id);
    expect(parsed.kind).toBe("prompt");
    expect(parsed.hash).toMatch(/^run:hash:/);
  });

  it("runs show <id> exits 1 when the id is unknown", () => {
    const result = runCli(tempDir, ["runs", "show", "run_deadbeef"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Run not found");
  });

  it("runs verify <id> reports ok=true for an untampered record", () => {
    const id = persistOne("hello");
    const result = runCli(tempDir, ["runs", "verify", id, "--json"]);
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.idMatches).toBe(true);
    expect(parsed.hashMatches).toBe(true);
  });

  it("runs verify <id> exits 1 and reports hashMatches=false when tampered", () => {
    const id = persistOne("hello");
    const filePath = path.join(tempDir, ".ontology/runs", `${id}.json`);
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    raw.output.text = "tampered";
    fs.writeFileSync(filePath, JSON.stringify(raw, null, 2) + "\n", "utf-8");
    const result = runCli(tempDir, ["runs", "verify", id, "--json"]);
    expect(result.status).toBe(1);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.ok).toBe(false);
    expect(parsed.hashMatches).toBe(false);
  });
});
