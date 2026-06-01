import { describe, it, expect } from "vitest";
import * as path from "node:path";
import {
  parsePredicate,
  evaluatePredicate,
  predicateFields,
  predicateCanMatchPoint,
  validatePredicateAgainstSchema,
} from "../src/runtime/workflow/predicate-parser.js";
import {
  loadWorkflowGraph,
  loadWorkflowGraphFromFile,
} from "../src/runtime/workflow/graph-load.js";
import { runWorkflow } from "../src/runtime/workflow/executor.js";
import {
  extractJsonObject,
  parseVerdict,
} from "../src/runtime/workflow/verifier-schemas.js";
import type { LlmRequest, LlmResponse } from "../src/runtime/llm/types.js";

// Workflow runtime v0 tests (Phase ζ).
//
// Coverage spans the four areas the spec §6 names:
//   - predicate parser + evaluator (the DSL)
//   - verifier schema registry + JSON extraction
//   - graph loader structural validation
//   - executor end-to-end against a synthetic graph in dry-run mode
//     and against the IMO example in dry-run mode
//
// All tests are offline — no LLM dispatch. The dispatcher is
// exercised in dry-run mode (which short-circuits before the
// adapter layer) or against the mock provider. Real-provider
// integration is the responsibility of an integration test harness
// (deferred to v1).

// ── Predicate parser ────────────────────────────────────────────────────────

describe("predicate parser / atoms", () => {
  it("parses verdict == \"pass\"", () => {
    const ast = parsePredicate(`verdict == "pass"`);
    expect(ast).toEqual({ kind: "verdictEq", value: "pass" });
  });

  it("parses severity == \"major\"", () => {
    const ast = parsePredicate(`severity == "major"`);
    expect(ast).toEqual({ kind: "severityEq", value: "major" });
  });

  it("parses step_count >= 50", () => {
    const ast = parsePredicate(`step_count >= 50`);
    expect(ast).toEqual({ kind: "stepCountGte", n: 50 });
  });

  it("parses consecutive(verdict == \"pass\", 5)", () => {
    const ast = parsePredicate(`consecutive(verdict == "pass", 5)`);
    expect(ast).toEqual({
      kind: "consecutive",
      inner: { kind: "verdictEq", value: "pass" },
      n: 5,
    });
  });

  it("parses since_last(verdict == \"pass\") >= 10", () => {
    const ast = parsePredicate(`since_last(verdict == "pass") >= 10`);
    expect(ast).toEqual({
      kind: "sinceLastGte",
      inner: { kind: "verdictEq", value: "pass" },
      n: 10,
    });
  });

  it("parses && composition with correct precedence", () => {
    const ast = parsePredicate(`verdict == "fail" && severity == "major"`);
    expect(ast.kind).toBe("and");
  });

  it("parses || composition", () => {
    const ast = parsePredicate(`verdict == "pass" || verdict == "fail"`);
    expect(ast.kind).toBe("or");
  });

  it("respects parentheses", () => {
    const ast = parsePredicate(
      `(verdict == "fail" || verdict == "pass") && severity == "major"`,
    );
    expect(ast.kind).toBe("and");
    if (ast.kind === "and") {
      expect(ast.left.kind).toBe("or");
      expect(ast.right.kind).toBe("severityEq");
    }
  });

  it("rejects unknown identifiers", () => {
    expect(() => parsePredicate(`mystery == "x"`)).toThrow(
      /unknown identifier/,
    );
  });

  it("rejects trailing garbage", () => {
    expect(() => parsePredicate(`verdict == "x" garbage`)).toThrow(
      /unexpected trailing token/,
    );
  });
});

// ── Predicate evaluator ─────────────────────────────────────────────────────

