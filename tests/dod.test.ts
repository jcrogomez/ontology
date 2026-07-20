import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { runCli } from "./helpers/run-cli.js";
import { downstreamDependents } from "../src/kernel/graph/sync-readiness.js";
import type { OntologyEdge } from "../src/kernel/schemas/ontology.js";

// Coverage for `onto dod` — the per-node DEFINITION OF DONE report. Read-only:
// three gates (rules live; structural + behaviour from a cached regen when one
// exists, else `unmeasured`) + trust-tier + downstream blast-radius.

// ── downstreamDependents (universal blast radius) ────────────────────────────

function dep(from: string, to: string): OntologyEdge {
  return {
    edgeId: `edge_${from}_${to}`,
    from,
    to,
    type: "depends_on",
    branch: "main",
    createdAt: "2026-07-12T00:00:00.000Z",
    createdByEventId: "evt",
    integrity: { hash: "h", schemaVersion: "1" },
  } as unknown as OntologyEdge;
}
const S = (...ids: string[]) => new Set(ids);

describe("downstreamDependents — universal per-node blast radius", () => {
  it("counts every shadowed node that transitively depends on a node", () => {
    // A → B → C (A depends on B depends on C). All shadowed.
    const counts = downstreamDependents([dep("A", "B"), dep("B", "C")], S("A", "B", "C"));
    expect(counts.get("C")).toBe(2); // A and B are downstream of C
    expect(counts.get("B")).toBe(1); // only A
    expect(counts.get("A") ?? 0).toBe(0); // nothing depends on the top
  });

  it("is defined for READY nodes too (unlike blockedDescendants)", () => {
    // Every node ready — computeSyncReadiness would give an empty blocker set,
    // but the blast radius is still meaningful.
    const counts = downstreamDependents([dep("A", "B")], S("A", "B"));
    expect(counts.get("B")).toBe(1);
  });

  it("only counts SHADOWED dependents", () => {
    // A depends on B, but A has no shadow → B's blast radius is 0.
    const counts = downstreamDependents([dep("A", "B")], S("B"));
    expect(counts.get("B") ?? 0).toBe(0);
  });
});

// ── onto dod (CLI, --json) ───────────────────────────────────────────────────

const SHADOW_REL = "src/hello.py";

function patchNode(tempDir: string, nodeId: string, mutate: (n: Record<string, unknown>) => void): void {
  const p = path.join(tempDir, ".ontology/nodes", `${nodeId}.json`);
  const n = JSON.parse(fs.readFileSync(p, "utf-8"));
  mutate(n);
  fs.writeFileSync(p, JSON.stringify(n, null, 2));
}

// An artifact node (node_0002) with a code shadow, refining a domain node
// (node_0001) refining canon. Only node_0002 is shadowed.
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

function writeCachedRegen(tempDir: string, nodeId: string, content: string): void {
  const dir = path.join(tempDir, ".ontology/verify");
  fs.mkdirSync(dir, { recursive: true });
  // Path convention: .ontology/verify/<id><ext-of-shadow>.
  fs.writeFileSync(path.join(dir, `${nodeId}.py`), content);
}

function writeFixture(tempDir: string, nodeId: string): void {
  const dir = path.join(tempDir, "tests/behavior-fixtures");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${nodeId}.fixture.ts`), "export const cases = [];\n");
}

function dod(tempDir: string, nodeId: string, ...extra: string[]): { status: number | null; report: any } {
  const r = runCli(tempDir, ["dod", nodeId, "--json", "--no-run", ...extra]);
  return { status: r.status, report: r.stdout ? JSON.parse(r.stdout).report : null };
}

describe("onto dod", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempProject();
  });

  afterEach(() => cleanupTempProject(tempDir));

  it("a shadow node with no fixture and no cached regen: lower tier, gates unmeasured/no-fixture", () => {
    const id = setupShadowNode(tempDir, 'print("hello world")');
    const { status, report } = dod(tempDir, id);
    expect(status).toBe(0);
    expect(report.hasShadow).toBe(true);
    expect(report.tier).toBe("lower"); // shadow, rules clean, no fixture
    expect(report.gates.rules.state).toBe("not-applicable"); // no static rules
    expect(report.gates.structural.state).toBe("unmeasured"); // no cached regen
    expect(report.gates.behaviour.state).toBe("no-fixture");
    expect(report.hasCachedRegen).toBe(false);
    expect(report.drift).toBe("no-anchor"); // no drift snapshot
  });

  it("measures the structural gate against a cached regen (identical → epsilon_equivalent pass)", () => {
    const src = 'print("hello world")\n';
    const id = setupShadowNode(tempDir, src);
    writeCachedRegen(tempDir, id, src); // identical regen → structure-preserving
    const { report } = dod(tempDir, id);
    expect(report.hasCachedRegen).toBe(true);
    expect(report.gates.structural.state).toBe("pass");
    expect(report.gates.structural.verdict).toBe("epsilon_equivalent");
    expect(report.gates.structural.measuredAt).toBeTruthy();
  });

  it("a structurally divergent cached regen fails the structural gate", () => {
    const id = setupShadowNode(tempDir, 'print("hello world")\n');
    writeCachedRegen(tempDir, id, "def a():\n  return 1\n".repeat(40)); // very different
    const { report } = dod(tempDir, id);
    expect(report.gates.structural.state).toBe("fail");
  });

  it("with a fixture but no cached regen, behaviour is unmeasured (not no-fixture)", () => {
    const id = setupShadowNode(tempDir, 'print("hello world")\n');
    writeFixture(tempDir, id);
    const { report } = dod(tempDir, id);
    expect(report.gates.behaviour.state).toBe("unmeasured");
  });

  it("a violated static rule blocks the node (rules fail, tier blocked)", () => {
    const id = setupShadowNode(tempDir, 'console.log("hi")\nprint("hello")\n');
    patchNode(tempDir, id, (n) => {
      n.rules = ["FORBID console.log"];
    });
    const { report } = dod(tempDir, id);
    expect(report.gates.rules.state).toBe("fail");
    expect(report.gates.rules.violations).toBeGreaterThan(0);
    expect(report.tier).toBe("blocked");
  });

  it("blast-radius counts shadowed dependents: the domain node is depended on by the shadowed artifact", () => {
    setupShadowNode(tempDir, 'print("hello world")\n');
    // node_0001 (domain, no shadow) is refined by node_0002 (shadowed) → blast 1.
    const domain = dod(tempDir, "node_0001");
    expect(domain.report.blastRadius).toBe(1);
    // The shadowed artifact itself has nothing shadowed downstream → 0.
    const artifact = dod(tempDir, "node_0002");
    expect(artifact.report.blastRadius).toBe(0);
  });

  it("errors cleanly on an unknown node id", () => {
    expect(runCli(tempDir, ["init"]).status).toBe(0);
    const r = runCli(tempDir, ["dod", "node_9999", "--json"]);
    expect(r.status).toBe(1);
    expect(JSON.parse(r.stdout).ok).toBe(false);
  });
});
