// Walker action smoke tests for `graphViewFromWalker`.
//
// We construct a small project on disk via the CLI so the action operates
// against real `OntologyNode` records (full schema, real hashes via
// `node create`). Then we hand-craft a few edges via `onto node link` so
// the helper has something interesting to bucket. This way the tests
// exercise the production paths without having to mock load-by-id.

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { runCli } from "./helpers/run-cli.js";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { graphViewFromWalker } from "../src/walker/actions/graph-view-from-walker.js";

describe("graphViewFromWalker", () => {
  let cwd: string;

  beforeEach(() => {
    cwd = createTempProject();
    runCli(cwd, ["init"]);
  });

  afterEach(() => {
    cleanupTempProject(cwd);
  });

  it("returns ok=false with a clear message for a missing focal", () => {
    const r = graphViewFromWalker("node_does_not_exist", { cwd });
    expect(r.ok).toBe(false);
    expect(r.message).toContain("node not found");
  });

  it("returns the focal alone when no edges exist", () => {
    runCli(cwd, ["node", "create", "--level", "domain", "--kind", "decision", "--prompt", "lone focal"]);

    const r = graphViewFromWalker("node_0001", { cwd });
    expect(r.ok).toBe(true);
    expect(r.focal!.id).toBe("node_0001");
    expect(r.upstream).toEqual([]);
    expect(r.downstream).toEqual([]);
    expect(r.lateral).toEqual([]);
    expect(r.totalNodes).toBe(1);
  });

  it("buckets a direct outgoing edge as downstream", () => {
    // domain decision → workflow rule via `depends_on`. Edge is direction-
    // agnostic for poset, so this is allowed without inversion.
    runCli(cwd, ["node", "create", "--level", "domain", "--kind", "decision", "--prompt", "decision"]);
    runCli(cwd, ["node", "create", "--level", "workflow", "--kind", "rule", "--prompt", "rule"]);
    runCli(cwd, ["node", "link", "--from", "node_0001", "--to", "node_0002", "--type", "depends_on"]);

    const r = graphViewFromWalker("node_0001", { cwd });
    expect(r.ok).toBe(true);
    expect(r.downstream!.map((row) => row.id)).toContain("node_0002");
    expect(r.upstream!.map((row) => row.id)).not.toContain("node_0002");
  });

  it("buckets a direct incoming edge as upstream", () => {
    runCli(cwd, ["node", "create", "--level", "domain", "--kind", "decision", "--prompt", "downstream focal"]);
    runCli(cwd, ["node", "create", "--level", "workflow", "--kind", "rule", "--prompt", "upstream provider"]);
    // Edge node_0002 → node_0001 makes node_0002 upstream of node_0001.
    runCli(cwd, ["node", "link", "--from", "node_0002", "--to", "node_0001", "--type", "depends_on"]);

    const r = graphViewFromWalker("node_0001", { cwd });
    expect(r.ok).toBe(true);
    expect(r.upstream!.map((row) => row.id)).toContain("node_0002");
    expect(r.downstream!.map((row) => row.id)).not.toContain("node_0002");
  });

  it("respects the depth bound", () => {
    runCli(cwd, ["node", "create", "--level", "domain", "--kind", "decision", "--prompt", "n1"]);
    runCli(cwd, ["node", "create", "--level", "workflow", "--kind", "rule", "--prompt", "n2"]);
    runCli(cwd, ["node", "create", "--level", "interface", "--kind", "rule", "--prompt", "n3"]);
    // Chain: 0001 → 0002 → 0003.
    runCli(cwd, ["node", "link", "--from", "node_0001", "--to", "node_0002", "--type", "depends_on"]);
    runCli(cwd, ["node", "link", "--from", "node_0002", "--to", "node_0003", "--type", "depends_on"]);

    // depth=1: 0001 + 0002 only.
    const r1 = graphViewFromWalker("node_0001", { cwd, depth: 1 });
    expect(r1.ok).toBe(true);
    const r1ids = new Set([
      r1.focal!.id,
      ...(r1.upstream ?? []).map((row) => row.id),
      ...(r1.downstream ?? []).map((row) => row.id),
      ...(r1.lateral ?? []).map((row) => row.id),
    ]);
    expect(r1ids).toEqual(new Set(["node_0001", "node_0002"]));

    // depth=2: 0001 + 0002 + 0003.
    const r2 = graphViewFromWalker("node_0001", { cwd, depth: 2 });
    expect(r2.ok).toBe(true);
    const r2ids = new Set([
      r2.focal!.id,
      ...(r2.upstream ?? []).map((row) => row.id),
      ...(r2.downstream ?? []).map((row) => row.id),
      ...(r2.lateral ?? []).map((row) => row.id),
    ]);
    expect(r2ids).toEqual(new Set(["node_0001", "node_0002", "node_0003"]));
  });

  it("populates per-row connecting edges with type and direction", () => {
    runCli(cwd, ["node", "create", "--level", "domain", "--kind", "decision", "--prompt", "focal"]);
    runCli(cwd, ["node", "create", "--level", "workflow", "--kind", "rule", "--prompt", "neighbor"]);
    runCli(cwd, ["node", "link", "--from", "node_0001", "--to", "node_0002", "--type", "depends_on"]);

    const r = graphViewFromWalker("node_0001", { cwd });
    const downstreamRow = r.downstream!.find((row) => row.id === "node_0002");
    expect(downstreamRow).toBeDefined();
    // The downstream row sees the edge from its own perspective: the
    // edge's `from` is node_0001 (the focal), so from node_0002's view
    // the edge is "in" (incoming).
    const edge = downstreamRow!.connectingEdges.find((e) => e.otherEnd === "node_0001");
    expect(edge).toBeDefined();
    expect(edge!.type).toBe("depends_on");
    expect(edge!.direction).toBe("in");
  });

  it("is deterministic — same project, same result", () => {
    runCli(cwd, ["node", "create", "--level", "domain", "--kind", "decision", "--prompt", "n1"]);
    runCli(cwd, ["node", "create", "--level", "workflow", "--kind", "rule", "--prompt", "n2"]);
    runCli(cwd, ["node", "create", "--level", "interface", "--kind", "rule", "--prompt", "n3"]);
    runCli(cwd, ["node", "link", "--from", "node_0001", "--to", "node_0002", "--type", "depends_on"]);
    runCli(cwd, ["node", "link", "--from", "node_0001", "--to", "node_0003", "--type", "depends_on"]);

    const a = graphViewFromWalker("node_0001", { cwd });
    const b = graphViewFromWalker("node_0001", { cwd });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("skippedNodeIds is empty on a healthy project", () => {
    runCli(cwd, ["node", "create", "--level", "domain", "--kind", "decision", "--prompt", "focal"]);
    runCli(cwd, ["node", "create", "--level", "workflow", "--kind", "rule", "--prompt", "n2"]);
    runCli(cwd, ["node", "link", "--from", "node_0001", "--to", "node_0002", "--type", "depends_on"]);

    const r = graphViewFromWalker("node_0001", { cwd });
    expect(r.ok).toBe(true);
    expect(r.skippedNodeIds).toEqual([]);
  });

  it("reports skippedNodeIds when a slice member's node file is missing", () => {
    // Build a project where node_0001 has an outgoing edge to node_0002.
    // Then delete node_0002.json on disk. The edges log still references
    // node_0002, so extractSubgraph pulls it into the slice, but the
    // load loop cannot resolve it.
    runCli(cwd, ["node", "create", "--level", "domain", "--kind", "decision", "--prompt", "focal"]);
    runCli(cwd, ["node", "create", "--level", "workflow", "--kind", "rule", "--prompt", "victim"]);
    runCli(cwd, ["node", "link", "--from", "node_0001", "--to", "node_0002", "--type", "depends_on"]);

    const fs = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    fs.unlinkSync(path.join(cwd, ".ontology", "nodes", "node_0002.json"));

    const r = graphViewFromWalker("node_0001", { cwd });
    expect(r.ok).toBe(true);
    expect(r.skippedNodeIds).toEqual(["node_0002"]);
    // node_0002 must NOT appear in any bucket — it could not be loaded.
    const allBucketIds = [
      ...(r.upstream ?? []),
      ...(r.downstream ?? []),
      ...(r.lateral ?? []),
    ].map((row) => row.id);
    expect(allBucketIds).not.toContain("node_0002");
    // totalNodes still reflects the slice size, including the unloaded one,
    // so the renderer can honestly say "slice: 2 node(s)" even though only
    // one rendered.
    expect(r.totalNodes).toBe(2);
  });
});