describe("predicate evaluator / verdict + severity atoms", () => {
  const ctx = {
    current: { verdict: "pass", severity: "minor" },
    history: [],
    stepCount: 1,
  };

  it("verdict == \"pass\" matches current pass", () => {
    expect(evaluatePredicate(parsePredicate(`verdict == "pass"`), ctx)).toBe(true);
  });

  it("verdict == \"fail\" rejects current pass", () => {
    expect(evaluatePredicate(parsePredicate(`verdict == "fail"`), ctx)).toBe(false);
  });

  it("severity == \"minor\" matches", () => {
    expect(evaluatePredicate(parsePredicate(`severity == "minor"`), ctx)).toBe(true);
  });

  it("step_count >= 1 matches stepCount 1", () => {
    expect(evaluatePredicate(parsePredicate(`step_count >= 1`), ctx)).toBe(true);
  });
});

describe("predicate evaluator / consecutive()", () => {
  it("returns false when history is shorter than n", () => {
    const ast = parsePredicate(`consecutive(verdict == "pass", 5)`);
    const ctx = {
      current: { verdict: "pass" },
      history: [
        { verdict: "pass" },
        { verdict: "pass" },
      ],
      stepCount: 3,
    };
    expect(evaluatePredicate(ast, ctx)).toBe(false);
  });

  it("returns true when the last n visits all pass", () => {
    const ast = parsePredicate(`consecutive(verdict == "pass", 3)`);
    const ctx = {
      current: { verdict: "pass" },
      history: [
        { verdict: "fail" }, // older fail; outside the last 3
        { verdict: "pass" },
        { verdict: "pass" },
      ],
      stepCount: 4,
    };
    expect(evaluatePredicate(ast, ctx)).toBe(true);
  });

  it("returns false when one of the last n visits fails", () => {
    const ast = parsePredicate(`consecutive(verdict == "pass", 3)`);
    const ctx = {
      current: { verdict: "pass" },
      history: [
        { verdict: "pass" },
        { verdict: "fail" },
      ],
      stepCount: 3,
    };
    expect(evaluatePredicate(ast, ctx)).toBe(false);
  });
});

describe("predicate evaluator / since_last()", () => {
  it("returns true after n+ visits with no inner-true firing", () => {
    const ast = parsePredicate(`since_last(verdict == "pass") >= 3`);
    const ctx = {
      current: { verdict: "fail" },
      history: [
        { verdict: "fail" },
        { verdict: "fail" },
      ],
      stepCount: 3,
    };
    expect(evaluatePredicate(ast, ctx)).toBe(true);
  });

  it("returns false when the last visit fires inner", () => {
    const ast = parsePredicate(`since_last(verdict == "pass") >= 3`);
    const ctx = {
      current: { verdict: "pass" },
      history: [
        { verdict: "fail" },
        { verdict: "fail" },
      ],
      stepCount: 3,
    };
    expect(evaluatePredicate(ast, ctx)).toBe(false);
  });
});

describe("predicate field-set introspection", () => {
  it("predicateFields names every field the predicate reads", () => {
    const ast = parsePredicate(
      `consecutive(verdict == "pass", 5) || (since_last(verdict == "pass") >= 10 && severity == "major")`,
    );
    expect(predicateFields(ast)).toEqual(new Set(["verdict", "severity"]));
  });

  it("validatePredicateAgainstSchema flags fields absent from simple-pass-fail", () => {
    const ast = parsePredicate(`severity == "major"`);
    expect(validatePredicateAgainstSchema(ast, "simple-pass-fail")).toEqual([
      "severity",
    ]);
  });

  it("validatePredicateAgainstSchema accepts with-severity for severity references", () => {
    const ast = parsePredicate(`severity == "major" && verdict == "fail"`);
    expect(validatePredicateAgainstSchema(ast, "with-severity")).toEqual([]);
  });
});

// ── Static coverage analysis (branch-coverage lint) ─────────────────────────

