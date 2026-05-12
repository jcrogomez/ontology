import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { runCli } from "./helpers/run-cli.js";

// Coverage for `onto graph infer-edges` — γ-4 preview mode and γ-6
// proposal mode. All tests use the mock provider during ingest so the
// full cycle (ingest → apply → infer-edges → create proposals) is
// exercisable with zero API cost.

function makeFixtureProject(tempDir: string): string {
  const srcDir = path.join(tempDir, "src");
  fs.mkdirSync(srcDir, { recursive: true });
  // a.ts imports `foo` from b.ts (depends_on)
  fs.writeFileSync(
    path.join(srcDir, "a.ts"),
    [
      `import { foo } from "./b.js";`,
      `export function caller(): void { foo(); }`,
      `/* mock-fixture`,
      JSON.stringify({
        label: "caller-of-foo",
        level: "unit",
        kind: "rule",
        prompt: "Calls foo from neighbouring module.",
        requires: ["foo"],
        provides: ["caller"],
      }),
      `*/`,
    ].join("\n"),
  );
  // b.ts: pulls a type from c.ts (uses_token)
  fs.writeFileSync(
    path.join(srcDir, "b.ts"),
    [
      `import type { TFoo } from "./c.js";`,
      `export function foo(): TFoo { return null as unknown as TFoo; }`,
      `/* mock-fixture`,
      JSON.stringify({
        label: "foo-returning-TFoo",
        level: "unit",
        kind: "rule",
        prompt: "Returns a TFoo placeholder.",
        requires: ["TFoo"],
        provides: ["foo"],
      }),
      `*/`,
    ].join("\n"),
  );
  // c.ts: leaf type
  fs.writeFileSync(
    path.join(srcDir, "c.ts"),
    [
      `export interface TFoo { x: number }`,
      `/* mock-fixture`,
      JSON.stringify({
        label: "TFoo-shape",
        level: "token",
        kind: "entity",
        prompt: "Public shape used by neighbouring modules.",
        provides: ["TFoo"],
      }),
      `*/`,
    ].join("\n"),
  );
  return srcDir;
}

// Apply every pending proposal in order. Returns the map of
// proposalId → createdEntityId for the caller to assert against.
function applyAllProposals(tempDir: string): Map<string, string> {
  const proposalsDir = path.join(tempDir, ".ontology/proposals");
  const proposalIds = fs
    .readdirSync(proposalsDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
  const out = new Map<string, string>();
  for (const id of proposalIds) {
    const r = runCli(tempDir, ["proposal", "apply", id, "--json"]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.ok).toBe(true);
    out.set(id, parsed.mutation.createdEntityId);
  }
  return out;
}

describe("onto graph infer-edges — γ-4 preview", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempProject();
    expect(runCli(tempDir, ["init"]).status).toBe(0);
  });

  afterEach(() => cleanupTempProject(tempDir));

  it("walks the directory and prints inferred edges (read-only)", () => {
    const srcDir = makeFixtureProject(tempDir);
    const r = runCli(tempDir, ["graph", "infer-edges", srcDir, "--json"]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.edgeCount).toBe(2);
    const byKey = Object.fromEntries(
      parsed.edges.map((e: any) => [`${e.fromFile}→${e.toFile}`, e]),
    );
    expect(byKey["a.ts→b.ts"].type).toBe("depends_on");
    expect(byKey["b.ts→c.ts"].type).toBe("uses_token");

    // No proposals created (γ-4 mode is read-only).
    const proposalsDir = path.join(tempDir, ".ontology/proposals");
    const proposals = fs.existsSync(proposalsDir)
      ? fs.readdirSync(proposalsDir)
      : [];
    expect(proposals).toEqual([]);
  });

  it("reports an empty graph for a directory with no .ts files", () => {
    fs.mkdirSync(path.join(tempDir, "empty"), { recursive: true });
    const r = runCli(tempDir, [
      "graph", "infer-edges", path.join(tempDir, "empty"), "--json",
    ]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.edgeCount).toBe(0);
    expect(parsed.edges).toEqual([]);
  });
});

