import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { runCli } from "./helpers/run-cli.js";

// Coverage for the literal escape hatch (Project Legend Phase β-2).
// When node.literal is set, the compile pipeline emits the literal text
// verbatim — no model dispatch — while preserving the audit chain
// (persisted run with provider="literal", compilation_run event,
// validator and runtime-check both still apply).

function setupCanonAndDomain(tempDir: string): void {
  expect(runCli(tempDir, ["init"]).status).toBe(0);
  expect(runCli(tempDir, ["node", "create", "--level", "domain", "--kind", "entity", "--prompt", "Greeting domain"]).status).toBe(0);
  expect(runCli(tempDir, ["node", "link", "--from", "node_0001", "--to", "node_0000_canon", "--type", "refines"]).status).toBe(0);
}

describe("onto node create --literal + compile", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempProject();
    setupCanonAndDomain(tempDir);
  });

  afterEach(() => cleanupTempProject(tempDir));

  it("persists node.literal on disk and surfaces it in the create message", () => {
    const r = runCli(tempDir, [
      "node", "create",
      "--level", "artifact", "--kind", "artifact",
      "--manifestation", "code", "--language", "python",
      "--prompt", "pinned hello",
      "--literal", 'print("pinned")',
    ]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("Literal:");
    expect(r.stdout).toContain("compile will emit verbatim");

    const onDisk = JSON.parse(
      fs.readFileSync(path.join(tempDir, ".ontology/nodes/node_0002.json"), "utf-8"),
    );
    expect(onDisk.literal).toBe('print("pinned")');
  });

  it("compile emits the literal verbatim with provider=\"literal\" in the persisted run", () => {
    runCli(tempDir, [
      "node", "create",
      "--level", "artifact", "--kind", "artifact",
      "--manifestation", "code", "--language", "python",
      "--prompt", "intent: print hello",
      "--literal", 'print("hello literal")',
    ]);
    runCli(tempDir, ["node", "link", "--from", "node_0002", "--to", "node_0001", "--type", "refines"]);

    const r = runCli(tempDir, ["compile", "run", "node_0002", "--provider", "mock", "--json"]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.ok).toBe(true);

    const artifact = fs.readFileSync(path.join(tempDir, ".ontology/artifacts/generated/node_0002.py"), "utf-8");
    expect(artifact).toBe('print("hello literal")');

    // The persisted run for the focal must record provider=literal.
    const runs = fs.readdirSync(path.join(tempDir, ".ontology/runs"))
      .map((f) => JSON.parse(fs.readFileSync(path.join(tempDir, ".ontology/runs", f), "utf-8")));
    const focalRun = runs.find((rec: any) => rec.input.targetNodeId === "node_0002");
    expect(focalRun).toBeDefined();
    expect(focalRun.model.provider).toBe("literal");
    expect(focalRun.model.model).toBe("literal");
    expect(focalRun.output.text).toBe('print("hello literal")');
  });

  it("upstream parents still dispatch through the requested provider — only the literal node short-circuits", () => {
    runCli(tempDir, [
      "node", "create",
      "--level", "artifact", "--kind", "artifact",
      "--manifestation", "code", "--language", "python",
      "--prompt", "x",
      "--literal", 'print("ok")',
    ]);
    runCli(tempDir, ["node", "link", "--from", "node_0002", "--to", "node_0001", "--type", "refines"]);
    runCli(tempDir, ["compile", "run", "node_0002", "--provider", "mock"]);

    const runs = fs.readdirSync(path.join(tempDir, ".ontology/runs"))
      .map((f) => JSON.parse(fs.readFileSync(path.join(tempDir, ".ontology/runs", f), "utf-8")));
    const providersByTarget = Object.fromEntries(runs.map((r: any) => [r.input.targetNodeId, r.model.provider]));
    // canon + domain: dispatched through mock
    expect(providersByTarget["node_0000_canon"]).toBe("mock");
    expect(providersByTarget["node_0001"]).toBe("mock");
    // literal leaf: short-circuited
    expect(providersByTarget["node_0002"]).toBe("literal");
  });

  it("re-compiling a literal node is a cache hit (no new run record)", () => {
    runCli(tempDir, [
      "node", "create",
      "--level", "artifact", "--kind", "artifact",
      "--manifestation", "code", "--language", "python",
      "--prompt", "x",
      "--literal", 'print("idem")',
    ]);
    runCli(tempDir, ["node", "link", "--from", "node_0002", "--to", "node_0001", "--type", "refines"]);
    runCli(tempDir, ["compile", "run", "node_0002", "--provider", "mock"]);
    const before = fs.readdirSync(path.join(tempDir, ".ontology/runs")).sort();
    const r2 = runCli(tempDir, ["compile", "run", "node_0002", "--provider", "mock", "--json"]);
    expect(r2.status).toBe(0);
    const parsed = JSON.parse(r2.stdout);
    expect(parsed.steps.every((s: any) => s.cached === true)).toBe(true);
    const after = fs.readdirSync(path.join(tempDir, ".ontology/runs")).sort();
    expect(after).toEqual(before);
  });

  it("validator still runs against the literal — a forbid violation aborts the compile", () => {
    // The literal references the forbidden token; intent-validator should
    // reject the compile post-write even though no LLM was called.
    runCli(tempDir, [
      "node", "create",
      "--level", "artifact", "--kind", "artifact",
      "--manifestation", "code", "--language", "python",
      "--prompt", "x",
      "--literal", 'print("uses banned")\nbanned_token = 1',
      "--rules", "FORBID: banned_token",
    ]);
    runCli(tempDir, ["node", "link", "--from", "node_0002", "--to", "node_0001", "--type", "refines"]);
    const r = runCli(tempDir, ["compile", "run", "node_0002", "--provider", "mock", "--json"]);
    expect(r.status).toBe(1);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.ok).toBe(false);
    expect(parsed.reason).toBe("step_failed");
    expect(parsed.error).toMatch(/Intent validation failed/);
    expect(parsed.error).toContain("banned_token");
  });

  it("literal bypasses code-fence extraction (verbatim is verbatim)", () => {
    // The literal includes a markdown fence intentionally. Without the
    // literal flag, projectArtifact for manifestation=code would strip
    // it; with the literal flag, it must survive byte-for-byte.
    const fenced = '```python\nprint("inside fence")\n```';
    runCli(tempDir, [
      "node", "create",
      "--level", "artifact", "--kind", "artifact",
      "--manifestation", "code", "--language", "python",
      "--prompt", "x",
      "--literal", fenced,
    ]);
    runCli(tempDir, ["node", "link", "--from", "node_0002", "--to", "node_0001", "--type", "refines"]);
    // Skip the language parse-check would fail on the fence; use a non-code
    // manifestation instead to focus on the projection invariant.
    // Adjust: create a fresh node where manifestation is intent so the
    // language parse check does not run.
    const tmp2 = createTempProject();
    try {
      expect(runCli(tmp2, ["init"]).status).toBe(0);
      expect(runCli(tmp2, ["node", "create", "--level", "domain", "--kind", "entity", "--prompt", "d"]).status).toBe(0);
      expect(runCli(tmp2, ["node", "create",
        "--level", "artifact", "--kind", "artifact",
        "--prompt", "x",
        "--literal", fenced,
      ]).status).toBe(0);
      runCli(tmp2, ["node", "link", "--from", "node_0001", "--to", "node_0000_canon", "--type", "refines"]);
      runCli(tmp2, ["node", "link", "--from", "node_0002", "--to", "node_0001", "--type", "refines"]);
      runCli(tmp2, ["compile", "run", "node_0002", "--provider", "mock"]);
      const artifact = fs.readFileSync(path.join(tmp2, ".ontology/artifacts/generated/node_0002.txt"), "utf-8");
      expect(artifact).toBe(fenced);
    } finally {
      cleanupTempProject(tmp2);
    }
  });

  it("--literal-file reads the pinned body from disk", () => {
    const literalPath = path.join(tempDir, "pinned.py");
    fs.writeFileSync(literalPath, 'print("from file")\n');
    const r = runCli(tempDir, [
      "node", "create",
      "--level", "artifact", "--kind", "artifact",
      "--manifestation", "code", "--language", "python",
      "--prompt", "x",
      "--literal-file", literalPath,
    ]);
    expect(r.status).toBe(0);
    const onDisk = JSON.parse(fs.readFileSync(path.join(tempDir, ".ontology/nodes/node_0002.json"), "utf-8"));
    expect(onDisk.literal).toBe('print("from file")\n');
  });

  it("rejects --literal and --literal-file together", () => {
    const r = runCli(tempDir, [
      "node", "create",
      "--level", "artifact", "--kind", "artifact",
      "--manifestation", "code", "--language", "python",
      "--prompt", "x",
      "--literal", "a",
      "--literal-file", "/tmp/nonexistent",
    ]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("mutually exclusive");
  });
});