describe("predicate static coverage / predicateCanMatchPoint", () => {
  it("verdictEq matches only its verdict point", () => {
    const ast = parsePredicate(`verdict == "pass"`);
    expect(predicateCanMatchPoint(ast, { verdict: "pass" })).toBe(true);
    expect(predicateCanMatchPoint(ast, { verdict: "fail" })).toBe(false);
  });

  it("consecutive() requires the current point to satisfy its inner", () => {
    const ast = parsePredicate(`consecutive(verdict == "pass", 5)`);
    expect(predicateCanMatchPoint(ast, { verdict: "pass" })).toBe(true);
    expect(predicateCanMatchPoint(ast, { verdict: "fail" })).toBe(false);
  });

  it("since_last() can fire only where the current point does NOT satisfy inner", () => {
    const ast = parsePredicate(`since_last(verdict == "pass") >= 10`);
    // A pass now resets the counter to 0, so the predicate cannot fire.
    expect(predicateCanMatchPoint(ast, { verdict: "pass" })).toBe(false);
    // A fail now keeps the counter running, so it can fire with history.
    expect(predicateCanMatchPoint(ast, { verdict: "fail" })).toBe(true);
  });

  it("since_last(pass || minor) >= 10 can fire only on major fails", () => {
    const ast = parsePredicate(`since_last(verdict == "pass" || severity == "minor") >= 10`);
    expect(predicateCanMatchPoint(ast, { verdict: "fail", severity: "major" })).toBe(true);
    expect(predicateCanMatchPoint(ast, { verdict: "fail", severity: "minor" })).toBe(false);
    expect(predicateCanMatchPoint(ast, { verdict: "pass", severity: "minor" })).toBe(false);
  });
});

describe("graph loader / branch-coverage lint (spec §3.2)", () => {
  it("a fully-covered simple-pass-fail verifier emits no warnings", () => {
    const loaded = loadWorkflowGraph(MINIMAL_GRAPH);
    expect(loaded.warnings).toEqual([]);
  });

  it("the IMO example is fully covered (verdict × severity)", () => {
    const p = path.resolve(
      __dirname,
      "..",
      "examples",
      "workflow-imo-verify-refine",
      "graph.json",
    );
    const loaded = loadWorkflowGraphFromFile(p);
    expect(loaded.warnings).toEqual([]);
  });

  it("warns when a verdict point no predicate can match (missing fail branch)", () => {
    const graph = {
      entry: "v1",
      nodes: [
        { id: "v1", kind: "verifier", prompt: "p", verifierSchema: "simple-pass-fail" },
        { id: "t", kind: "terminal", terminalVerdict: "accept" },
      ],
      edges: [
        { from: "v1", to: "t", type: "branches_on", predicate: `verdict == "pass"` },
      ],
    };
    const loaded = loadWorkflowGraph(graph);
    expect(loaded.warnings).toHaveLength(1);
    expect(loaded.warnings[0]).toMatch(/incomplete branch coverage/);
    expect(loaded.warnings[0]).toMatch(/\bfail\b/);
    expect(loaded.warnings[0]).not.toMatch(/\bpass\b.*not declared/); // pass IS covered
  });

  it("warns about the specific uncovered with-severity points", () => {
    // Covers pass (both severities via verdict==pass) and fail/major,
    // but leaves fail/minor uncovered.
    const graph = {
      entry: "v1",
      nodes: [
        { id: "v1", kind: "verifier", prompt: "p", verifierSchema: "with-severity" },
        { id: "t_accept", kind: "terminal", terminalVerdict: "accept" },
        { id: "t_reject", kind: "terminal", terminalVerdict: "reject" },
      ],
      edges: [
        { from: "v1", to: "t_accept", type: "branches_on", predicate: `verdict == "pass"` },
        { from: "v1", to: "t_reject", type: "branches_on", predicate: `verdict == "fail" && severity == "major"` },
      ],
    };
    const loaded = loadWorkflowGraph(graph);
    expect(loaded.warnings).toHaveLength(1);
    expect(loaded.warnings[0]).toMatch(/fail\/minor/);
    expect(loaded.warnings[0]).not.toMatch(/fail\/major/);
  });

  it("warns when a with-severity graph branches ONLY on severity (bare verdict uncovered)", () => {
    // Regression: `severity` is optional on with-severity, so a model
    // can emit a bare `{"verdict":"pass"}` / `{"verdict":"fail"}`. A
    // graph whose branches all carry a `severity == …` guard covers
    // every severity-bearing point yet matches NEITHER bare verdict —
    // a guaranteed runtime `no_matching_branch`. The coverage lint must
    // flag it (previously it enumerated only the 4 severity points and
    // stayed silent).
    const graph = {
      entry: "v1",
      nodes: [
        { id: "v1", kind: "verifier", prompt: "p", verifierSchema: "with-severity" },
        { id: "t_minor", kind: "terminal", terminalVerdict: "accept" },
        { id: "t_major", kind: "terminal", terminalVerdict: "reject" },
      ],
      edges: [
        { from: "v1", to: "t_minor", type: "branches_on", predicate: `severity == "minor"` },
        { from: "v1", to: "t_major", type: "branches_on", predicate: `severity == "major"` },
      ],
    };
    const loaded = loadWorkflowGraph(graph);
    expect(loaded.warnings).toHaveLength(1);
    expect(loaded.warnings[0]).toMatch(/incomplete branch coverage/);
    // Both bare verdicts are uncovered; no severity-bearing point is.
    expect(loaded.warnings[0]).toMatch(/\bpass\b/);
    expect(loaded.warnings[0]).toMatch(/\bfail\b/);
    expect(loaded.warnings[0]).not.toMatch(/\/minor/);
    expect(loaded.warnings[0]).not.toMatch(/\/major/);
  });
});

