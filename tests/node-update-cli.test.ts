import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { runCli } from "./helpers/run-cli.js";

// `onto node update <id>` — the plasticity primitive. Edits a node in place,
// re-hashes, emits a node_updated event with old/new hashes. The audit chain
// is preserved (the event log records exactly what changed); the node file
// itself is rewritten.

describe("onto node update", () => {
  let cwd: string;

  beforeEach(() => {
    cwd = createTempProject();
    expect(runCli(cwd, ["init"]).status).toBe(0);
    expect(runCli(cwd, [
      "node", "create",
      "--level", "domain",
      "--kind", "entity",
      "--prompt", "Original prompt",
      "--label", "Original",
      "--requires", "tok_a",
      "--provides", "tok_b",
      "--forbids", "tok_c",
      "--rules", "FORBID: original_phrase",
    ]).status).toBe(0);
  });

  afterEach(() => cleanupTempProject(cwd));

  it("updates the prompt and emits a node_updated event with old and new hashes", () => {
    const nodePath = path.join(cwd, ".ontology", "nodes", "node_0001.json");
    const before = JSON.parse(fs.readFileSync(nodePath, "utf-8"));
    const oldHash = before.integrity.hash;

    const r = runCli(cwd, ["node", "update", "node_0001", "--prompt", "Refined prompt", "--json"]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.oldHash).toBe(oldHash);
    expect(parsed.newHash).not.toBe(oldHash);

    const after = JSON.parse(fs.readFileSync(nodePath, "utf-8"));
    expect(after.prompt.raw).toBe("Refined prompt");
    expect(after.integrity.hash).toBe(parsed.newHash);

    // Mirrored into inputs[role=source_prompt] so the run identity stays
    // consistent with the structured prompt.
    const sourceInput = after.inputs.find((i: { role: string; value: string }) => i.role === "source_prompt");
    expect(sourceInput.value).toBe("Refined prompt");

    // node_updated event landed at the tail of events.jsonl.
    const events = fs.readFileSync(path.join(cwd, ".ontology", "events.jsonl"), "utf-8")
      .split("\n").filter((l) => l.trim() !== "").map((l) => JSON.parse(l));
    const last = events[events.length - 1];
    expect(last.eventType).toBe("node_updated");
    expect(last.payload.nodeId).toBe("node_0001");
    expect(last.payload.oldHash).toBe(oldHash);
    expect(last.payload.newHash).toBe(parsed.newHash);
  });

  it("replaces requires / provides / forbids wholesale", () => {
    const r = runCli(cwd, [
      "node", "update", "node_0001",
      "--requires", "new_req_1,new_req_2",
      "--provides", "new_prov",
      "--forbids", "new_forbid",
      "--json",
    ]);
    expect(r.status).toBe(0);

    const node = JSON.parse(fs.readFileSync(path.join(cwd, ".ontology", "nodes", "node_0001.json"), "utf-8"));
    expect(node.context.requires.map((x: { source: string }) => x.source).sort()).toEqual(["new_req_1", "new_req_2"]);
    expect(node.context.provides.map((x: { key: string }) => x.key)).toEqual(["new_prov"]);
    expect(node.context.forbids.map((x: { source: string }) => x.source)).toEqual(["new_forbid"]);
  });

  it("passing an empty string clears the list (--rules \"\" empties node.rules)", () => {
    const r = runCli(cwd, ["node", "update", "node_0001", "--rules", "", "--json"]);
    expect(r.status).toBe(0);

    const node = JSON.parse(fs.readFileSync(path.join(cwd, ".ontology", "nodes", "node_0001.json"), "utf-8"));
    expect(node.rules).toEqual([]);
  });

  it("preserves untouched fields exactly", () => {
    // Only update the label. Prompt, rules, contract must stay byte-identical.
    const before = JSON.parse(fs.readFileSync(path.join(cwd, ".ontology", "nodes", "node_0001.json"), "utf-8"));
    const r = runCli(cwd, ["node", "update", "node_0001", "--label", "Refined Label", "--json"]);
    expect(r.status).toBe(0);

    const after = JSON.parse(fs.readFileSync(path.join(cwd, ".ontology", "nodes", "node_0001.json"), "utf-8"));
    expect(after.label).toBe("Refined Label");
    expect(after.prompt).toEqual(before.prompt);
    expect(after.rules).toEqual(before.rules);
    expect(after.context.requires).toEqual(before.context.requires);
    expect(after.context.provides).toEqual(before.context.provides);
    expect(after.context.forbids).toEqual(before.context.forbids);
  });

  it("validates with onto validate after an update (hash is consistent)", () => {
    const r = runCli(cwd, ["node", "update", "node_0001", "--prompt", "Refined again"]);
    expect(r.status).toBe(0);
    const v = runCli(cwd, ["validate"]);
    expect(v.status).toBe(0);
  });

  it("rejects no-op invocations — at least one mutating flag required", () => {
    const r = runCli(cwd, ["node", "update", "node_0001"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("at least one");
  });

  it("exits 1 when the node does not exist", () => {
    const r = runCli(cwd, ["node", "update", "node_ghost", "--prompt", "x"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("Node not found");
  });
});
