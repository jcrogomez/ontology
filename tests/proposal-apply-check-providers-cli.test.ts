import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { runCli } from "./helpers/run-cli.js";

// Auto-gluing in apply (CONTEXT_GLUING_REGIMES.md) — `onto proposal apply
// --check-providers` runs the O2 identify-if-equal sheaf check of a
// node_create proposal's declared `provides` against the existing providers of
// the same keys on the same branch. Compatible re-provisions (equal signature)
// → identification; drift (different signature) → warning. Opt-in, read-only,
// never blocks the apply (v0). Signature-bearing nodes/proposals are produced
// via the O4 workflow `--as-proposal` contract path.

describe("onto proposal apply --check-providers (auto-gluing in apply)", () => {
  let tempDir: string;

  const contractGraph = (key: string, signature: string) => ({
    name: "contract",
    entry: "g1",
    provides: [{ key, signature }],
    nodes: [
      { id: "g1", kind: "generator", prompt: "produce: ${INPUT}" },
      { id: "t", kind: "terminal", terminalVerdict: "accept" },
    ],
    edges: [{ from: "g1", to: "t", type: "feeds" }],
  });

  // Run a contract workflow as a proposal and return the proposal id.
  const proposeContract = (file: string, key: string, signature: string): string => {
    fs.writeFileSync(path.join(tempDir, file), JSON.stringify(contractGraph(key, signature)));
    const r = runCli(tempDir, [
      "workflow", "run", file,
      "--input", "input.txt",
      "--provider", "mock",
      "--as-proposal",
      "--proposal-level", "domain",
      "--proposal-kind", "action",
      "--json",
    ]);
    expect(r.status).toBe(0);
    return JSON.parse(r.stdout).proposal.id;
  };

  beforeEach(() => {
    tempDir = createTempProject();
    expect(runCli(tempDir, ["init"]).status).toBe(0);
    fs.writeFileSync(path.join(tempDir, "input.txt"), "seed");
  });

  afterEach(() => cleanupTempProject(tempDir));

  it("IDENTIFIES a compatible re-provision (equal signature) and still applies", () => {
    // First provider lands as a real node.
    const p1 = proposeContract("c1.json", "auth_login", "(creds: C): Session");
    expect(runCli(tempDir, ["proposal", "apply", p1, "--json"]).status).toBe(0);

    // A second proposal re-provides the same key with the SAME signature.
    const p2 = proposeContract("c2.json", "auth_login", "(creds: C): Session");
    const apply = runCli(tempDir, ["proposal", "apply", p2, "--check-providers", "--json"]);
    expect(apply.status).toBe(0);
    const parsed = JSON.parse(apply.stdout);
    expect(parsed.ok).toBe(true); // v0 never blocks
    expect(parsed.providerCheck.drift).toHaveLength(0);
    expect(parsed.providerCheck.identified.map((i: { key: string }) => i.key)).toContain("auth_login");
  });

  it("WARNS on a drifting re-provision (different signature) but still applies", () => {
    const p1 = proposeContract("d1.json", "auth_login", "(creds: C): Session");
    expect(runCli(tempDir, ["proposal", "apply", p1, "--json"]).status).toBe(0);

    // Re-provide the same key with a DIFFERENT signature.
    const p2 = proposeContract("d2.json", "auth_login", "(token: string): boolean");
    const apply = runCli(tempDir, ["proposal", "apply", p2, "--check-providers", "--json"]);
    expect(apply.status).toBe(0);
    const parsed = JSON.parse(apply.stdout);
    expect(parsed.ok).toBe(true); // v0 warns, does not block
    expect(parsed.providerCheck.identified).toHaveLength(0);
    expect(parsed.providerCheck.drift.map((d: { key: string }) => d.key)).toContain("auth_login");
  });

  it("without --check-providers, apply carries no providerCheck (default unchanged)", () => {
    const p1 = proposeContract("e1.json", "auth_login", "(creds: C): Session");
    runCli(tempDir, ["proposal", "apply", p1, "--json"]);
    const p2 = proposeContract("e2.json", "auth_login", "(token: string): boolean");
    const apply = runCli(tempDir, ["proposal", "apply", p2, "--json"]);
    expect(apply.status).toBe(0);
    expect(JSON.parse(apply.stdout).providerCheck).toBeUndefined();
  });
});
