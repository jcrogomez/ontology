import { describe, expect, it } from "vitest";
import { parseLinkArgs } from "../src/walker/state/parse-link-args.js";

describe("parseLinkArgs", () => {
  it("parses --to and --type in either order", () => {
    const a = parseLinkArgs(" --to node_0042 --type refines");
    expect(a.ok).toBe(true);
    if (a.ok) {
      expect(a.args).toEqual({ to: "node_0042", type: "refines" });
    }

    const b = parseLinkArgs(" --type implements --to node_0007");
    expect(b.ok).toBe(true);
    if (b.ok) {
      expect(b.args).toEqual({ to: "node_0007", type: "implements" });
    }
  });

  it("captures --rationale as the rest of the line, unquoted", () => {
    const r = parseLinkArgs(" --to node_0001 --type refines --rationale because the spec explicitly says so");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.args.to).toBe("node_0001");
      expect(r.args.type).toBe("refines");
      expect(r.args.rationale).toBe("because the spec explicitly says so");
    }
  });

  it("requires both --to and --type", () => {
    expect(parseLinkArgs("").ok).toBe(false);
    expect(parseLinkArgs(" --to node_0001").ok).toBe(false);
    expect(parseLinkArgs(" --type refines").ok).toBe(false);
  });

  it("rejects --from (the focal is the implicit source)", () => {
    const r = parseLinkArgs(" --from node_0001 --to node_0002 --type refines");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/--from/);
  });

  it("rejects unknown flags", () => {
    const r = parseLinkArgs(" --to node_0001 --type refines --weight 5");
    expect(r.ok).toBe(false);
  });

  it("rejects flags without a value", () => {
    const r = parseLinkArgs(" --to --type refines");
    expect(r.ok).toBe(false);
  });

  it("rejects an empty rationale", () => {
    const r = parseLinkArgs(" --to node_0001 --type refines --rationale");
    expect(r.ok).toBe(false);
  });
});
