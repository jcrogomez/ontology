import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { runCli } from "./helpers/run-cli.js";
import { nextActions } from "../src/surfaces/walker/actions/next-actions.js";

// `nextActions` — the "what do I do next?" triage behind the Walker panel. It
// derives the fix-first list from the same sync-readiness the status/dod
// commands use; here we assert the per-node MAPPING (reason + suggestion + tier)
// and that syncable-now is reported. The readiness math itself is covered by
// sync-readiness.test.ts.

const SHADOW_REL = "src/hello.py";

function patchNode(tempDir: string, nodeId: string, mutate: (n: Record<string, unknown>) => void): void {
  const p = path.join(tempDir, ".ontology/nodes", `${nodeId}.json`);
  const n = JSON.parse(fs.readFileSync(p, "utf-8"));
  mutate(n);
  fs.writeFileSync(p, JSON.stringify(n, null, 2));
}

function setupShadowNode(tempDir: string, sourceContent: string): string {
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
  fs.writeFileSync(shadowAbs, sourceContent);
  patchNode(tempDir, "node_0002", (n) => {
    n.outputs = { ...((n.outputs as object) ?? {}), files: [SHADOW_REL] };
  });
  return "node_0002";
}

describe("nextActions — the Walker's fix-first triage", () => {
  let tempDir: string;
  beforeEach(() => {
    tempDir = createTempProject();
  });
  afterEach(() => cleanupTempProject(tempDir));

  it("a shadow node with no fixture becomes a 'no fixture → onto probe' action", () => {
    const id = setupShadowNode(tempDir, 'print("hello world")\n');
    const r = nextActions(tempDir);
    expect(r.ok).toBe(true);
    const a = r.actions.find((x) => x.nodeId === id);
    expect(a).toBeTruthy();
    expect(a!.tier).toBe("lower");
    expect(a!.reason).toBe("no fixture");
    expect(a!.suggestion).toBe(`onto probe ${id}`);
    expect(typeof r.syncableNow).toBe("number");
  });

  it("a rule-violating node becomes a 'rule-viol → onto rules check' action", () => {
    const id = setupShadowNode(tempDir, 'console.log("x")\nprint("hi")\n');
    patchNode(tempDir, id, (n) => {
      n.rules = ["FORBID console.log"];
    });
    const r = nextActions(tempDir);
    const a = r.actions.find((x) => x.nodeId === id);
    expect(a).toBeTruthy();
    expect(a!.tier).toBe("blocked");
    expect(a!.reason).toMatch(/rule-viol/);
    expect(a!.suggestion).toBe(`onto rules check ${id}`);
  });

  it("actions are ranked by leverage (unblocks) descending", () => {
    setupShadowNode(tempDir, 'print("hi")\n');
    const r = nextActions(tempDir);
    for (let i = 1; i < r.actions.length; i++) {
      expect(r.actions[i - 1].unblocks).toBeGreaterThanOrEqual(r.actions[i].unblocks);
    }
  });
});
