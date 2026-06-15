import type { BehaviorCase } from "../../src/laws/behavior-checker.js";

// node_0095 — src/commands/ingest/static-classifier-policy.ts
// Tested entry: decideStaticClassifierIngestAction(classification,
// mode) — the pure mode×shape decision table. A regen that lets
// report-only intervene, deflects schema_module/mixed_module to the
// static summary, or mishandles a missing classification would
// diverge here.

type Classification = { structuralShape: string };
type Api = {
  decideStaticClassifierIngestAction: (
    classification: Classification | undefined,
    mode: "off" | "report-only" | "enabled",
  ) => "semantic_parse" | "static_summary";
};

export const cases: BehaviorCase[] = [
  {
    name: "decideStaticClassifierIngestAction — report-only observes, never deflects",
    setup: () => ({
      shape: { structuralShape: "barrel" } as Classification,
      modes: ["off", "report-only"] as Array<"off" | "report-only">,
    }),
    invoke: (api, ctx) => {
      const c = ctx as { shape: Classification; modes: Array<"off" | "report-only"> };
      return c.modes.map((m) =>
        (api as Api).decideStaticClassifierIngestAction(c.shape, m),
      );
    },
    assert: (r) =>
      Array.isArray(r) && r.every((a) => a === "semantic_parse"),
  },
  {
    name: "decideStaticClassifierIngestAction — enabled deflects only barrel and declaration_only",
    setup: () => ({
      shapes: ["barrel", "declaration_only"],
    }),
    invoke: (api, ctx) =>
      (ctx as { shapes: string[] }).shapes.map((s) =>
        (api as Api).decideStaticClassifierIngestAction(
          { structuralShape: s },
          "enabled",
        ),
      ),
    assert: (r) =>
      Array.isArray(r) && r.every((a) => a === "static_summary"),
  },
  {
    name: "decideStaticClassifierIngestAction — enabled keeps risky shapes on the LLM path",
    setup: () => ({
      shapes: ["schema_module", "test_module", "mixed_module", "unknown"],
    }),
    invoke: (api, ctx) =>
      (ctx as { shapes: string[] }).shapes.map((s) =>
        (api as Api).decideStaticClassifierIngestAction(
          { structuralShape: s },
          "enabled",
        ),
      ),
    assert: (r) =>
      Array.isArray(r) && r.every((a) => a === "semantic_parse"),
  },
  {
    name: "decideStaticClassifierIngestAction — missing classification falls back to semantic_parse",
    setup: () => ({ mode: "enabled" as const }),
    invoke: (api, ctx) =>
      (api as Api).decideStaticClassifierIngestAction(
        undefined,
        (ctx as { mode: "enabled" }).mode,
      ),
    assert: (r) => r === "semantic_parse",
  },
];
