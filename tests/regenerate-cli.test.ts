import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { runCli } from "./helpers/run-cli.js";

// Coverage for `onto regenerate <nodeId>` — the governed lever that
// regenerates a node's code shadow from its intent (forward functor F),
// verifies the candidate against the source on disk, and only with --write
// (and only when structure-preserving) overwrites the real source file.
//
// The mock provider is the identity functor for code_sketch (returns the
// prompt verbatim), so a node whose prompt equals its source compiles back
// byte-identical → epsilon_equivalent → write is a safe no-op; a node whose
// source diverges from the prompt → divergent → write is refused.

const SHADOW_REL = "src/hello.py";

// Build a node with a code shadow on disk + outputs.files pointing at it,
// mirroring an ingested node (node create has no --source-file flag, so we
// compile to a target then patch outputs.files, as ingest would set it).
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

  // Establish the shadow file on disk.
  const shadowAbs = path.join(tempDir, SHADOW_REL);
  fs.mkdirSync(path.dirname(shadowAbs), { recursive: true });
  fs.writeFileSync(shadowAbs, sourceContent);

  // Patch outputs.files so the node knows its shadow (ingest sets this).
  const nodePath = path.join(tempDir, ".ontology/nodes/node_0002.json");
  const node = JSON.parse(fs.readFileSync(nodePath, "utf-8"));
  node.outputs = { ...(node.outputs ?? {}), files: [SHADOW_REL] };
  fs.writeFileSync(nodePath, JSON.stringify(node, null, 2));
  return "node_0002";
}

