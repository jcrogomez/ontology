import type { BehaviorCase } from "../../src/runtime/legend/behavior-checker.js";

// node_0007 — src/runtime/compile/post/validate-language.ts
// Tested entry: validateLanguage({absolutePath, language}) — only its pure
// early-return paths (no language / unregistered language), which never reach
// spawnSync. A regen that drops the trim/lowercase normalisation or rewords
// the skip reasons (part of the audit-trail contract) would diverge here.

type ValidateApi = {
  validateLanguage: (options: { absolutePath: string; language?: string }) => {
    status: string;
    reason?: string;
  };
};

export const cases: BehaviorCase[] = [
  {
    name: "validateLanguage — undefined language skips with explicit reason",
    setup: () => ({ absolutePath: "/tmp/never-touched.py" }),
    invoke: (api, ctx) =>
      (api as ValidateApi).validateLanguage(ctx as { absolutePath: string }),
    assert: (r) => {
      const v = r as { status: string; reason?: string };
      return v.status === "skipped" && v.reason === "no language declared";
    },
  },
  {
    name: "validateLanguage — whitespace-only language trims to empty and skips",
    setup: () => ({ absolutePath: "/tmp/never-touched.py", language: "   " }),
    invoke: (api, ctx) =>
      (api as ValidateApi).validateLanguage(
        ctx as { absolutePath: string; language?: string },
      ),
    assert: (r) => {
      const v = r as { status: string; reason?: string };
      return v.status === "skipped" && v.reason === "no language declared";
    },
  },
  {
    name: "validateLanguage — unregistered language lowercased in skip reason",
    setup: () => ({ absolutePath: "/tmp/never-touched.ts", language: "TypeScript" }),
    invoke: (api, ctx) =>
      (api as ValidateApi).validateLanguage(
        ctx as { absolutePath: string; language?: string },
      ),
    assert: (r) => {
      const v = r as { status: string; reason?: string };
      return (
        v.status === "skipped" &&
        v.reason === "no validator registered for language=typescript"
      );
    },
  },
];
