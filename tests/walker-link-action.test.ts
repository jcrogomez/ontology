import { describe, expect, it, afterEach } from "vitest";
import { runCli } from "./helpers/run-cli.js";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { linkFromWalker } from "../src/surfaces/walker/actions/link-from-walker.js";
import { loadNodeById } from "../src/kernel/core/project/load.js";
import { listProposals } from "../src/kernel/core/proposals/persist.js";

const cwds: string[] = [];

afterEach(() => {
  while (cwds.length > 0) cleanupTempProject(cwds.pop()!);
});

function setupProject(): string {
  const cwd = createTempProject();
  cwds.push(cwd);
  runCli(cwd, ["init"]);
  return cwd;
}

describe("linkFromWalker action", () => {
  it("creates an edge_create proposal from focal to target", () => {
    const cwd = setupProject();
    runCli(cwd, ["node", "create", "--level", "domain", "--kind", "decision", "--prompt", "intent"]);
    runCli(cwd, ["node", "create", "--level", "workflow", "--kind", "rule", "--prompt", "spec"]);

    const focal = loadNodeById("node_0001", cwd);
    expect(focal).not.toBeNull();

    const result = linkFromWalker({
      focal: focal!,
      to: "node_0002",
      type: "depends_on",
      cwd,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.from).toBe("node_0001");
      expect(result.to).toBe("node_0002");
      expect(result.type).toBe("depends_on");

      const proposals = listProposals(cwd);
      const found = proposals.find((p) => p.id === result.proposalId);
      expect(found).toBeDefined();
      expect(found!.status).toBe("pending");
      expect(found!.mutation.kind).toBe("edge_create");
      if (found!.mutation.kind === "edge_create") {
        expect(found!.mutation.payload.from).toBe("node_0001");
        expect(found!.mutation.payload.to).toBe("node_0002");
        expect(found!.mutation.payload.type).toBe("depends_on");
        expect(found!.mutation.fromHash).toBe(focal!.integrity.hash);
      }
    }
  });

  it("rejects self-loops up front (no proposal written)", () => {
    const cwd = setupProject();
    runCli(cwd, ["node", "create", "--level", "domain", "--kind", "decision", "--prompt", "intent"]);
    const focal = loadNodeById("node_0001", cwd);

    const result = linkFromWalker({
      focal: focal!,
      to: "node_0001",
      type: "refines",
      cwd,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/itself/);
    expect(listProposals(cwd)).toHaveLength(0);
  });

  it("rejects unknown edge types up front", () => {
    const cwd = setupProject();
    runCli(cwd, ["node", "create", "--level", "domain", "--kind", "decision", "--prompt", "intent"]);
    runCli(cwd, ["node", "create", "--level", "workflow", "--kind", "rule", "--prompt", "spec"]);
    const focal = loadNodeById("node_0001", cwd);

    const result = linkFromWalker({
      focal: focal!,
      to: "node_0002",
      type: "completely_made_up_edge",
      cwd,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/invalid edge type/);
    expect(listProposals(cwd)).toHaveLength(0);
  });

  it("rejects missing target nodes up front", () => {
    const cwd = setupProject();
    runCli(cwd, ["node", "create", "--level", "domain", "--kind", "decision", "--prompt", "intent"]);
    const focal = loadNodeById("node_0001", cwd);

    const result = linkFromWalker({
      focal: focal!,
      to: "node_9999",
      type: "depends_on",
      cwd,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/target node not found/);
    expect(listProposals(cwd)).toHaveLength(0);
  });

  it("rejects poset-violating refinement direction up front", () => {
    const cwd = setupProject();
    // Source at MORE abstract level (domain), target at LESS abstract (unit).
    // refines must climb: source level <= target level. Domain refining unit
    // is the inversion the validator should catch.
    runCli(cwd, ["node", "create", "--level", "domain", "--kind", "decision", "--prompt", "high"]);
    runCli(cwd, ["node", "create", "--level", "unit", "--kind", "function", "--prompt", "leaf"]);
    const focal = loadNodeById("node_0001", cwd);

    const result = linkFromWalker({
      focal: focal!,
      to: "node_0002",
      type: "refines",
      cwd,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/poset/);
    expect(listProposals(cwd)).toHaveLength(0);
  });
});