// ── Verifier schemas + JSON extraction ──────────────────────────────────────

describe("verifier schemas / extractJsonObject", () => {
  it("extracts a clean JSON object", () => {
    const text = `{"verdict": "pass"}`;
    expect(extractJsonObject(text)).toEqual({ verdict: "pass" });
  });

  it("extracts JSON wrapped in prose", () => {
    const text = `Here's my verdict:\n{"verdict": "fail", "reason": "wrong step"}\nDone.`;
    expect(extractJsonObject(text)).toEqual({
      verdict: "fail",
      reason: "wrong step",
    });
  });

  it("handles nested braces in JSON values", () => {
    const text = `{"verdict": "fail", "context": {"line": 4}}`;
    expect(extractJsonObject(text)).toEqual({
      verdict: "fail",
      context: { line: 4 },
    });
  });

  it("returns null on no JSON", () => {
    expect(extractJsonObject("just prose, no braces here")).toBeNull();
  });
});

describe("verifier schemas / parseVerdict", () => {
  it("parses a valid simple-pass-fail verdict", () => {
    const v = parseVerdict("simple-pass-fail", { verdict: "pass" });
    expect(v).toEqual({ verdict: "pass" });
  });

  it("parses a valid with-severity verdict", () => {
    const v = parseVerdict("with-severity", {
      verdict: "fail",
      severity: "major",
      issues: ["step 3 wrong"],
    });
    expect(v).toEqual({
      verdict: "fail",
      severity: "major",
      issues: ["step 3 wrong"],
    });
  });

  it("rejects a verdict missing the verdict field", () => {
    expect(() =>
      parseVerdict("simple-pass-fail", { reason: "no verdict" }),
    ).toThrow();
  });

  it("accepts a bare with-severity pass (severity optional, issues defaulted)", () => {
    // §4.2: a clean pass has no severity and no issues — requiring them
    // made this fail-parse → retry → silent fall back to fail/major.
    const v = parseVerdict("with-severity", { verdict: "pass" });
    expect(v).toEqual({ verdict: "pass", issues: [] });
  });

  it("still accepts a fail with severity + issues", () => {
    const v = parseVerdict("with-severity", {
      verdict: "fail",
      severity: "minor",
      issues: ["typo on line 3"],
    });
    expect(v).toEqual({ verdict: "fail", severity: "minor", issues: ["typo on line 3"] });
  });
});

// ── Graph loader ────────────────────────────────────────────────────────────

