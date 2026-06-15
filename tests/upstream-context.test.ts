import { describe, it, expect } from "vitest";
import {
  buildUpstreamSystemPrompt,
  hashUpstreamContext,
  type UpstreamContextItem,
} from "../src/forward/compile/upstream-context.js";

describe("buildUpstreamSystemPrompt", () => {
  it("returns null when there are no upstreams (so callers omit `system`)", () => {
    expect(buildUpstreamSystemPrompt([])).toBe(null);
  });

  it("wraps each upstream in a <context> tag with source and level attributes", () => {
    const items: UpstreamContextItem[] = [
      { nodeId: "node_0000_canon", level: "canon", text: "Axioms here." },
      { nodeId: "node_0001", level: "project", text: "A demo project." },
    ];
    const s = buildUpstreamSystemPrompt(items);
    expect(s).not.toBe(null);
    expect(s!).toContain('<context source="node_0000_canon" level="canon">');
    expect(s!).toContain("Axioms here.");
    expect(s!).toContain("</context>");
    expect(s!).toContain('<context source="node_0001" level="project">');
    expect(s!).toContain("A demo project.");
  });

  it("omits the level attribute when level is missing", () => {
    const items: UpstreamContextItem[] = [{ nodeId: "node_x", text: "body" }];
    const s = buildUpstreamSystemPrompt(items);
    expect(s!).toContain('<context source="node_x">');
    expect(s!).not.toContain("level=");
  });

  it("does NOT emit the legacy [id :: level] bracket format (mimicry vector closed)", () => {
    // Regression guard: the old format was `[<id> :: <level>]`. Small
    // chat-tuned models pattern-matched those brackets into their output.
    // The new format uses XML angle brackets, which models do not emit
    // when generating code under normal circumstances.
    const items: UpstreamContextItem[] = [
      { nodeId: "node_x", level: "canon", text: "t" },
    ];
    const s = buildUpstreamSystemPrompt(items)!;
    expect(s).not.toMatch(/\[\s*node_/);
    expect(s).not.toContain(" :: ");
  });

  it("instructs the model not to echo the framing tags", () => {
    const s = buildUpstreamSystemPrompt([{ nodeId: "x", text: "y" }])!;
    expect(s).toMatch(/Do NOT echo the <context> tags/i);
  });

  it("preserves item order", () => {
    const a: UpstreamContextItem = { nodeId: "node_a", text: "A" };
    const b: UpstreamContextItem = { nodeId: "node_b", text: "B" };
    const ab = buildUpstreamSystemPrompt([a, b])!;
    const ba = buildUpstreamSystemPrompt([b, a])!;
    expect(ab.indexOf('source="node_a"')).toBeLessThan(ab.indexOf('source="node_b"'));
    expect(ba.indexOf('source="node_b"')).toBeLessThan(ba.indexOf('source="node_a"'));
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
