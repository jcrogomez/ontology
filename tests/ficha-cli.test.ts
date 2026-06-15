import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { runCli } from "./helpers/run-cli.js";

// `onto ficha audit` / `onto ficha cleanup` — measure ficha quality and
// deterministically complete a thin contract with the AST export surface.

// A node whose source exports A, B, C but whose ficha only declares A.
function thinContractNode(tempDir: string): string {
  expect(runCli(tempDir, ["init"]).status).toBe(0);
  expect(runCli(tempDir, ["node", "create", "--level", "domain", "--kind", "entity", "--prompt", "d"]).status).toBe(0);
  expect(runCli(tempDir, ["node", "create", "--level", "artifact", "--kind", "artifact", "--manifestation", "code", "--language", "typescript", "--prompt", "x"]).status).toBe(0);
  const srcAbs = path.join(tempDir, "mod.ts");
  fs.writeFileSync(srcAbs, "export const alpha = 1;\nexport function beta() { return 2; }\nexport const gamma = 3;\n");
  const nodePath = path.join(tempDir, ".ontology/nodes/node_0002.json");
  const node = JSON.parse(fs.readFileSync(nodePath, "utf-8"));
  node.outputs = { ...(node.outputs ?? {}), files: ["mod.ts"] };
  node.context = { ...(node.context ?? {}), provides: [{ key: "alpha", nodeType: "declared" }] };
  fs.writeFileSync(nodePath, JSON.stringify(node, null, 2));
  return "node_0002";
}

describe("onto ficha audit", () => {
  let tempDir: string;
  beforeEach(() => { tempDir = createTempProject(); });
  afterEach(() => cleanupTempProject(tempDir));

  it("reports the contract gap (AST exports the ficha under-declares)", () => {
    thinContractNode(tempDir);
    const r = runCli(tempDir, ["ficha", "audit", "--json"]);
    expect(r.status).toBe(0);
    const p = JSON.parse(r.stdout);
    expect(p.totalMissingExports).toBe(2); // beta, gamma
    expect(p.nodesWithMissingExports).toBe(1);
    expect(p.worklist[0].nodeId).toBe("node_0002");
    expect(p.worklist[0].contractGap.missing.sort()).toEqual(["beta", "gamma"]);
  });
});

describe("onto ficha cleanup", () => {
  let tempDir: string;
  beforeEach(() => { tempDir = createTempProject(); });
  afterEach(() => cleanupTempProject(tempDir));

  it("previews the missing exports without mutating", () => {
    const id = thinContractNode(tempDir);
    const before = fs.readFileSync(path.join(tempDir, ".ontology/nodes/node_0002.json"), "utf-8");
    const r = runCli(tempDir, ["ficha", "cleanup", id, "--json"]);
    expect(r.status).toBe(0);
    const p = JSON.parse(r.stdout);
    expect(p.applied).toBe(false);
    expect(p.missingExports.sort()).toEqual(["beta", "gamma"]);
    expect(fs.readFileSync(path.join(tempDir, ".ontology/nodes/node_0002.json"), "utf-8")).toBe(before);
  });

  it("--apply completes the contract with the AST exports", () => {
    const id = thinContractNode(tempDir);
    const r = runCli(tempDir, ["ficha", "cleanup", id, "--apply", "--json"]);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).applied).toBe(true);
    const node = JSON.parse(fs.readFileSync(path.join(tempDir, ".ontology/nodes/node_0002.json"), "utf-8"));
    const keys = node.context.provides.map((p: { key: string }) => p.key).sort();
    expect(keys).toEqual(["alpha", "beta", "gamma"]);
    // Re-auditing shows the gap closed.
    const audit = JSON.parse(runCli(tempDir, ["ficha", "audit", "--json"]).stdout);
    expect(audit.totalMissingExports).toBe(0);
  });

  it("--apply preserves existing provides signatures (does not drop O1 sigs)", () => {
    const id = thinContractNode(tempDir);
    // Give the existing `alpha` provide an O1 signature.
    const nodePath = path.join(tempDir, ".ontology/nodes/node_0002.json");
    const node = JSON.parse(fs.readFileSync(nodePath, "utf-8"));
    node.context.provides = [{ key: "alpha", nodeType: "declared", signature: "resolved:1" }];
    fs.writeFileSync(nodePath, JSON.stringify(node, null, 2));

    expect(runCli(tempDir, ["ficha", "cleanup", id, "--apply"]).status).toBe(0);
    const after = JSON.parse(fs.readFileSync(nodePath, "utf-8")).context.provides;
    const alpha = after.find((p: { key: string }) => p.key === "alpha");
    expect(alpha.signature).toBe("resolved:1"); // signature preserved
    expect(after.map((p: { key: string }) => p.key).sort()).toEqual(["alpha", "beta", "gamma"]);
  });

  it("is a no-op when the contract is already complete", () => {
    const id = thinContractNode(tempDir);
    runCli(tempDir, ["ficha", "cleanup", id, "--apply"]);
    const r = runCli(tempDir, ["ficha", "cleanup", id, "--json"]);
    expect(r.status).toBe(0);
    const p = JSON.parse(r.stdout);
    expect(p.missingExports).toEqual([]);
    expect(p.applied).toBe(false);
  });
});