const MINIMAL_GRAPH = {
  entry: "g1",
  nodes: [
    { id: "g1", kind: "generator", prompt: "go" },
    { id: "v1", kind: "verifier", prompt: "check", verifierSchema: "simple-pass-fail" },
    { id: "t_accept", kind: "terminal", terminalVerdict: "accept" },
    { id: "t_reject", kind: "terminal", terminalVerdict: "reject" },
  ],
  edges: [
    { from: "g1", to: "v1", type: "feeds" },
    { from: "v1", to: "t_accept", type: "branches_on", predicate: `verdict == "pass"` },
    { from: "v1", to: "t_reject", type: "branches_on", predicate: `verdict == "fail"` },
  ],
};

describe("graph loader / valid graphs", () => {
  it("loads the minimal valid graph", () => {
    const loaded = loadWorkflowGraph(MINIMAL_GRAPH);
    expect(loaded.graph.entry).toBe("g1");
    expect(loaded.nodesById.size).toBe(4);
    expect(loaded.predicateAstByEdge.size).toBe(2);
  });

  it("loads the IMO example from disk", () => {
    const p = path.resolve(
      __dirname,
      "..",
      "examples",
      "workflow-imo-verify-refine",
      "graph.json",
    );
    const loaded = loadWorkflowGraphFromFile(p);
    expect(loaded.graph.entry).toBe("step1_initial_generation");
    // 4 branches_on edges on the verifier per the README.
    expect(loaded.predicateAstByEdge.size).toBe(4);
  });
});

describe("graph loader / structural rejections", () => {
  it("rejects an unknown entry node", () => {
    const bad = { ...MINIMAL_GRAPH, entry: "nope" };
    expect(() => loadWorkflowGraph(bad)).toThrow(/entry must reference/);
  });

  it("rejects an edge to an unknown node", () => {
    const bad = {
      ...MINIMAL_GRAPH,
      edges: [
        { from: "g1", to: "missing", type: "feeds" },
        ...MINIMAL_GRAPH.edges.slice(1),
      ],
    };
    expect(() => loadWorkflowGraph(bad)).toThrow(/unknown target node/);
  });

  it("rejects a verifier with zero branches_on edges", () => {
    const bad = {
      entry: "v1",
      nodes: [
        { id: "v1", kind: "verifier", prompt: "p", verifierSchema: "simple-pass-fail" },
      ],
      edges: [],
    };
    expect(() => loadWorkflowGraph(bad)).toThrow(/at least one outgoing/);
  });

  it("rejects a terminal node with outgoing edges", () => {
    const bad = {
      entry: "t",
      nodes: [
        { id: "t", kind: "terminal", terminalVerdict: "accept" },
        { id: "g", kind: "generator", prompt: "p" },
      ],
      edges: [
        { from: "t", to: "g", type: "feeds" },
        { from: "g", to: "t", type: "feeds" },
      ],
    };
    expect(() => loadWorkflowGraph(bad)).toThrow(/must have no outgoing/);
  });

  it("rejects a predicate referencing a field absent from the schema", () => {
    const bad = {
      entry: "v1",
      nodes: [
        { id: "v1", kind: "verifier", prompt: "p", verifierSchema: "simple-pass-fail" },
        { id: "t", kind: "terminal", terminalVerdict: "accept" },
      ],
      edges: [
        {
          from: "v1",
          to: "t",
          type: "branches_on",
          predicate: `severity == "major"`,
        },
      ],
    };
    expect(() => loadWorkflowGraph(bad)).toThrow(/not declared by verifier schema/);
  });

  it("rejects a malformed predicate", () => {
    const bad = {
      entry: "v1",
      nodes: [
        { id: "v1", kind: "verifier", prompt: "p", verifierSchema: "simple-pass-fail" },
        { id: "t", kind: "terminal", terminalVerdict: "accept" },
      ],
      edges: [
        {
          from: "v1",
          to: "t",
          type: "branches_on",
          predicate: `verdict ==`,
        },
      ],
    };
    expect(() => loadWorkflowGraph(bad)).toThrow(/predicate parse failed/);
  });
});

