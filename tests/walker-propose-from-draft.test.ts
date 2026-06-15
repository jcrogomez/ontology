import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { runCli } from "./helpers/run-cli.js";
import { saveDraft, loadDraft } from "../src/kernel/core/drafts/persist.js";
import { proposeFromDraft } from "../src/walker/actions/propose-from-draft.js";
import { loadNodeById } from "../src/kernel/core/project/load.js";

// Tests the pure walker action — not the keystroke wiring. The walker
// surfaces the same action via `:propose`; verifying the action directly
// gives high coverage with no TUI flakiness.

describe("proposeFromDraft", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempProject();
    expect(runCli(tempDir, ["init"]).status).toBe(0);
  });

  afterEach(() => cleanupTempProject(tempDir));

  it("creates a node_create proposal as a child of the focal, inheriting level/kind", () => {
    // Create a domain entity to serve as the focal.
    expect(runCli(tempDir, ["node", "create", "--level", "domain", "--kind", "entity", "--prompt", "Inventory"]).status).toBe(0);
    // Save a draft for that focal.
    saveDraft({ focalNodeId: "node_0001", draftPrompt: "Refinement: stock_delta", cwd: tempDir });

    const focal = loadNodeById("node_0001", tempDir);
    expect(focal).not.toBeNull();

    const result = proposeFromDraft({ focal: focal!, cwd: tempDir });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const proposalFile = JSON.parse(
      fs.readFileSync(path.join(tempDir, ".ontology/proposals", `${result.proposalId}.json`), "utf-8"),
    );
    expect(proposalFile.status).toBe("pending");
    expect(proposalFile.mutation.kind).toBe("node_create");
    expect(proposalFile.mutation.payload.parentNodeId).toBe("node_0001");
    expect(proposalFile.mutation.payload.level).toBe("domain"); // inherited
    expect(proposalFile.mutation.payload.kind).toBe("entity");  // inherited
    expect(proposalFile.mutation.payload.prompt).toBe("Refinement: stock_delta");
    expect(proposalFile.source).toBeNull(); // manual proposal — no model run
    expect(proposalFile.provenance.derivedFrom).toEqual(["node_0001"]);
    expect(proposalFile.provenance.rationale).toBe("drafted in walker");
  });

  it("clears the draft on success by default", () => {
    expect(runCli(tempDir, ["node", "create", "--level", "domain", "--kind", "entity", "--prompt", "x"]).status).toBe(0);
    saveDraft({ focalNodeId: "node_0001", draftPrompt: "abc", cwd: tempDir });
    const focal = loadNodeById("node_0001", tempDir)!;

    const result = proposeFromDraft({ focal, cwd: tempDir });
    expect(result.ok).toBe(true);
    expect(loadDraft("node_0001", tempDir)).toBeNull();
  });

  it("preserves the draft when clearOnSuccess is false", () => {
    expect(runCli(tempDir, ["node", "create", "--level", "domain", "--kind", "entity", "--prompt", "x"]).status).toBe(0);
    saveDraft({ focalNodeId: "node_0001", draftPrompt: "abc", cwd: tempDir });
    const focal = loadNodeById("node_0001", tempDir)!;

    proposeFromDraft({ focal, cwd: tempDir, clearOnSuccess: false });
    expect(loadDraft("node_0001", tempDir)).not.toBeNull();
  });

  it("refuses with a clear message when no draft exists", () => {
    expect(runCli(tempDir, ["node", "create", "--level", "domain", "--kind", "entity", "--prompt", "x"]).status).toBe(0);
    const focal = loadNodeById("node_0001", tempDir)!;

    const result = proposeFromDraft({ focal, cwd: tempDir });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("no draft");
    expect(result.message).toContain("press i");
  });

  it("refuses with a clear message when the draft is empty whitespace", () => {
    expect(runCli(tempDir, ["node", "create", "--level", "domain", "--kind", "entity", "--prompt", "x"]).status).toBe(0);
    saveDraft({ focalNodeId: "node_0001", draftPrompt: "    \n  ", cwd: tempDir });
    const focal = loadNodeById("node_0001", tempDir)!;

    const result = proposeFromDraft({ focal, cwd: tempDir });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("empty");
  });

  it("captures the focal's current integrity hash as parentHash for stale detection", () => {
    expect(runCli(tempDir, ["node", "create", "--level", "domain", "--kind", "entity", "--prompt", "x"]).status).toBe(0);
    saveDraft({ focalNodeId: "node_0001", draftPrompt: "x", cwd: tempDir });
    const focal = loadNodeById("node_0001", tempDir)!;

    const result = proposeFromDraft({ focal, cwd: tempDir });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const proposalFile = JSON.parse(
      fs.readFileSync(path.join(tempDir, ".ontology/proposals", `${result.proposalId}.json`), "utf-8"),
    );
    expect(proposalFile.mutation.parentHash).toBe(focal.integrity.hash);
  });

  it("the resulting proposal can be applied via onto proposal apply (full audit chain)", () => {
    expect(runCli(tempDir, ["node", "create", "--level", "domain", "--kind", "entity", "--prompt", "Inventory"]).status).toBe(0);
    saveDraft({ focalNodeId: "node_0001", draftPrompt: "Refinement A", cwd: tempDir });
    const focal = loadNodeById("node_0001", tempDir)!;

    const propose = proposeFromDraft({ focal, cwd: tempDir });
    expect(propose.ok).toBe(true);
    if (!propose.ok) return;

    // Apply the proposal — should produce a real node_0002 child of node_0001.
    const apply = runCli(tempDir, ["proposal", "apply", propose.proposalId, "--json"]);
    expect(apply.status).toBe(0);
    const parsed = JSON.parse(apply.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.mutation.createdEntityId).toBe("node_0002");

    const newNode = JSON.parse(fs.readFileSync(path.join(tempDir, ".ontology/nodes/node_0002.json"), "utf-8"));
    expect(newNode.graph.parentId).toBe("node_0001");
    expect(newNode.coordinates.abstraction).toBe("domain");
    expect(newNode.kind).toBe("entity");
    expect(newNode.prompt.raw).toBe("Refinement A");

    // validate still passes after the lifecycle.
    expect(runCli(tempDir, ["validate"]).status).toBe(0);
  });
});