// A node whose source exports alpha + beta, but whose ficha over-declares:
// it claims `ghost` (an imported/private symbol the source does NOT export).
function overDeclaredNode(tempDir: string): string {
  expect(runCli(tempDir, ["init"]).status).toBe(0);
  expect(runCli(tempDir, ["node", "create", "--level", "domain", "--kind", "entity", "--prompt", "d"]).status).toBe(0);
  expect(runCli(tempDir, ["node", "create", "--level", "artifact", "--kind", "artifact", "--manifestation", "code", "--language", "typescript", "--prompt", "x"]).status).toBe(0);
  fs.writeFileSync(path.join(tempDir, "mod.ts"), "export const alpha = 1;\nexport function beta() { return 2; }\n");
  const nodePath = path.join(tempDir, ".ontology/nodes/node_0002.json");
  const node = JSON.parse(fs.readFileSync(nodePath, "utf-8"));
  node.outputs = { ...(node.outputs ?? {}), files: ["mod.ts"] };
  node.context = {
    ...(node.context ?? {}),
    provides: [
      { key: "alpha", nodeType: "declared", signature: "resolved:1" },
      { key: "ghost", nodeType: "declared" }, // phantom: not exported by mod.ts
    ],
  };
  fs.writeFileSync(nodePath, JSON.stringify(node, null, 2));
  return "node_0002";
}

describe("onto ficha audit/cleanup — phantom provides (over-declaration)", () => {
  let tempDir: string;
  beforeEach(() => { tempDir = createTempProject(); });
  afterEach(() => cleanupTempProject(tempDir));

  it("audit reports phantom provides (declared keys the source doesn't export)", () => {
    overDeclaredNode(tempDir);
    const p = JSON.parse(runCli(tempDir, ["ficha", "audit", "--json"]).stdout);
    expect(p.nodesWithPhantomProvides).toBe(1);
    expect(p.totalPhantomProvides).toBe(1); // ghost
    expect(p.worklist[0].contractOverflow.phantom).toEqual(["ghost"]);
  });

  it("cleanup WITHOUT --prune never removes a phantom provide", () => {
    const id = overDeclaredNode(tempDir);
    // beta is a genuine missing export → cleanup completes it, but ghost stays.
    runCli(tempDir, ["ficha", "cleanup", id, "--apply"]);
    const provides = JSON.parse(fs.readFileSync(path.join(tempDir, ".ontology/nodes/node_0002.json"), "utf-8")).context.provides;
    const keys = provides.map((p: { key: string }) => p.key).sort();
    expect(keys).toContain("ghost"); // not pruned without --prune
    expect(keys).toContain("beta"); // completion still happened
  });

  it("--prune --apply removes phantom provides, keeps real exports + signatures", () => {
    const id = overDeclaredNode(tempDir);
    const r = runCli(tempDir, ["ficha", "cleanup", id, "--prune", "--apply", "--json"]);
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.applied).toBe(true);
    expect(out.phantomProvides).toEqual(["ghost"]);

    const provides = JSON.parse(fs.readFileSync(path.join(tempDir, ".ontology/nodes/node_0002.json"), "utf-8")).context.provides;
    const keys = provides.map((p: { key: string }) => p.key).sort();
    // ghost pruned; beta added (completion); alpha kept WITH its signature.
    expect(keys).toEqual(["alpha", "beta"]);
    expect(provides.find((p: { key: string }) => p.key === "alpha").signature).toBe("resolved:1");

    // Re-auditing shows no phantom and no missing.
    const audit = JSON.parse(runCli(tempDir, ["ficha", "audit", "--json"]).stdout);
    expect(audit.totalPhantomProvides).toBe(0);
    expect(audit.totalMissingExports).toBe(0);
  });

  it("--prune preview reports the phantom without mutating", () => {
    const id = overDeclaredNode(tempDir);
    const before = fs.readFileSync(path.join(tempDir, ".ontology/nodes/node_0002.json"), "utf-8");
    const out = JSON.parse(runCli(tempDir, ["ficha", "cleanup", id, "--prune", "--json"]).stdout);
    expect(out.applied).toBe(false);
    expect(out.phantomProvides).toEqual(["ghost"]);
    expect(fs.readFileSync(path.join(tempDir, ".ontology/nodes/node_0002.json"), "utf-8")).toBe(before);
  });
});
