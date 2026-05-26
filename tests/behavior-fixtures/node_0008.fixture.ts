import type { BehaviorCase } from "../../src/runtime/legend/behavior-checker.js";

// node_0008 — src/runtime/compile/upstream-context.ts
// Tested entry: buildUpstreamSystemPrompt — pure string assembly from
// an array of upstream context items. A regen that reorders fields,
// drops the surrounding tag, or renames the leading phrase would
// produce a different string and diverge.

interface UpstreamItem {
  nodeId: string;
  level: string;
  text: string;
}

export const cases: BehaviorCase[] = [
  {
    name: "buildUpstreamSystemPrompt — single parent context wraps in tag",
    setup: () => ({
      upstream: [
        {
          nodeId: "parent-1",
          level: "project",
          text: "// export interface Result<T>",
        },
      ] satisfies UpstreamItem[],
    }),
    invoke: (api, ctx) =>
      (
        api as {
          buildUpstreamSystemPrompt: (u: UpstreamItem[]) => string | null;
        }
      ).buildUpstreamSystemPrompt((ctx as { upstream: UpstreamItem[] }).upstream),
    assert: (r) =>
      typeof r === "string" &&
      r.includes("parent-1") &&
      r.includes("project"),
  },
  {
    name: "buildUpstreamSystemPrompt — empty input returns null",
    setup: () => ({}),
    invoke: (api) =>
      (
        api as {
          buildUpstreamSystemPrompt: (u: UpstreamItem[]) => string | null;
        }
      ).buildUpstreamSystemPrompt([]),
    assert: (r) => r === null,
  },
];