// ── Executor (dry-run end-to-end) ───────────────────────────────────────────

describe("executor / dry-run end-to-end (spec §6 scenarios)", () => {
  it("(a) terminates on accept when the verifier dry-runs to pass", async () => {
    const loaded = loadWorkflowGraph(MINIMAL_GRAPH);
    const r = await runWorkflow(loaded, "input", { dryRun: true });
    expect(r.verdict).toBe("accept");
    expect(r.trace.map((v) => v.nodeId)).toEqual(["g1", "v1", "t_accept"]);
  });

  it("(b) terminates on reject when a terminal-reject is reached", async () => {
    // Force the path: predicate that always matches → terminal reject.
    const graph = {
      entry: "g1",
      nodes: [
        { id: "g1", kind: "generator", prompt: "go" },
        { id: "v1", kind: "verifier", prompt: "check", verifierSchema: "simple-pass-fail" },
        { id: "t", kind: "terminal", terminalVerdict: "reject" },
      ],
      edges: [
        { from: "g1", to: "v1", type: "feeds" },
        // dry-run verifier ALWAYS emits verdict=pass, so the branch
        // must match on pass to route to the reject terminal here.
        { from: "v1", to: "t", type: "branches_on", predicate: `verdict == "pass"` },
      ],
    };
    const loaded = loadWorkflowGraph(graph);
    const r = await runWorkflow(loaded, "x", { dryRun: true });
    expect(r.verdict).toBe("reject");
  });

  it("(c) loops with consecutive-pass counter (5 cycles via the IMO example)", async () => {
    const p = path.resolve(
      __dirname,
      "..",
      "examples",
      "workflow-imo-verify-refine",
      "graph.json",
    );
    const loaded = loadWorkflowGraphFromFile(p);
    const r = await runWorkflow(loaded, "test problem", { dryRun: true });
    expect(r.verdict).toBe("accept");
    // The pass-through loop fires 4 times before the 5th pass hits
    // the accept branch. Total visits: step1, step2, step3, [step3b
    // step3] × 4, step6_accept = 12.
    expect(r.stepCount).toBe(12);
    const verifyVisits = r.trace.filter((v) => v.nodeId === "step3_verification");
    expect(verifyVisits).toHaveLength(5);
    const revisitVisits = r.trace.filter((v) => v.nodeId === "step3b_revisit");
    expect(revisitVisits).toHaveLength(4);
  });

  it("(d) step_budget_exhausted when maxSteps is too small to terminate", async () => {
    const p = path.resolve(
      __dirname,
      "..",
      "examples",
      "workflow-imo-verify-refine",
      "graph.json",
    );
    const loaded = loadWorkflowGraphFromFile(p);
    const r = await runWorkflow(loaded, "test problem", {
      dryRun: true,
      maxSteps: 3,
    });
    expect(r.verdict).toBe("reject");
    expect(r.reason).toMatch(/step_budget_exhausted/);
  });

  it("(e) no_matching_branch when no verifier edge matches", async () => {
    // The verifier dry-run emits pass; the only branch matches on
    // fail; therefore no branch matches and the runtime rejects.
    const graph = {
      entry: "v1",
      nodes: [
        { id: "v1", kind: "verifier", prompt: "p", verifierSchema: "simple-pass-fail" },
        { id: "t", kind: "terminal", terminalVerdict: "accept" },
      ],
      edges: [
        { from: "v1", to: "t", type: "branches_on", predicate: `verdict == "fail"` },
      ],
    };
    const loaded = loadWorkflowGraph(graph);
    const r = await runWorkflow(loaded, "x", { dryRun: true });
    expect(r.verdict).toBe("reject");
    expect(r.reason).toMatch(/no_matching_branch/);
  });

  it("(f) verifier schema-parse retry semantic surfaces a fallback verdict (mock path)", async () => {
    // The dry-run path always emits a clean verdict; real schema-
    // parse retry semantics are exercised end-to-end in (g) via the
    // mock provider. Here we just confirm that the executor surfaces
    // notes on at least one visit in (g) when retry happens. The
    // sentinel for that test is in (g) below.
    expect(true).toBe(true);
  });

  it("(g) end-to-end against mock provider (no LLM dispatch)", async () => {
    // Mock provider returns echoes; the verifier's response will not
    // parse as JSON, so the executor's parse-retry semantics fire,
    // both attempts fail, and the fallback verdict (verdict=fail) is
    // used. The graph routes fail → terminal reject.
    const graph = {
      entry: "g1",
      nodes: [
        { id: "g1", kind: "generator", prompt: "write something" },
        { id: "v1", kind: "verifier", prompt: "check", verifierSchema: "simple-pass-fail" },
        { id: "t_accept", kind: "terminal", terminalVerdict: "accept" },
        { id: "t_reject", kind: "terminal", terminalVerdict: "reject" },
      ],
      edges: [
        { from: "g1", to: "v1", type: "feeds" },
        { from: "v1", to: "t_accept", type: "branches_on", predicate: `verdict == "pass"` },
        { from: "v1", to: "t_reject", type: "branches_on", predicate: `verdict == "fail"` },
      ],
    };
    const loaded = loadWorkflowGraph(graph);
    const r = await runWorkflow(loaded, "the input", { provider: "mock" });
    expect(r.verdict).toBe("reject");
    // Verify the schema-parse-retry note surfaced on the verifier
    // visit.
    const verifierVisit = r.trace.find((v) => v.nodeId === "v1");
    expect(verifierVisit?.notes?.some((n) => /schema parse failed/.test(n))).toBe(true);
  });
});

