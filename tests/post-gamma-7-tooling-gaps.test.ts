import { describe, it, expect } from "vitest";
import { computeRunId } from "../src/kernel/core/runs/persist.js";
import { renderReportMarkdown } from "../src/surfaces/commands/verify/homeomorphism.js";
import type {
  AggregateReport,
  VerificationResult,
} from "../src/runtime/legend/verify-homeomorphism.js";
import type {
  PersistedRunInput,
  PersistedRunModel,
} from "../src/kernel/schemas/ontology.js";

// Tests for the 5 tooling gaps surfaced by the Vibe-Reasoning γ-7
// calibration (docs/legend/calibrations/VIBE_REASONING_GAMMA_7_2026-05-12.md).
//
// Gap 1 (token telemetry in JSON) and Gap 5 (thinking-mode flag) are
// covered end-to-end by the full vitest sweep over compile-cli +
// verify-homeomorphism integration; this file pins the pure-function
// surface that is easy to assert without spawning a process or
// mocking the Anthropic SDK.

const baseInput: PersistedRunInput = {
  promptHash: "prompt:hash:" + "a".repeat(64),
  contextHash: null,
  targetNodeId: "node_0001",
  branch: "main",
  time: null,
  task: "code_sketch",
  includeEdges: false,
  edgeTypes: null,
};

const baseModel: PersistedRunModel = {
  provider: "anthropic",
  model: "claude-opus-4-7",
  host: null,
};

describe("Gap 3 — run-id includes dispatch knobs", () => {
  it("baseline runId is stable across invocations (sanity)", () => {
    const a = computeRunId(baseInput, baseModel);
    const b = computeRunId(baseInput, baseModel);
    expect(a).toBe(b);
    expect(a).toMatch(/^run_[0-9a-f]{8}$/);
  });

  it("legacy input (no `dispatch` field) hashes identically to absent-field input", () => {
    // The `dispatch` field is optional; omitting it from the object
    // must produce the same hash as an explicitly-undefined field.
    // This is the backwards-compat invariant: pre-γ-7 runs without
    // dispatch knobs never had the field, and the new schema must
    // not retroactively invalidate them.
    const withoutField = { ...baseInput };
    const withUndefined: PersistedRunInput = {
      ...baseInput,
      dispatch: undefined,
    };
    expect(computeRunId(withoutField, baseModel)).toBe(
      computeRunId(withUndefined, baseModel),
    );
  });

  it("setting dispatch.maxTokens changes the runId", () => {
    const without = computeRunId(baseInput, baseModel);
    const with16k = computeRunId(
      { ...baseInput, dispatch: { maxTokens: 16384 } },
      baseModel,
    );
    expect(with16k).not.toBe(without);
  });

  it("different maxTokens values produce different runIds", () => {
    const at8k = computeRunId(
      { ...baseInput, dispatch: { maxTokens: 8192 } },
      baseModel,
    );
    const at16k = computeRunId(
      { ...baseInput, dispatch: { maxTokens: 16384 } },
      baseModel,
    );
    expect(at8k).not.toBe(at16k);
  });

  it("setting dispatch.thinking changes the runId", () => {
    const without = computeRunId(baseInput, baseModel);
    const disabled = computeRunId(
      { ...baseInput, dispatch: { thinking: "disabled" } },
      baseModel,
    );
    const adaptive = computeRunId(
      { ...baseInput, dispatch: { thinking: "adaptive" } },
      baseModel,
    );
    expect(disabled).not.toBe(without);
    expect(adaptive).not.toBe(without);
    expect(disabled).not.toBe(adaptive);
  });

  it("combining maxTokens + thinking is order-independent under canonical JSON", () => {
    // fast-json-stable-stringify sorts keys lexicographically, so
    // building the dispatch object in either order must yield the
    // same hash. This pins that property against a future regression
    // (e.g. someone swapping for a non-canonical stringify).
    const a = computeRunId(
      { ...baseInput, dispatch: { maxTokens: 16384, thinking: "disabled" } },
      baseModel,
    );
    const b = computeRunId(
      { ...baseInput, dispatch: { thinking: "disabled", maxTokens: 16384 } },
      baseModel,
    );
    expect(a).toBe(b);
  });
});

