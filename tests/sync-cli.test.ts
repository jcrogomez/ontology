import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { runCli } from "./helpers/run-cli.js";

// Coverage for `onto sync <nodeId>` — the governed intent→code loop in one
// command. It composes `regenerate` (multi-draw consensus) + the three gates
// (structural verdict, behaviour fixture, declared rules, all ON by default) +
// a PER-NODE drift re-anchor. See docs/SYNC_LOOP_SPEC.md.
//
// The mock provider is the identity functor for code_sketch (returns the prompt
// verbatim): a node whose source equals its prompt regenerates back
// byte-identical → epsilon_equivalent → write is a safe no-op; a node whose
// source diverges → refused.

const SHADOW_REL = "src/hello.py";

function patchNode(tempDir: string, nodeId: string, mutate: (n: Record<string, unknown>) => void): void {
  const nodePath = path.join(tempDir, ".ontology/nodes", `${nodeId}.json`);
  const node = JSON.parse(fs.readFileSync(nodePath, "utf-8"));
  mutate(node);
  fs.writeFileSync(nodePath, JSON.stringify(node, null, 2));
}

// Build an artifact node with a code shadow on disk + outputs.files pointing at
// it (mirrors an ingested node, as in regenerate-cli.test.ts).
function setupShadowNode(tempDir: string, sourceContent: string): string {
  expect(runCli(tempDir, ["init"]).status).toBe(0);
  expect(runCli(tempDir, ["node", "create", "--level", "domain", "--kind", "entity", "--prompt", "Greeting domain"]).status).toBe(0);
  expect(
    runCli(tempDir, [
      "node", "create",
      "--level", "artifact",
      "--kind", "artifact",
      "--manifestation", "code",
      "--language", "python",
      "--prompt", 'print("hello world")',
    ]).status,
  ).toBe(0);
  expect(runCli(tempDir, ["node", "link", "--from", "node_0001", "--to", "node_0000_canon", "--type", "refines"]).status).toBe(0);
  expect(runCli(tempDir, ["node", "link", "--from", "node_0002", "--to", "node_0001", "--type", "refines"]).status).toBe(0);

  const shadowAbs = path.join(tempDir, SHADOW_REL);
  fs.mkdirSync(path.dirname(shadowAbs), { recursive: true });
  fs.writeFileSync(shadowAbs, sourceContent);
  patchNode(tempDir, "node_0002", (n) => {
    n.outputs = { ...((n.outputs as object) ?? {}), files: [SHADOW_REL] };
  });
  return "node_0002";
}

