import { describe, it, expect } from "vitest";
import {
  buildOracleGroundingSystemSection,
  hashOracleGrounding,
} from "../src/forward/compile/oracle-grounding.js";
import { composeContextHash } from "../src/forward/compile/ast-grounding.js";

// Tests for the "oracle-into-generation" lever
// (REGEN_INTENT_CONSUMPTION_2026-06-17 §"WHAT TO BUILD" #1): the focal
// node's behaviour-fixture acceptance criteria are surfaced into the
// code_sketch system prompt and folded into the run-cache contextHash.
// The hashing/backward-compat contract mirrors ast-grounding.ts, so the
// shape of these tests deliberately matches tests/ast-grounding.test.ts.

const ACQUIRE = {
  name: "acquire on a fresh repo → returns a Lock recording this process",
  description:
    "Calling acquireLock on a repo with no lock file returns a handle " +
    "whose body records the current process's pid and this machine's hostname.",
};
const CROSS_HOST = {
  name: "cross-host held lock → refuses with kind cross_host_held",
  description:
    "A lock recording a different hostname must make acquireLock throw " +
    "with detail.kind === cross_host_held; it must not steal the foreign lock.",
};

describe("buildOracleGroundingSystemSection", () => {
  it("returns null when no constraints are provided", () => {
    expect(buildOracleGroundingSystemSection([])).toBeNull();
  });

  it("returns null when every constraint has an empty name (nothing to say)", () => {
    expect(
      buildOracleGroundingSystemSection([{ name: "" }, { name: "   " }]),
    ).toBeNull();
  });

  it("renders a prescriptive MUST-PASS block listing each criterion", () => {
    const out = buildOracleGroundingSystemSection([ACQUIRE, CROSS_HOST]);
    expect(out).not.toBeNull();
    expect(out).toMatch(/BEHAVIOURAL ACCEPTANCE CRITERIA/);
    expect(out).toMatch(/WILL be run against these/);
    expect(out).toMatch(/MUST implement the module so that EVERY one/);
    expect(out).toMatch(/1\. acquire on a fresh repo/);
    expect(out).toMatch(/2\. cross-host held lock/);
    // Descriptions are surfaced beneath each name.
    expect(out).toMatch(/cross_host_held/);
    // Emphasises that dropping behaviours fails the oracle.
    expect(out).toMatch(/will FAIL the oracle/);
  });

  it("renders the name alone when a constraint has no description", () => {
    const out = buildOracleGroundingSystemSection([{ name: "just a name" }]) ?? "";
    expect(out).toMatch(/1\. just a name/);
  });

  it("carries only contract prose — no fixture/implementation code leaks in", () => {
    // The shape that crosses into the prompt is {name, description}; even if
    // a caller's case object had extra fields, the section never reflects
    // setup/invoke/assert. We assert the rendered text contains no function
    // syntax markers a naive serialisation would have leaked.
    const out = buildOracleGroundingSystemSection([ACQUIRE]) ?? "";
    expect(out).not.toMatch(/=>/);
    expect(out).not.toMatch(/function/);
    expect(out).not.toMatch(/fs\.openSync|setup|invoke|assert/);
  });
});

describe("hashOracleGrounding", () => {
  it("returns null for empty constraints (legacy/no-oracle path)", () => {
    expect(hashOracleGrounding([])).toBeNull();
  });

  it("returns null when all names are blank", () => {
    expect(hashOracleGrounding([{ name: "  " }])).toBeNull();
  });

  it("returns an oracle:hash: prefixed digest for non-empty input", () => {
    const h = hashOracleGrounding([ACQUIRE]);
    expect(h).not.toBeNull();
    expect(h).toMatch(/^oracle:hash:[a-f0-9]+$/);
  });

  it("is deterministic across calls with the same input", () => {
    expect(hashOracleGrounding([ACQUIRE, CROSS_HOST])).toBe(
      hashOracleGrounding([ACQUIRE, CROSS_HOST]),
    );
  });

  it("is order-sensitive (case order is a stable property of the oracle)", () => {
    const a = hashOracleGrounding([ACQUIRE, CROSS_HOST]);
    const b = hashOracleGrounding([CROSS_HOST, ACQUIRE]);
    expect(a).not.toBe(b);
  });

  it("changes when a description changes (edited criterion separates the cache)", () => {
    const a = hashOracleGrounding([{ name: "n", description: "old" }]);
    const b = hashOracleGrounding([{ name: "n", description: "new" }]);
    expect(a).not.toBe(b);
  });

  it("uses a distinct namespace from grounding/rep (no collision)", () => {
    const h = hashOracleGrounding([ACQUIRE]) ?? "";
    expect(h).toMatch(/^oracle:hash:/);
    expect(h).not.toMatch(/^grounding:hash:/);
    expect(h).not.toMatch(/^rep:hash:/);
  });
});

describe("composeContextHash + oracle hash — backward-compat fold", () => {
  it("a null oracle hash preserves the upstream+grounding contextHash byte-for-byte", () => {
    const upstreamPlusGrounding = composeContextHash(
      "ctx:hash:upstream",
      "grounding:hash:exports",
    );
    const noOracle = composeContextHash(upstreamPlusGrounding, hashOracleGrounding([]));
    expect(noOracle).toBe(upstreamPlusGrounding);
  });

  it("a present oracle hash changes the contextHash (grounded+oracle caches distinctly)", () => {
    const upstreamPlusGrounding = composeContextHash(
      "ctx:hash:upstream",
      "grounding:hash:exports",
    );
    const withOracle = composeContextHash(
      upstreamPlusGrounding,
      hashOracleGrounding([ACQUIRE]),
    );
    expect(withOracle).not.toBeNull();
    expect(withOracle).toMatch(/^ctx:hash:/);
    expect(withOracle).not.toBe(upstreamPlusGrounding);
  });
});
