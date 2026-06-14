import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { runCli } from "./helpers/run-cli.js";

// `onto rules check` / `onto rules audit` + the regenerate --check-rules gate.

function shadowNodeWithRules(tempDir: string, prompt: string, rules: string[], shadowContent: string): string {
  expect(runCli(tempDir, ["init"]).status).toBe(0);
  expect(runCli(tempDir, ["node", "create", "--level", "domain", "--kind", "entity", "--prompt", "d"]).status).toBe(0);
  expect(runCli(tempDir, ["node", "create", "--level", "artifact", "--kind", "artifact", "--manifestation", "code", "--language", "python", "--prompt", prompt]).status).toBe(0);
  const shadowAbs = path.join(tempDir, "shadow.py");
  fs.writeFileSync(shadowAbs, shadowContent);
  const nodePath = path.join(tempDir, ".ontology/nodes/node_0002.json");
  const node = JSON.parse(fs.readFileSync(nodePath, "utf-8"));
  node.rules = rules;
  node.outputs = { ...(node.outputs ?? {}), files: ["shadow.py"] };
  fs.writeFileSync(nodePath, JSON.stringify(node, null, 2));
  return "node_0002";
}

describe("onto rules check", () => {
  let tempDir: string;
  beforeEach(() => { tempDir = createTempProject(); });
  afterEach(() => cleanupTempProject(tempDir));

  it("FAILS (exit 1) when the shadow violates a FORBID-symbol rule", () => {
    const id = shadowNodeWithRules(tempDir, "x", ["FORBID: console.log"], 'console.log("nope")\n');
    const r = runCli(tempDir, ["rules", "check", id, "--json"]);
    expect(r.status).toBe(1);
    const p = JSON.parse(r.stdout);
    expect(p.violations).toBe(1);
    expect(p.checks[0].verdict).toBe("fail");
  });

  it("passes and triages a mixed rule set without false-accusing prose", () => {
    const id = shadowNodeWithRules(
      tempDir,
      "x",
      ["FORBID: console.log", "REQUIRE: f returns a number when called", "Ontology is a graph"],
      "def f():\n    return 1\n",
    );
    const r = runCli(tempDir, ["rules", "check", id, "--json"]);
    expect(r.status).toBe(0);
    const p = JSON.parse(r.stdout);
    expect(p.violations).toBe(0);
    expect(p.behavioural).toBe(1);
    expect(p.prose).toBe(1);
  });
});

describe("onto rules audit", () => {
  let tempDir: string;
  beforeEach(() => { tempDir = createTempProject(); });
  afterEach(() => cleanupTempProject(tempDir));

  it("reports the rule-class distribution across the graph", () => {
    shadowNodeWithRules(tempDir, "x", ["FORBID: console.log", "Ontology is a graph", "REQUIRE: f throws when empty"], "def f():\n    return 1\n");
    const r = runCli(tempDir, ["rules", "audit", "--json"]);
    expect(r.status).toBe(0);
    const p = JSON.parse(r.stdout);
    // init's canon node carries axiom "rules" (all prose), so assert deltas.
    expect(p.totalRules).toBeGreaterThanOrEqual(3);
    expect(p.distribution.forbid_static).toBe(1); // my FORBID: console.log
    expect(p.distribution.behavioural).toBeGreaterThanOrEqual(1);
    expect(p.distribution.prose).toBeGreaterThanOrEqual(1);
    expect(p.proseFraction).toBeGreaterThan(0);
  });
});

describe("regenerate --check-rules gate", () => {
  let tempDir: string;
  beforeEach(() => { tempDir = createTempProject(); });
  afterEach(() => cleanupTempProject(tempDir));

  // The rule gate's NEW enforcement is REQUIRE-symbol: validateIntent already
  // rejects FORBID phrases at compile time, but nothing checked REQUIRE before.
  it("blocks --write when a structure-preserving regen is missing a REQUIRE-symbol", () => {
    // Mock is the identity functor, so regen == prompt == shadow (→
    // epsilon_equivalent, passes the structural gate), but neither defines the
    // required symbol — the rule gate must block.
    const prompt = 'def greet():\n    return "hi"';
    const id = shadowNodeWithRules(tempDir, prompt, ["MUST export missingHelper"], prompt + "\n");
    const r = runCli(tempDir, ["regenerate", id, "--provider", "mock", "--check-rules", "--write", "--json"]);
    expect(r.status).toBe(1);
    const p = JSON.parse(r.stdout);
    expect(p.written).toBe(false);
    expect(p.writeBlockedReason).toContain("rule");
    expect(fs.readFileSync(path.join(tempDir, "shadow.py"), "utf-8")).toBe(prompt + "\n");
  });

  it("permits the write when the REQUIRE-symbol is present", () => {
    const prompt = 'def greet():\n    return "hi"';
    const id = shadowNodeWithRules(tempDir, prompt, ["MUST export greet"], prompt + "\n");
    const r = runCli(tempDir, ["regenerate", id, "--provider", "mock", "--check-rules", "--write", "--json"]);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).written).toBe(true);
  });
});
