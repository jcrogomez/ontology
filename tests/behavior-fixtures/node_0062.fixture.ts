import type { BehaviorCase } from "../../src/runtime/legend/behavior-checker.js";

// node_0062 — src/core/errors.ts
// Tested entry: errorMessage — pure unknown-to-string normaliser used
// across every catch site in the codebase. Error instances surface
// their `.message`; other shapes get coerced. A regen that swallows
// the message or returns a generic placeholder would diverge.

export const cases: BehaviorCase[] = [
  {
    name: "errorMessage — Error instance returns its message",
    setup: () => new Error("permission denied"),
    invoke: (api, ctx) =>
      (api as { errorMessage: (e: unknown) => string }).errorMessage(ctx),
    assert: (r) => r === "permission denied",
  },
  {
    name: "errorMessage — plain string is returned as-is",
    setup: () => "oops",
    invoke: (api, ctx) =>
      (api as { errorMessage: (e: unknown) => string }).errorMessage(ctx),
    assert: (r) => typeof r === "string" && (r as string).includes("oops"),
  },
];