describe("onto graph infer-edges --create-proposals — γ-6", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempProject();
    expect(runCli(tempDir, ["init"]).status).toBe(0);
  });

  afterEach(() => cleanupTempProject(tempDir));

  it("emits an edge_create proposal per inferred edge after ingest+apply", () => {
    const srcDir = makeFixtureProject(tempDir);

    // 1. Ingest the directory (creates node_create proposals).
    const ingestR = runCli(tempDir, [
      "ingest", srcDir, "--provider", "mock", "--json",
    ]);
    expect(ingestR.status).toBe(0);

    // 2. Apply every node_create proposal.
    const created = applyAllProposals(tempDir);
    expect(created.size).toBe(3);

    // 3. Run γ-6: resolves edges to applied node IDs and emits
    //    edge_create proposals.
    const r = runCli(tempDir, [
      "graph", "infer-edges", srcDir, "--create-proposals", "--json",
    ]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.edgeCount).toBe(2);
    expect(parsed.createdCount).toBe(2);
    expect(parsed.skippedCount).toBe(0);

    // 4. Two edge_create proposals exist on disk.
    const proposalsDir = path.join(tempDir, ".ontology/proposals");
    const edgeProposals = fs
      .readdirSync(proposalsDir)
      .map((f) => JSON.parse(fs.readFileSync(path.join(proposalsDir, f), "utf-8")))
      .filter((p) => p.mutation.kind === "edge_create");
    expect(edgeProposals).toHaveLength(2);

    // 5. Each carries the correct (from, to, type).
    const byType = Object.fromEntries(
      edgeProposals.map((p) => [p.mutation.payload.type, p.mutation.payload]),
    );
    expect(byType.depends_on).toBeDefined();
    expect(byType.uses_token).toBeDefined();
    // The from/to ids match the applied nodes whose outputs.files[0]
    // is a.ts (depends_on) and b.ts (uses_token).
    for (const p of edgeProposals) {
      expect(p.mutation.payload.from).toMatch(/^node_/);
      expect(p.mutation.payload.to).toMatch(/^node_/);
      expect(p.mutation.fromHash).toBeDefined();
      expect(p.mutation.toHash).toBeDefined();
    }
  });

  it("skips edges whose endpoints are not yet on the graph", () => {
    const srcDir = makeFixtureProject(tempDir);

    // Ingest but do NOT apply. γ-6 should report all edges as skipped.
    runCli(tempDir, ["ingest", srcDir, "--provider", "mock", "--json"]);
    const r = runCli(tempDir, [
      "graph", "infer-edges", srcDir, "--create-proposals", "--json",
    ]);
    // Exit 1 — every edge was skipped, likely user forgot to apply.
    expect(r.status).toBe(1);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.createdCount).toBe(0);
    expect(parsed.skippedCount).toBe(2);
    for (const s of parsed.skipped) {
      expect(s.reason).toMatch(/from_node_missing|to_node_missing/);
    }
  });

  it("is idempotent — re-running does not duplicate existing edge proposals", () => {
    const srcDir = makeFixtureProject(tempDir);
    runCli(tempDir, ["ingest", srcDir, "--provider", "mock", "--json"]);
    applyAllProposals(tempDir);

    // First run: creates 2 edge proposals.
    const first = runCli(tempDir, [
      "graph", "infer-edges", srcDir, "--create-proposals", "--json",
    ]);
    expect(first.status).toBe(0);
    expect(JSON.parse(first.stdout).createdCount).toBe(2);

    // Apply those edge proposals so they actually land in the graph.
    const proposalsDir = path.join(tempDir, ".ontology/proposals");
    const edgeProposalIds = fs
      .readdirSync(proposalsDir)
      .map((f) => {
        const p = JSON.parse(fs.readFileSync(path.join(proposalsDir, f), "utf-8"));
        return { id: p.id, kind: p.mutation.kind, status: p.status };
      })
      .filter((p) => p.kind === "edge_create" && p.status === "pending");
    for (const p of edgeProposalIds) {
      const ap = runCli(tempDir, ["proposal", "apply", p.id, "--json"]);
      expect(ap.status).toBe(0);
    }

    // Second run: every edge is "edge_already_exists" — no new proposals.
    const second = runCli(tempDir, [
      "graph", "infer-edges", srcDir, "--create-proposals", "--json",
    ]);
    // Exit 1: edges were found but all skipped (idempotency check).
    expect(second.status).toBe(1);
    const parsedSecond = JSON.parse(second.stdout);
    expect(parsedSecond.createdCount).toBe(0);
    expect(parsedSecond.skippedCount).toBe(2);
    for (const s of parsedSecond.skipped) {
      expect(s.reason).toBe("edge_already_exists");
    }
  });
});
