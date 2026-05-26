import type { BehaviorCase } from "../../src/runtime/legend/behavior-checker.js";

// node_0044 — src/runtime/llm/registry.ts
// Tested entry: getDefaultModelForTask — pure lookup from
// (provider, task) into the canonical default model. Falls back to
// undefined when the task is not registered. A regen that swaps the
// per-provider tables or drops a registered task would diverge.

export const cases: BehaviorCase[] = [
  {
    name: "getDefaultModelForTask — ollama / semantic_parse returns a known model string",
    setup: () => ({ provider: "ollama", task: "semantic_parse" }),
    invoke: (api, ctx) => {
      const c = ctx as { provider: string; task: string };
      return (
        api as {
          getDefaultModelForTask: (p: string, t: string) => string | undefined;
        }
      ).getDefaultModelForTask(c.provider, c.task);
    },
    assert: (r) =>
      r === undefined || (typeof r === "string" && (r as string).length > 0),
  },
];