describe("onto sync", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempProject();
  });

  afterEach(() => cleanupTempProject(tempDir));

  it("--dry-run runs the full loop but writes nothing and does not re-anchor", () => {
    const id = setupShadowNode(tempDir, 'print("hello world")');
    const shadowAbs = path.join(tempDir, SHADOW_REL);
    const before = fs.readFileSync(shadowAbs, "utf-8");

    const r = runCli(tempDir, ["sync", id, "--provider", "mock", "--dry-run", "--json"]);
    expect(r.status).toBe(0);
    const p = JSON.parse(r.stdout);
    expect(p.decision).toBe("preview");
    expect(p.regen.written).toBe(false);
    expect(p.reanchor).toBeUndefined();
    // Source untouched.
    expect(fs.readFileSync(shadowAbs, "utf-8")).toBe(before);
  });

  it("writes the shadow when all gates pass (gates are ON by default)", () => {
    const id = setupShadowNode(tempDir, 'print("hello world")');
    const r = runCli(tempDir, ["sync", id, "--provider", "mock", "--json"]);
    expect(r.status).toBe(0);
    const p = JSON.parse(r.stdout);
    expect(p.decision).toBe("wrote");
    expect(p.ok).toBe(true);
    expect(p.regen.written).toBe(true);
    // Default consensus posture: 3 draws, floor 2.
    expect(p.regen.draws).toBe(3);
    expect(p.regen.consensusK).toBe(2);
    expect(fs.readFileSync(path.join(tempDir, SHADOW_REL), "utf-8")).toBe('print("hello world")');
  });

  it("re-anchor is skipped (not an error) when no drift baseline exists yet", () => {
    const id = setupShadowNode(tempDir, 'print("hello world")');
    const r = runCli(tempDir, ["sync", id, "--provider", "mock", "--json"]);
    expect(r.status).toBe(0);
    const p = JSON.parse(r.stdout);
    expect(p.decision).toBe("wrote");
    expect(p.reanchor.anchored).toBe(false);
    expect(p.reanchor.reason).toContain("baseline");
  });

  it("re-anchors only the synced node once a baseline exists", () => {
    const id = setupShadowNode(tempDir, 'print("hello world")');
    expect(runCli(tempDir, ["drift", "--update"]).status).toBe(0);

    const r = runCli(tempDir, ["sync", id, "--provider", "mock", "--json"]);
    expect(r.status).toBe(0);
    const p = JSON.parse(r.stdout);
    expect(p.decision).toBe("wrote");
    expect(p.reanchor.anchored).toBe(true);
    expect(p.reanchor.paths).toContain(SHADOW_REL);
  });

  it("refuses (writes nothing, exits 1) when the regeneration is divergent", () => {
    const divergent = Array.from({ length: 40 }, (_, i) => `def f${i}(x):\n    return x * ${i}`).join("\n\n");
    const id = setupShadowNode(tempDir, divergent);
    const before = fs.readFileSync(path.join(tempDir, SHADOW_REL), "utf-8");

    const r = runCli(tempDir, ["sync", id, "--provider", "mock", "--json"]);
    expect(r.status).toBe(1);
    const p = JSON.parse(r.stdout);
    expect(p.ok).toBe(false);
    expect(p.decision).toBe("refused");
    expect(p.regen.written).toBe(false);
    // The working source is intact.
    expect(fs.readFileSync(path.join(tempDir, SHADOW_REL), "utf-8")).toBe(before);
  });

  it("enforces declared rules by default — a FORBID violation blocks the write", () => {
    // Structurally identical (source === prompt → epsilon) and no --check-rules
    // flag passed, yet a declared FORBID rule still blocks the write. (A
    // forbidden phrase is enforced upstream at compile-time intent validation,
    // so it surfaces as a compile-back refusal rather than the post-regen rule
    // gate — either way the invariant holds: a rule violation writes nothing.)
    const id = setupShadowNode(tempDir, 'print("hello world")');
    patchNode(tempDir, id, (n) => {
      n.rules = ["FORBID: hello"];
    });
    const before = fs.readFileSync(path.join(tempDir, SHADOW_REL), "utf-8");

    const r = runCli(tempDir, ["sync", id, "--provider", "mock", "--json"]);
    expect(r.status).toBe(1);
    const p = JSON.parse(r.stdout);
    expect(p.ok).toBe(false);
    expect(p.regen.written).toBe(false);
    // The precise reason is surfaced, not swallowed.
    expect(p.reason).toContain("hello");
    // The working source is intact.
    expect(fs.readFileSync(path.join(tempDir, SHADOW_REL), "utf-8")).toBe(before);
  });

  it("errors (exit 1) on an unknown node", () => {
    expect(runCli(tempDir, ["init"]).status).toBe(0);
    const r = runCli(tempDir, ["sync", "node_9999", "--provider", "mock", "--json"]);
    expect(r.status).toBe(1);
    const p = JSON.parse(r.stdout);
    expect(p.decision).toBe("error");
    expect(p.reason).toContain("not found");
  });

  it("--explain renders the reasoning (draws, structural, behaviour, rules)", () => {
    const id = setupShadowNode(tempDir, 'print("hello world")');
    const r = runCli(tempDir, ["sync", id, "--provider", "mock", "--explain"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("reasoning");
    expect(r.stdout).toContain("structural:");
    expect(r.stdout).toContain("behaviour:");
    expect(r.stdout).toContain("rules:");
    expect(r.stdout).toContain("WROTE");
  });

  // The safety property the per-node re-anchor exists for: syncing node A must
  // NOT mask drift in an unrelated node B. A bare `drift --update` (whole-graph)
  // would re-anchor B too and hide it; the scoped re-anchor must not.
  it("does not mask another node's drift when re-anchoring", () => {
    const id = setupShadowNode(tempDir, 'print("hello world")');

    // A second tracked artifact node B with its own shadow on disk.
    const OTHER_REL = "src/other.py";
    expect(
      runCli(tempDir, [
        "node", "create",
        "--level", "artifact", "--kind", "artifact",
        "--manifestation", "code", "--language", "python",
        "--prompt", 'print("other")',
      ]).status,
    ).toBe(0);
    const otherAbs = path.join(tempDir, OTHER_REL);
    fs.writeFileSync(otherAbs, 'print("other")');
    patchNode(tempDir, "node_0003", (n) => {
      n.outputs = { ...((n.outputs as object) ?? {}), files: [OTHER_REL] };
    });

    // Anchor both, then drift ONLY node B on disk.
    expect(runCli(tempDir, ["drift", "--update"]).status).toBe(0);
    fs.writeFileSync(otherAbs, 'print("other CHANGED")');

    // Sync node A — writes A (no-op) and re-anchors A only.
    const s = runCli(tempDir, ["sync", id, "--provider", "mock", "--json"]);
    expect(s.status).toBe(0);
    expect(JSON.parse(s.stdout).reanchor.anchored).toBe(true);

    // Node B's drift must still be visible.
    const d = runCli(tempDir, ["drift", "--json"]);
    const report = JSON.parse(d.stdout).report;
    expect(report.drifted).toBe(true);
    expect(report.changed).toContain(OTHER_REL);
  });
});
