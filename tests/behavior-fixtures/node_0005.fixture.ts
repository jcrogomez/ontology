import type { BehaviorCase } from "../../src/runtime/legend/behavior-checker.js";

// node_0005 — src/runtime/compile/post/extract-code-fence.ts
// Tested entry: extractCodeFence({text, language}) — pure projection of the
// most relevant fenced block out of an LLM response. A regen that botches the
// fence regex, the language-preference rule, the alias table, or the
// trailing-newline trim (the bug family that recently slipped through) would
// diverge on these cases.

type ExtractApi = {
  extractCodeFence: (options: { text: string; language?: string }) => {
    content: string;
    extracted: boolean;
    fenceInfo?: string;
  };
};

export const cases: BehaviorCase[] = [
  {
    name: "extractCodeFence — language-tagged fence preferred over earlier non-matching fence",
    setup: () => ({
      text: 'Intro prose.\n```js\nconsole.log(1)\n```\nMore prose.\n```python\nprint(1)\n```\nOutro.',
      language: "Python",
    }),
    invoke: (api, ctx) =>
      (api as ExtractApi).extractCodeFence(
        ctx as { text: string; language?: string },
      ),
    assert: (r) => {
      const v = r as { content: string; extracted: boolean; fenceInfo?: string };
      return v.extracted && v.content === "print(1)" && v.fenceInfo === "python";
    },
  },
  {
    name: "extractCodeFence — fence without info string extracts body with trailing newline trimmed",
    setup: () => ({
      text: "```\nline one\nline two\n```",
    }),
    invoke: (api, ctx) =>
      (api as ExtractApi).extractCodeFence(ctx as { text: string }),
    assert: (r) => {
      const v = r as { content: string; extracted: boolean; fenceInfo?: string };
      return v.extracted && v.content === "line one\nline two" && v.fenceInfo === "";
    },
  },
  {
    name: "extractCodeFence — unfenced text passes through unchanged",
    setup: () => ({
      text: 'print("hello world")\n',
      language: "python",
    }),
    invoke: (api, ctx) =>
      (api as ExtractApi).extractCodeFence(
        ctx as { text: string; language?: string },
      ),
    assert: (r) => {
      const v = r as { content: string; extracted: boolean };
      return !v.extracted && v.content === 'print("hello world")\n';
    },
  },
  {
    name: "extractCodeFence — prose-surrounded fence with alias info string (py ≈ python)",
    setup: () => ({
      text: "Here's the code:\n```py\nx = 1\n```\nHope this helps!",
      language: "python",
    }),
    invoke: (api, ctx) =>
      (api as ExtractApi).extractCodeFence(
        ctx as { text: string; language?: string },
      ),
    assert: (r) => {
      const v = r as { content: string; extracted: boolean; fenceInfo?: string };
      return v.extracted && v.content === "x = 1" && v.fenceInfo === "py";
    },
  },
];