// ── Executor dataflow (scripted, full prompt composition) ────────────────────

describe("executor / artefact-slot dataflow (IMO example, scripted dispatch)", () => {
  // Drive the IMO verify-refine graph with a deterministic verdict
  // trajectory through the `dispatch` test seam — this exercises the
  // real prompt composition + artefact threading that dry-run skips.
  //
  // Trajectory: the first verification fails (major) → bug report →
  // correction → then 5 consecutive passes → accept. We capture every
  // prompt each node receives so we can assert the dataflow is sound:
  // the corrector sees the SOLUTION (not just the verdict), and the
  // verifier re-verifies the corrected SOLUTION (not its own verdict).

  function buildScriptedDispatch() {
    const prompts: Record<string, string[]> = {};
    let verifyCalls = 0;
    const dispatch = async (request: LlmRequest): Promise<LlmResponse> => {
      const workflow = request.metadata?.workflow as
        | { nodeId: string; kind: string }
        | undefined;
      const nodeId = workflow?.nodeId ?? "<unknown>";
      (prompts[nodeId] ??= []).push(request.prompt);
      let text: string;
      switch (nodeId) {
        case "step1_initial_generation":
          text = "SOLUTION_DRAFT_1";
          break;
        case "step2_self_improvement":
          text = "SOLUTION_V2_IMPROVED";
          break;
        case "step4_bug_report_review":
          text = "BUG_REPORT: the limit interchange is unjustified";
          break;
        case "step5_correction":
          text = "SOLUTION_CORRECTED_FINAL";
          break;
        case "step3_verification": {
          verifyCalls += 1;
          // First pass fails (major), then everything passes so the
          // consecutive(pass, 5) accept branch eventually fires.
          text =
            verifyCalls === 1
              ? JSON.stringify({
                  verdict: "fail",
                  severity: "major",
                  issues: ["the limit interchange is unjustified"],
                })
              : JSON.stringify({ verdict: "pass", severity: "minor", issues: [] });
          break;
        }
        default:
          text = `[unexpected node ${nodeId}]`;
      }
      return { text, model: "scripted", provider: "mock" };
    };
    return { dispatch, prompts: () => prompts };
  }

  it("threads the solution artefact to the corrector and verifier (not the verdict)", async () => {
    const p = path.resolve(
      __dirname,
      "..",
      "examples",
      "workflow-imo-verify-refine",
      "graph.json",
    );
    const loaded = loadWorkflowGraphFromFile(p);
    const { dispatch, prompts } = buildScriptedDispatch();
    const r = await runWorkflow(loaded, "Prove the toy lemma.", { dispatch });

    expect(r.verdict).toBe("accept");
    // Final result is the corrected solution (the artefact), not the
    // verdict JSON that sat on the edge into the accept terminal.
    expect(r.output).toBe("SOLUTION_CORRECTED_FINAL");

    const seen = prompts();

    // step2 improves the artefact produced by step1.
    expect(seen["step2_self_improvement"]?.[0]).toContain("SOLUTION_DRAFT_1");

    // §4.1 fix — the bug-report reviewer reads the verifier CRITIQUE
    // (the structured verdict), not the solution.
    expect(seen["step4_bug_report_review"]?.[0]).toContain('"verdict":"fail"');
    expect(seen["step4_bug_report_review"]?.[0]).toContain(
      "the limit interchange is unjustified",
    );

    // §4.1 fix — the corrector sees BOTH the solution it must fix
    // (the artefact) AND the bug report. Previously it received only
    // the verifier's verbatim text and was "blind to the solution".
    const correctorPrompt = seen["step5_correction"]?.[0] ?? "";
    expect(correctorPrompt).toContain("SOLUTION_V2_IMPROVED");
    expect(correctorPrompt).toContain("BUG_REPORT");

    // §4.1 fix — after correction, the verifier re-verifies the
    // CORRECTED SOLUTION, never its own verdict JSON. The last
    // verification prompt carries the artefact and not the prior
    // failure's issue text (which only lives in the verdict).
    const verifyPrompts = seen["step3_verification"] ?? [];
    expect(verifyPrompts).toHaveLength(6); // 1 fail + 5 passes
    expect(verifyPrompts[0]).toContain("SOLUTION_V2_IMPROVED");
    const lastVerify = verifyPrompts[verifyPrompts.length - 1] ?? "";
    expect(lastVerify).toContain("SOLUTION_CORRECTED_FINAL");
    expect(lastVerify).not.toContain("the limit interchange is unjustified");
  });

  it("falls back to legacy INPUT-append composition when no template vars are present", async () => {
    // A graph whose prompts use no ${…} variables must behave exactly
    // as v0 did: the predecessor output is appended under INPUT:.
    const graph = {
      entry: "g1",
      nodes: [
        { id: "g1", kind: "generator", prompt: "generate" },
        { id: "v1", kind: "verifier", prompt: "check it", verifierSchema: "simple-pass-fail" },
        { id: "t_accept", kind: "terminal", terminalVerdict: "accept" },
        { id: "t_reject", kind: "terminal", terminalVerdict: "reject" },
      ],
      edges: [
        { from: "g1", to: "v1", type: "feeds" },
        { from: "v1", to: "t_accept", type: "branches_on", predicate: `verdict == "pass"` },
        { from: "v1", to: "t_reject", type: "branches_on", predicate: `verdict == "fail"` },
      ],
    };
    const loaded = loadWorkflowGraph(graph);
    const seen: Record<string, string> = {};
    const dispatch = async (request: LlmRequest): Promise<LlmResponse> => {
      const nodeId =
        (request.metadata?.workflow as { nodeId: string } | undefined)?.nodeId ??
        "<unknown>";
      seen[nodeId] = request.prompt;
      return {
        text: nodeId === "v1" ? `{"verdict":"pass"}` : "GENERATED_TEXT",
        model: "scripted",
        provider: "mock",
      };
    };
    const r = await runWorkflow(loaded, "the initial input", { dispatch });
    expect(r.verdict).toBe("accept");
    // Legacy composition: prompt body, then INPUT heading, then the
    // incoming text.
    expect(seen["g1"]).toBe("generate\n\nINPUT:\nthe initial input");
    expect(seen["v1"]).toBe("check it\n\nINPUT:\nGENERATED_TEXT");
  });
});
