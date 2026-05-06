import { describe, it, expect } from "vitest";
import {
  buildUpstreamSystemPrompt,
  hashUpstreamContext,
  type UpstreamContextItem,
} from "../src/runtime/compile/upstream-context.js";

describe("buildUpstreamSystemPrompt", () => {
  it("returns null when there are no upstreams (so callers omit `system`)", () => {
    expect(buildUpstreamSystemPrompt([])).toBe(null);
  });

  it("includes each upstream as its own labeled section", () => {
    const items: UpstreamContextItem[] = [
      { nodeId: "node_0000_canon", level: "canon", text: "Axioms here." },
      { nodeId: "node_0001", level: "project", text: "A demo project." },
    ];
    const s = buildUpstreamSystemPrompt(items);
    expect(s).not.toBe(null);
    expect(s!).toContain("[node_0000_canon :: canon]");
    expect(s!).toContain("Axioms here.");
    expect(s!).toContain("[node_0001 :: project]");
    expect(s!).toContain("A demo project.");
  });

  it("uses a bracketed id-only label when level is missing", () => {
    const items: UpstreamContextItem[] = [{ nodeId: "node_x", text: "body" }];
    const s = buildUpstreamSystemPrompt(items);
    expect(s!).toContain("[node_x]");
    expect(s!).not.toContain("::");
  });

  it("preserves item order", () => {
    const a: UpstreamContextItem = { nodeId: "node_a", text: "A" };
    const b: UpstreamContextItem = { nodeId: "node_b", text: "B" };
    const ab = buildUpstreamSystemPrompt([a, b])!;
    const ba = buildUpstreamSystemPrompt([b, a])!;
    expect(ab.indexOf("[node_a]")).toBeLessThan(ab.indexOf("[node_b]"));
    expect(ba.indexOf("[node_b]")).toBeLessThan(ba.indexOf("[node_a]"));
  });
});

describe("hashUpstreamContext", () => {
  it("returns null for an empty list (matches PersistedRunInput.contextHash default)", () => {
    expect(hashUpstreamContext([])).toBe(null);
  });

  it("returns a ctx:hash:<sha256> string for any non-empty input", () => {
    const h = hashUpstreamContext([{ nodeId: "x", text: "y" }]);
    expect(h).toMatch(/^ctx:hash:[0-9a-f]{64}$/);
  });

  it("identical contents in identical order produce identical hashes", () => {
    const items: UpstreamContextItem[] = [
      { nodeId: "a", text: "alpha" },
      { nodeId: "b", text: "beta" },
    ];
    expect(hashUpstreamContext(items)).toBe(hashUpstreamContext([...items]));
  });

  it("reordering the upstreams changes the hash (order is semantic)", () => {
    const a: UpstreamContextItem = { nodeId: "a", text: "alpha" };
    const b: UpstreamContextItem = { nodeId: "b", text: "beta" };
    expect(hashUpstreamContext([a, b])).not.toBe(hashUpstreamContext([b, a]));
  });

  it("changing any text body changes the hash", () => {
    const before = hashUpstreamContext([{ nodeId: "a", text: "alpha" }]);
    const after = hashUpstreamContext([{ nodeId: "a", text: "alpha2" }]);
    expect(before).not.toBe(after);
  });

  it("the level label is NOT part of the hash (only nodeId+text are load-bearing)", () => {
    const withLevel = hashUpstreamContext([{ nodeId: "a", level: "canon", text: "x" }]);
    const withoutLevel = hashUpstreamContext([{ nodeId: "a", text: "x" }]);
    expect(withLevel).toBe(withoutLevel);
  });
});
