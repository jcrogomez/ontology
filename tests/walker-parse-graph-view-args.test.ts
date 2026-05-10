import { describe, expect, it } from "vitest";
import { parseGraphViewArgs } from "../src/walker/state/parse-graph-view-args.js";

describe("parseGraphViewArgs", () => {
  it("returns depth 2 for an empty tail", () => {
    const r = parseGraphViewArgs("");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.depth).toBe(2);
  });

  it("trims whitespace before parsing", () => {
    const r = parseGraphViewArgs("   ");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.depth).toBe(2);
  });

  it("accepts a positive integer depth", () => {
    const r = parseGraphViewArgs("3");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.depth).toBe(3);
  });

  it("accepts depth 0 (focal-only view)", () => {
    const r = parseGraphViewArgs("0");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.depth).toBe(0);
  });

  it("rejects non-integer input with a clear message", () => {
    const r = parseGraphViewArgs("abc");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("integer depth");
  });

  it("rejects negative numbers (which would not match the integer regex)", () => {
    // -1 fails the leading regex, so the message is the integer-check
    // message rather than the range-check one. Either is acceptable;
    // pinning the actual behavior so we notice if a future refactor
    // accepts negatives by accident.
    const r = parseGraphViewArgs("-1");
    expect(r.ok).toBe(false);
  });

  it("rejects depths beyond the cap", () => {
    const r = parseGraphViewArgs("99");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("between");
  });

  it("rejects flag-style input rather than silently parsing", () => {
    const r = parseGraphViewArgs("--depth 3");
    expect(r.ok).toBe(false);
  });
});
