import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { runCli } from "./helpers/run-cli.js";
import {
  hashPrompt,
  hashContext,
  hashRun,
} from "../src/core/integrity/hash.js";
import {
  computeRunId,
  createPersistedRun,
  loadPersistedRun,
  listPersistedRuns,
  verifyPersistedRun,
} from "../src/core/runs/persist.js";
import type {
  PersistedRunInput,
  PersistedRunModel,
} from "../src/schemas/ontology.js";
import type { ContextAssemblyOutput } from "../src/runtime/context/types.js";

const PROMPT_HASH_PREFIX = "prompt:hash:";
const CTX_HASH_PREFIX = "ctx:hash:";
const RUN_HASH_PREFIX = "run:hash:";

describe("hash helpers", () => {
  it("hashPrompt is deterministic and prefixed", () => {
    const a = hashPrompt("Hello world");
    const b = hashPrompt("Hello world");
    expect(a).toBe(b);
    expect(a.startsWith(PROMPT_HASH_PREFIX)).toBe(true);
  });

  it("hashPrompt normalizes line endings and trims outer whitespace", () => {
    const unix = hashPrompt("hello\nworld");
    const dos = hashPrompt("hello\r\nworld");
    const padded = hashPrompt("  hello\nworld  \n");
    expect(unix).toBe(dos);
    expect(unix).toBe(padded);
  });

  it("hashPrompt differs for different content", () => {
    expect(hashPrompt("a")).not.toBe(hashPrompt("b"));
  });

  it("hashContext is deterministic for canonical-equivalent objects", () => {
    const a: ContextAssemblyOutput = {
      mode: "strict",
      targetNodeId: "node_0001",
      branch: "main",
      nodes: [],
      canon: "canon",
      constraints: ["one", "two"],
      prompt: "P",
    };
    // Same content, different property order.
    const b: ContextAssemblyOutput = {
      prompt: "P",
      constraints: ["one", "two"],
      canon: "canon",
      nodes: [],
      branch: "main",
      targetNodeId: "node_0001",
      mode: "strict",
    } as ContextAssemblyOutput;
    expect(hashContext(a)).toBe(hashContext(b));
    expect(hashContext(a).startsWith(CTX_HASH_PREFIX)).toBe(true);
  });

  it("hashRun is deterministic and includes both input and model", () => {
    const input: PersistedRunInput = {
      promptHash: hashPrompt("hi"),
      contextHash: null,
      targetNodeId: null,
      branch: null,
      time: null,
      task: "semantic_parse",
      includeEdges: false,
      edgeTypes: null,
    };
    const model: PersistedRunModel = {
      provider: "mock",
      model: "mock_default",
      host: null,
    };
    const a = hashRun(input, model);
    const b = hashRun(input, model);
    expect(a).toBe(b);
    expect(a.startsWith(RUN_HASH_PREFIX)).toBe(true);

    const differentModel: PersistedRunModel = { ...model, model: "other" };
    expect(hashRun(input, differentModel)).not.toBe(a);
  });
});

describe("computeRunId", () => {
  it("produces an 8-hex-char id derived from hashRun", () => {
    const input: PersistedRunInput = {
      promptHash: hashPrompt("hi"),
      contextHash: null,
      targetNodeId: null,
      branch: null,
      time: null,
      task: "semantic_parse",
      includeEdges: false,
      edgeTypes: null,
    };
    const model: PersistedRunModel = {
      provider: "mock",
      model: "mock_default",
      host: null,
    };
    const id = computeRunId(input, model);
    expect(id).toMatch(/^run_[0-9a-f]{8}$/);
    // Same inputs should produce the same id.
    expect(computeRunId(input, model)).toBe(id);
  });
});

