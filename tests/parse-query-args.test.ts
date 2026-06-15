import { describe, it, expect } from "vitest";
import { parseQueryArgs } from "../src/surfaces/walker/state/parse-query-args.js";

describe("parseQueryArgs", () => {
  it("returns an empty shape for an empty input", () => {
    expect(parseQueryArgs("")).toEqual({ ok: true, shape: {} });
  });

  it("parses --kind with a single value", () => {
    expect(parseQueryArgs("--kind rule")).toEqual({
      ok: true,
      shape: { kind: ["rule"] },
    });
  });

  it("parses comma-separated multi-value flags", () => {
    expect(parseQueryArgs("--kind rule,decision --abstraction project,target")).toEqual({
      ok: true,
      shape: { kind: ["rule", "decision"], abstraction: ["project", "target"] },
    });
  });

  it("merges multiple occurrences of the same flag (union)", () => {
    expect(parseQueryArgs("--provides spec --provides typecheck")).toEqual({
      ok: true,
      shape: { provides: ["spec", "typecheck"] },
    });
  });

  it("supports the edge-presence flags", () => {
    expect(parseQueryArgs("--has-incoming refines --has-outgoing depends_on,implements")).toEqual({
      ok: true,
      shape: { hasIncoming: ["refines"], hasOutgoing: ["depends_on", "implements"] },
    });
  });

  it("rejects an unknown flag with a helpful message", () => {
    const r = parseQueryArgs("--temperature 0.7");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/unknown query flag: --temperature/);
  });

  it("rejects a flag with no value", () => {
    const r = parseQueryArgs("--kind");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/--kind requires a value/);
  });

  it("rejects a flag whose value is the next flag", () => {
    const r = parseQueryArgs("--kind --provides spec");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/--kind requires a value/);
  });

  it("rejects a flag whose value is empty after splitting", () => {
    const r = parseQueryArgs("--kind ,,");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/--kind requires a non-empty value/);
  });

  it("trims surrounding whitespace and tabs", () => {
    expect(parseQueryArgs("   --kind   rule,decision   ")).toEqual({
      ok: true,
      shape: { kind: ["rule", "decision"] },
    });
  });
});
