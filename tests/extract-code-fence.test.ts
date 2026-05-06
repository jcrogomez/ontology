import { describe, it, expect } from "vitest";
import { extractCodeFence } from "../src/runtime/compile/post/extract-code-fence.js";

describe("extractCodeFence", () => {
  it("returns the input unchanged when there is no fence (mock identity case)", () => {
    const r = extractCodeFence({ text: 'print("hello world")', language: "python" });
    expect(r.extracted).toBe(false);
    expect(r.content).toBe('print("hello world")');
  });

  it("extracts the body of a single fence regardless of info string", () => {
    const text = ["Here you go:", "```", 'print("hi")', "```"].join("\n");
    const r = extractCodeFence({ text });
    expect(r.extracted).toBe(true);
    expect(r.content).toBe('print("hi")');
  });

  it("prefers the fence whose info string matches the requested language", () => {
    const text = [
      "Some prose.",
      "```text",
      "not the chosen one",
      "```",
      "More prose.",
      "```python",
      'print("ok")',
      "```",
    ].join("\n");
    const r = extractCodeFence({ text, language: "python" });
    expect(r.extracted).toBe(true);
    expect(r.fenceInfo).toBe("python");
    expect(r.content).toBe('print("ok")');
  });

  it("falls back to the first fence when no info string matches the language", () => {
    const text = ["```", 'print("only fence")', "```"].join("\n");
    const r = extractCodeFence({ text, language: "python" });
    expect(r.extracted).toBe(true);
    expect(r.content).toBe('print("only fence")');
  });

  it("treats common aliases as matches (py, python3 → python)", () => {
    for (const info of ["py", "python3"]) {
      const text = ["```text", "skip", "```", `\`\`\`${info}`, "match", "```"].join("\n");
      const r = extractCodeFence({ text, language: "python" });
      expect(r.fenceInfo).toBe(info);
      expect(r.content).toBe("match");
    }
  });

  it("matches case-insensitively on the language tag", () => {
    const text = ["```Python", "case", "```"].join("\n");
    const r = extractCodeFence({ text, language: "PYTHON" });
    expect(r.content).toBe("case");
  });

  it("ignores trailing tokens in the fence info string (e.g. 'python title=foo.py')", () => {
    const text = ["```python title=foo.py", 'print("titled")', "```"].join("\n");
    const r = extractCodeFence({ text, language: "python" });
    expect(r.content).toBe('print("titled")');
  });

  it("handles tilde fences too", () => {
    const text = ["~~~python", "tilde", "~~~"].join("\n");
    const r = extractCodeFence({ text, language: "python" });
    expect(r.content).toBe("tilde");
  });

  it("preserves multi-line bodies verbatim (no leading/trailing trim of internal blank lines)", () => {
    const body = "def main():\n    print(\"hi\")\n\nif __name__ == '__main__':\n    main()";
    const text = "```python\n" + body + "\n```";
    const r = extractCodeFence({ text, language: "python" });
    expect(r.content).toBe(body);
  });

  it("is reentrant (no leaked regex state between calls)", () => {
    const a = extractCodeFence({ text: "```\nA\n```", language: "python" });
    const b = extractCodeFence({ text: "```\nB\n```", language: "python" });
    expect(a.content).toBe("A");
    expect(b.content).toBe("B");
  });
});