describe("createPersistedRun + listPersistedRuns + verifyPersistedRun", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeAll(() => {
    originalCwd = process.cwd();
  });

  beforeEach(() => {
    tempDir = createTempProject();
    process.chdir(tempDir);
    const initResult = runCli(tempDir, ["init"]);
    expect(initResult.status).toBe(0);
  });

  afterAll(() => {
    process.chdir(originalCwd);
  });

  function makeInput(promptText = "hello"): PersistedRunInput {
    return {
      promptHash: hashPrompt(promptText),
      contextHash: null,
      targetNodeId: null,
      branch: null,
      time: null,
      task: "semantic_parse",
      includeEdges: false,
      edgeTypes: null,
    };
  }

  function makeModel(): PersistedRunModel {
    return { provider: "mock", model: "mock_default", host: null };
  }

  it("persists a run and creates the file under .ontology/runs/", () => {
    const input = makeInput();
    const model = makeModel();
    const { run, cached } = createPersistedRun({
      kind: "prompt",
      input,
      model,
      output: { text: "[mock] hello", parsed: null },
      validation: null,
      durationMs: 12,
    });
    expect(cached).toBe(false);
    expect(run.id).toMatch(/^run_[0-9a-f]{8}$/);
    expect(run.hash.startsWith(RUN_HASH_PREFIX)).toBe(true);
    const filePath = path.join(tempDir, ".ontology/runs", `${run.id}.json`);
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("appends a run_persisted event to events.jsonl", () => {
    const input = makeInput();
    const model = makeModel();
    createPersistedRun({
      kind: "prompt",
      input,
      model,
      output: { text: "[mock] hello", parsed: null },
      validation: null,
      durationMs: 12,
    });
    const eventsPath = path.join(tempDir, ".ontology/events.jsonl");
    const content = fs.readFileSync(eventsPath, "utf-8");
    expect(content).toContain("\"eventType\":\"run_persisted\"");
  });

  it("returns the cached record on a second persist with identical inputs", () => {
    const input = makeInput("same prompt");
    const model = makeModel();

    const first = createPersistedRun({
      kind: "prompt",
      input,
      model,
      output: { text: "first call output", parsed: null },
      validation: null,
      durationMs: 5,
    });
    expect(first.cached).toBe(false);

    const second = createPersistedRun({
      kind: "prompt",
      input,
      model,
      output: { text: "second call output (should be ignored)", parsed: null },
      validation: null,
      durationMs: 999,
    });
    expect(second.cached).toBe(true);
    expect(second.run.id).toBe(first.run.id);
    // The output of the cached return must be the originally persisted one, not the second call's output.
    expect(second.run.output.text).toBe("first call output");
  });

  it("listPersistedRuns returns all runs sorted by createdAt then id", () => {
    const inputA = makeInput("first");
    const inputB = makeInput("second");
    const model = makeModel();
    createPersistedRun({ kind: "prompt", input: inputA, model, output: { text: "a", parsed: null }, validation: null, durationMs: 1 });
    createPersistedRun({ kind: "prompt", input: inputB, model, output: { text: "b", parsed: null }, validation: null, durationMs: 1 });
    const runs = listPersistedRuns(tempDir);
    expect(runs.length).toBe(2);
    expect(new Set(runs.map(r => r.kind))).toEqual(new Set(["prompt"]));
  });

  it("verifyPersistedRun reports ok=true for an untampered record", () => {
    const input = makeInput();
    const model = makeModel();
    const { run } = createPersistedRun({
      kind: "prompt",
      input,
      model,
      output: { text: "[mock] hello", parsed: null },
      validation: null,
      durationMs: 12,
    });
    const result = verifyPersistedRun(run.id, tempDir);
    expect(result.ok).toBe(true);
    expect(result.idMatches).toBe(true);
    expect(result.hashMatches).toBe(true);
  });

  it("verifyPersistedRun reports hashMatches=false when the file is tampered", () => {
    const input = makeInput();
    const model = makeModel();
    const { run } = createPersistedRun({
      kind: "prompt",
      input,
      model,
      output: { text: "original", parsed: null },
      validation: null,
      durationMs: 12,
    });
    const filePath = path.join(tempDir, ".ontology/runs", `${run.id}.json`);
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    raw.output.text = "tampered";
    fs.writeFileSync(filePath, JSON.stringify(raw, null, 2) + "\n", "utf-8");
    const result = verifyPersistedRun(run.id, tempDir);
    expect(result.ok).toBe(false);
    expect(result.hashMatches).toBe(false);
  });

  it("loadPersistedRun returns null when run id does not exist", () => {
    expect(loadPersistedRun("run_deadbeef", tempDir)).toBeNull();
  });
});