describe("onto regenerate", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempProject();
  });

  afterEach(() => cleanupTempProject(tempDir));

  it("previews by default: stages a regen, reports a verdict, writes nothing to source", () => {
    const id = setupShadowNode(tempDir, 'print("hello world")');
    const shadowAbs = path.join(tempDir, SHADOW_REL);
    const before = fs.readFileSync(shadowAbs, "utf-8");

    const r = runCli(tempDir, ["regenerate", id, "--provider", "mock", "--json"]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.written).toBe(false);
    expect(parsed.verdict).toBe("epsilon_equivalent");
    // Source on disk untouched in preview mode.
    expect(fs.readFileSync(shadowAbs, "utf-8")).toBe(before);
    // The candidate was staged under .ontology/verify/.
    expect(fs.existsSync(path.join(tempDir, ".ontology/verify/node_0002.py"))).toBe(true);
  });

  it("--write overwrites the shadow when the regeneration is structure-preserving", () => {
    const id = setupShadowNode(tempDir, 'print("hello world")');
    const r = runCli(tempDir, ["regenerate", id, "--provider", "mock", "--write", "--json"]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.written).toBe(true);
    expect(parsed.verdict).toBe("epsilon_equivalent");
    // Mock is identity, so the shadow now equals the prompt.
    expect(fs.readFileSync(path.join(tempDir, SHADOW_REL), "utf-8")).toBe('print("hello world")');
  });

  it("--write refuses to clobber working source with a divergent regeneration", () => {
    // Source on disk is a large, structurally different file; the prompt
    // ('print("hello world")') compiles back to something divergent.
    const divergent = Array.from({ length: 40 }, (_, i) => `def f${i}(x):\n    return x * ${i}`).join("\n\n");
    const id = setupShadowNode(tempDir, divergent);
    const before = fs.readFileSync(path.join(tempDir, SHADOW_REL), "utf-8");

    const r = runCli(tempDir, ["regenerate", id, "--provider", "mock", "--write", "--json"]);
    expect(r.status).toBe(1);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.written).toBe(false);
    expect(parsed.writeBlockedReason).toContain("structure-preserving");
    // The working source is intact.
    expect(fs.readFileSync(path.join(tempDir, SHADOW_REL), "utf-8")).toBe(before);
  });

  it("refuses a node with no shadow (no outputs.files)", () => {
    expect(runCli(tempDir, ["init"]).status).toBe(0);
    expect(runCli(tempDir, ["node", "create", "--level", "domain", "--kind", "entity", "--prompt", "No shadow"]).status).toBe(0);
    const r = runCli(tempDir, ["regenerate", "node_0001", "--provider", "mock", "--json"]);
    expect(r.status).toBe(1);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.ok).toBe(false);
    expect(parsed.failure).toContain("no shadow to regenerate");
  });

  it("errors on an unknown node", () => {
    expect(runCli(tempDir, ["init"]).status).toBe(0);
    const r = runCli(tempDir, ["regenerate", "node_9999", "--provider", "mock", "--json"]);
    expect(r.status).toBe(1);
    expect(JSON.parse(r.stdout).failure).toContain("not found");
  });

  // Multi-draw consensus. The mock provider is deterministic (identity), so N
  // draws agree → consensus = N. That lets us test the consensus accounting and
  // the refusal paths deterministically.
  it("--draws: all draws agree (mock) → consensus reached, writes", () => {
    const id = setupShadowNode(tempDir, 'print("hello world")');
    const r = runCli(tempDir, ["regenerate", id, "--provider", "mock", "--draws", "3", "--write", "--json"]);
    expect(r.status).toBe(0);
    const p = JSON.parse(r.stdout);
    expect(p.draws).toBe(3);
    expect(p.consensusSize).toBe(3);
    expect(p.consensusK).toBe(2);
    expect(p.acceptableDraws).toBe(3);
    expect(p.written).toBe(true);
  });

  it("--draws preview reports the consensus picture without writing", () => {
    const id = setupShadowNode(tempDir, 'print("hello world")');
    const before = fs.readFileSync(path.join(tempDir, SHADOW_REL), "utf-8");
    const r = runCli(tempDir, ["regenerate", id, "--provider", "mock", "--draws", "3", "--json"]);
    expect(r.status).toBe(0);
    const p = JSON.parse(r.stdout);
    expect(p.written).toBe(false);
    expect(p.consensusSize).toBe(3);
    expect(p.clusterSizes).toEqual([3]);
    expect(fs.readFileSync(path.join(tempDir, SHADOW_REL), "utf-8")).toBe(before);
  });

  it("--draws refuses to write when the consensus floor cannot be met", () => {
    const id = setupShadowNode(tempDir, 'print("hello world")');
    const before = fs.readFileSync(path.join(tempDir, SHADOW_REL), "utf-8");
    // 3 draws can never reach a floor of 5 → blocked.
    const r = runCli(tempDir, ["regenerate", id, "--provider", "mock", "--draws", "3", "--consensus", "5", "--write", "--json"]);
    expect(r.status).toBe(1);
    const p = JSON.parse(r.stdout);
    expect(p.written).toBe(false);
    expect(p.writeBlockedReason).toContain("consensus not reached");
    expect(fs.readFileSync(path.join(tempDir, SHADOW_REL), "utf-8")).toBe(before);
  });

  it("--draws: divergent regenerations are unacceptable → no consensus, no write", () => {
    const divergent = Array.from({ length: 40 }, (_, i) => `def f${i}(x):\n    return x * ${i}`).join("\n\n");
    const id = setupShadowNode(tempDir, divergent);
    const before = fs.readFileSync(path.join(tempDir, SHADOW_REL), "utf-8");
    const r = runCli(tempDir, ["regenerate", id, "--provider", "mock", "--draws", "3", "--write", "--json"]);
    expect(r.status).toBe(1);
    const p = JSON.parse(r.stdout);
    expect(p.acceptableDraws).toBe(0);
    expect(p.consensusSize).toBe(0);
    expect(p.written).toBe(false);
    expect(fs.readFileSync(path.join(tempDir, SHADOW_REL), "utf-8")).toBe(before);
  });

  // Verify-refine loop (REGEN_INTENT_CONSUMPTION_2026-06-17 #2). The mock
  // provider is the identity functor, so it cannot actually "improve" across
  // rounds — but that lets us pin the loop MECHANICS deterministically:
  // early convergence, round accounting, and the no-refine output shape.
  it("default (no --refine) output carries no refine fields (backward-compat shape)", () => {
    const id = setupShadowNode(tempDir, 'print("hello world")');
    const p = JSON.parse(runCli(tempDir, ["regenerate", id, "--provider", "mock", "--json"]).stdout);
    expect(p.refineRounds).toBeUndefined();
    expect(p.refineRoundsUsed).toBeUndefined();
    expect(p.converged).toBeUndefined();
  });

  it("--refine: a round-1 acceptable regeneration converges immediately (no wasted rounds)", () => {
    const id = setupShadowNode(tempDir, 'print("hello world")');
    const r = runCli(tempDir, ["regenerate", id, "--provider", "mock", "--refine", "3", "--write", "--json"]);
    expect(r.status).toBe(0);
    const p = JSON.parse(r.stdout);
    expect(p.refineRounds).toBe(3);
    expect(p.refineRoundsUsed).toBe(1); // converged on the first round
    expect(p.converged).toBe(true);
    expect(p.verdict).toBe("epsilon_equivalent");
    expect(p.written).toBe(true);
  });

  it("--decompose: slices → assemble → gate; the identity node still verifies and writes", () => {
    // Mock is the identity functor (echoes the user prompt). The node here has
    // no TS top-level declarations, so decomposition plans a single slice; the
    // assembled output equals the source → epsilon_equivalent. This exercises
    // the full decompose path (slice dispatch with skipIntentGate + scoped
    // grounding, then assembly + the same gates) end-to-end.
    const id = setupShadowNode(tempDir, 'print("hello world")');
    const r = runCli(tempDir, ["regenerate", id, "--provider", "mock", "--decompose", "--write", "--json"]);
    expect(r.status).toBe(0);
    const p = JSON.parse(r.stdout);
    expect(p.verdict).toBe("epsilon_equivalent");
    expect(p.written).toBe(true);
    // Decompose pins a single candidate — no consensus/refine bookkeeping.
    expect(p.draws).toBeUndefined();
    expect(p.refineRounds).toBeUndefined();
  });

  it("--refine: a draft that never becomes acceptable exhausts the rounds without converging", () => {
    const divergent = Array.from({ length: 40 }, (_, i) => `def f${i}(x):\n    return x * ${i}`).join("\n\n");
    const id = setupShadowNode(tempDir, divergent);
    const before = fs.readFileSync(path.join(tempDir, SHADOW_REL), "utf-8");
    const r = runCli(tempDir, ["regenerate", id, "--provider", "mock", "--refine", "3", "--write", "--json"]);
    expect(r.status).toBe(1);
    const p = JSON.parse(r.stdout);
    expect(p.refineRounds).toBe(3);
    expect(p.refineRoundsUsed).toBe(3); // ran every round (mock cannot improve)
    expect(p.converged).toBe(false);
    expect(p.written).toBe(false);
    expect(fs.readFileSync(path.join(tempDir, SHADOW_REL), "utf-8")).toBe(before);
  });
});
