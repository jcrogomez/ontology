import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { runCli } from "./helpers/run-cli.js";
import { runRegenerate } from "../src/surfaces/commands/regenerate.js";
import { normalize } from "../src/runtime/executor/verdict.js";

// End-to-end producer→classifier coverage for the typed failure channel
// (REVIEW_2026-07-20 §3.2): these tests exercise the REAL runRegenerate
// producers — not hand-written failure strings — and assert both the stamped
// `failureKind` and the executor verdict it normalizes to. Rewording any
// producer message can no longer silently flip broken↔infra-error: the enum,
// not the prose, carries the classification.

const SHADOW_REL = "src/hello.py";

function patchNode(tempDir: string, nodeId: string, mutate: (n: Record<string, unknown>) => void): void {
  const p = path.join(tempDir, ".ontology/nodes", `${nodeId}.json`);
  const n = JSON.parse(fs.readFileSync(p, "utf-8"));
  mutate(n);
  fs.writeFileSync(p, JSON.stringify(n, null, 2));
}

function setupShadowNode(tempDir: string): string {
  expect(runCli(tempDir, ["init"]).status).toBe(0);
  expect(runCli(tempDir, ["node", "create", "--level", "domain", "--kind", "entity", "--prompt", "Greeting domain"]).status).toBe(0);
  expect(
    runCli(tempDir, [
      "node", "create",
      "--level", "artifact", "--kind", "artifact",
      "--manifestation", "code", "--language", "python",
      "--prompt", 'print("hello world")',
    ]).status,
  ).toBe(0);
  expect(runCli(tempDir, ["node", "link", "--from", "node_0001", "--to", "node_0000_canon", "--type", "refines"]).status).toBe(0);
  expect(runCli(tempDir, ["node", "link", "--from", "node_0002", "--to", "node_0001", "--type", "refines"]).status).toBe(0);
  const shadowAbs = path.join(tempDir, SHADOW_REL);
  fs.mkdirSync(path.dirname(shadowAbs), { recursive: true });
  fs.writeFileSync(shadowAbs, 'print("hello world")');
  patchNode(tempDir, "node_0002", (n) => {
    n.outputs = { ...((n.outputs as object) ?? {}), files: [SHADOW_REL] };
  });
  return "node_0002";
}

describe("runRegenerate → failureKind → normalize (real producers)", () => {
  let tempDir: string;
  beforeEach(() => {
    tempDir = createTempProject();
  });
  afterEach(() => cleanupTempProject(tempDir));

  it("unknown node → not-found → infra-error", async () => {
    setupShadowNode(tempDir);
    const r = await runRegenerate("node_ghost", { provider: "mock" }, tempDir);
    expect(r.ok).toBe(false);
    expect(r.failureKind).toBe("not-found");
    expect(normalize(r).outcome).toBe("infra-error");
  });

  it("unsupported provider → config → infra-error", async () => {
    const id = setupShadowNode(tempDir);
    const r = await runRegenerate(id, { provider: "nope" }, tempDir);
    expect(r.ok).toBe(false);
    expect(r.failureKind).toBe("config");
    expect(normalize(r).outcome).toBe("infra-error");
  });

  it("missing shadow on disk → not-found → infra-error", async () => {
    const id = setupShadowNode(tempDir);
    fs.rmSync(path.join(tempDir, SHADOW_REL));
    const r = await runRegenerate(id, { provider: "mock" }, tempDir);
    expect(r.ok).toBe(false);
    expect(r.failureKind).toBe("not-found");
    expect(normalize(r).outcome).toBe("infra-error");
  });

  it("dead provider host → transport → infra-error (the 2026-07-07 shape, now typed)", async () => {
    const id = setupShadowNode(tempDir);
    const r = await runRegenerate(
      id,
      { provider: "ollama", model: "qwen2.5-coder:7b", ollamaHost: "http://127.0.0.1:1" },
      tempDir,
    );
    expect(r.ok).toBe(false);
    // The real producer wording keeps its compile-back prefix, but the ENUM —
    // not the string — decides: no draft was produced, this is transport.
    expect(r.failure).toMatch(/compile-back failed/);
    expect(r.failureKind).toBe("transport");
    expect(normalize(r).outcome).toBe("infra-error");
  });
});