describe("onto node update --literal / --clear-literal", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempProject();
    setupCanonAndDomain(tempDir);
    expect(runCli(tempDir, [
      "node", "create",
      "--level", "artifact", "--kind", "artifact",
      "--manifestation", "code", "--language", "python",
      "--prompt", "x",
    ]).status).toBe(0);
    runCli(tempDir, ["node", "link", "--from", "node_0002", "--to", "node_0001", "--type", "refines"]);
  });

  afterEach(() => cleanupTempProject(tempDir));

  it("--literal on an existing node sets the field and re-hashes", () => {
    const before = JSON.parse(fs.readFileSync(path.join(tempDir, ".ontology/nodes/node_0002.json"), "utf-8"));
    const r = runCli(tempDir, [
      "node", "update", "node_0002",
      "--literal", 'print("now pinned")',
      "--json",
    ]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.oldHash).toBe(before.integrity.hash);
    expect(parsed.newHash).not.toBe(parsed.oldHash);
    const after = JSON.parse(fs.readFileSync(path.join(tempDir, ".ontology/nodes/node_0002.json"), "utf-8"));
    expect(after.literal).toBe('print("now pinned")');
  });

  it("--clear-literal removes the field entirely", () => {
    runCli(tempDir, ["node", "update", "node_0002", "--literal", 'print("temp")']);
    const before = JSON.parse(fs.readFileSync(path.join(tempDir, ".ontology/nodes/node_0002.json"), "utf-8"));
    expect(before.literal).toBe('print("temp")');
    const r = runCli(tempDir, ["node", "update", "node_0002", "--clear-literal", "--json"]);
    expect(r.status).toBe(0);
    const after = JSON.parse(fs.readFileSync(path.join(tempDir, ".ontology/nodes/node_0002.json"), "utf-8"));
    expect(after.literal).toBeUndefined();
  });

  it("rejects --literal and --clear-literal together", () => {
    const r = runCli(tempDir, [
      "node", "update", "node_0002",
      "--literal", "x",
      "--clear-literal",
    ]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("mutually exclusive");
  });

  it("--literal alone (no other flags) is enough to update", () => {
    const r = runCli(tempDir, ["node", "update", "node_0002", "--literal", "x", "--json"]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.ok).toBe(true);
  });
});