describe("Gap 2 — renderReportMarkdown", () => {
  function makeResult(overrides: Partial<VerificationResult> = {}): VerificationResult {
    return {
      nodeId: "node_0001",
      sourceFile: "/repo/src/foo.py",
      ok: true,
      verdict: "epsilon_equivalent",
      thresholds: { loc: 0.3, jaccard: 0.5 },
      metrics: {
        locDistance: 0.1,
        structuralJaccard: 1.0,
        originalLineCount: 100,
        regenLineCount: 110,
        originalDeclarations: ["foo", "bar"],
        regenDeclarations: ["foo", "bar"],
      },
      ...overrides,
    };
  }

  const baseReport: AggregateReport = {
    rootDir: "/tmp/test-project",
    thresholds: { loc: 0.3, jaccard: 0.5 },
    total: 3,
    byVerdict: {
      epsilon_equivalent: 2,
      divergent_loc: 0,
      divergent_structural: 1,
      divergent_both: 0,
      unrecoverable: 0,
    },
    results: [
      makeResult({ nodeId: "node_0001" }),
      makeResult({ nodeId: "node_0002" }),
      makeResult({
        nodeId: "node_0003",
        verdict: "divergent_structural",
        metrics: {
          locDistance: 0.2,
          structuralJaccard: 0.3,
          originalLineCount: 50,
          regenLineCount: 60,
          originalDeclarations: ["a", "b", "c"],
          regenDeclarations: ["a", "x", "y"],
        },
      }),
    ],
  };

  it("includes the expected top-level headers", () => {
    const md = renderReportMarkdown(baseReport);
    expect(md).toContain("# verify-homeomorphism report");
    expect(md).toContain("## Aggregate");
    expect(md).toContain("## Per-node");
    expect(md).toContain("## Methodology");
  });

  it("renders the aggregate verdict counts as a markdown table", () => {
    const md = renderReportMarkdown(baseReport);
    expect(md).toContain("| epsilon_equivalent | 2 | 67% |");
    expect(md).toContain("| divergent_structural | 1 | 33% |");
    expect(md).toContain("| **Total** | **3** |");
  });

  it("renders provided dispatch context when supplied", () => {
    const md = renderReportMarkdown(baseReport, {
      providerOverride: "anthropic",
      modelOverride: "claude-opus-4-7",
      maxTokens: 16384,
      thinking: "disabled",
    });
    expect(md).toContain("**Provider override:** anthropic");
    expect(md).toContain("**Model override:** `claude-opus-4-7`");
    expect(md).toContain("**Max tokens:** 16384");
    expect(md).toContain("**Thinking:** `disabled`");
  });

  it("renders per-node rows with verdicts and metrics", () => {
    const md = renderReportMarkdown(baseReport);
    expect(md).toContain("| `node_0001` |");
    expect(md).toContain("| `node_0002` |");
    expect(md).toContain("| `node_0003` |");
    expect(md).toContain("divergent_structural");
  });

  it("renders the totalUsage block when populated", () => {
    const reportWithUsage: AggregateReport = {
      ...baseReport,
      totalUsage: {
        promptTokens: 12000,
        completionTokens: 3000,
        totalTokens: 15000,
        costUSD: 0.135,
      },
    };
    const md = renderReportMarkdown(reportWithUsage);
    expect(md).toContain("Aggregate dispatch");
    expect(md).toContain("Input tokens: 12,000");
    expect(md).toContain("Output tokens: 3,000");
    expect(md).toContain("Estimated cost: `$0.1350`");
  });

  it("omits the totalUsage block when not populated (cost-estimate, dry-run, mock)", () => {
    const md = renderReportMarkdown(baseReport);
    expect(md).not.toContain("Aggregate dispatch");
    expect(md).not.toContain("Estimated cost");
  });

  it("renders unrecoverable failures with a follow-up row", () => {
    const unrecReport: AggregateReport = {
      rootDir: "/tmp/test-project",
      thresholds: { loc: 0.3, jaccard: 0.5 },
      total: 1,
      byVerdict: {
        epsilon_equivalent: 0,
        divergent_loc: 0,
        divergent_structural: 0,
        divergent_both: 0,
        unrecoverable: 1,
      },
      results: [
        {
          nodeId: "node_0001",
          sourceFile: "/repo/src/big.py",
          ok: false,
          failure: "compile-back failed: 429 rate limit",
          verdict: "unrecoverable",
          thresholds: { loc: 0.3, jaccard: 0.5 },
        },
      ],
    };
    const md = renderReportMarkdown(unrecReport);
    expect(md).toContain("unrecoverable");
    expect(md).toContain("compile-back failed: 429 rate limit");
  });
});
