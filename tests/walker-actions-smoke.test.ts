// Programmatic smoke tests for the new walker actions added in PR-C.
// Each action is a thin wrapper over a primitive that has its own unit
// tests; here we verify the wiring against a real fixture project.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { runCli } from "./helpers/run-cli.js";
import { validateFromWalker } from "../src/walker/actions/validate-from-walker.js";
import { branchListFromWalker } from "../src/walker/actions/branch-list-from-walker.js";
import { contextFromWalker } from "../src/walker/actions/context-from-walker.js";
import { queryFromWalker } from "../src/walker/actions/query-from-walker.js";

describe("walker actions (PR-C wiring smoke)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempProject();
    expect(runCli(tempDir, ["init"]).status).toBe(0);
    // Build a small chain: domain → artifact, refining canon.
    expect(runCli(tempDir, ["node", "create", "--level", "domain", "--kind", "entity", "--prompt", "d"]).status).toBe(0);
    expect(runCli(tempDir, ["node", "create",
      "--level", "artifact",
      "--kind", "artifact",
      "--manifestation", "code",
      "--language", "python",
      "--prompt", 'print("ok")',
    ]).status).toBe(0);
    expect(runCli(tempDir, ["node", "link", "--from", "node_0001", "--to", "node_0000_canon", "--type", "refines"]).status).toBe(0);
    expect(runCli(tempDir, ["node", "link", "--from", "node_0002", "--to", "node_0001", "--type", "refines"]).status).toBe(0);
  });

  afterEach(() => cleanupTempProject(tempDir));

  it("validateFromWalker returns ok on a freshly-built fixture", () => {
    const r = validateFromWalker(tempDir);
    expect(r.ok).toBe(true);
    expect(r.scanCompleted).toBe(true);
    expect(r.scanned.nodes).toBe(3); // canon + domain + artifact
    expect(r.scanned.edges).toBe(2); // both refines edges
    expect(r.violations).toEqual([]);
  });

  it("branchListFromWalker reports the default 'main' branch with the node count", () => {
    const r = branchListFromWalker(tempDir);
    expect(r.ok).toBe(true);
    expect(r.branches).toEqual(["main"]);
    expect(r.nodeCount).toBe(3);
  });

  it("contextFromWalker assembles a presheaf for the focal node", () => {
    const r = contextFromWalker("node_0002", tempDir);
    expect(r.ok).toBe(true);
    expect(r.output).toBeDefined();
    if (!r.output) return;
    expect(r.output.targetNodeId).toBe("node_0002");
    expect(r.output.branch).toBe("main");
    expect(r.output.nodes.length).toBeGreaterThan(0);
  });

  it("queryFromWalker filters by kind", () => {
    const r = queryFromWalker({ kind: ["artifact"] }, tempDir);
    expect(r.ok).toBe(true);
    expect(r.matches.map(n => n.id)).toEqual(["node_0002"]);
  });

  it("queryFromWalker on an empty shape returns every node (Yoneda identity)", () => {
    const r = queryFromWalker({}, tempDir);
    expect(r.ok).toBe(true);
    expect(r.matches.map(n => n.id).sort()).toEqual(["node_0000_canon", "node_0001", "node_0002"]);
  });

  it("queryFromWalker rejects an invalid shape via Zod", () => {
    const r = queryFromWalker({ kind: ["totally_invalid_kind"] } as any, tempDir);
    expect(r.ok).toBe(false);
    expect(r.message).toBeDefined();
  });
});
