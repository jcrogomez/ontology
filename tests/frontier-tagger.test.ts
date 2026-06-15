import { describe, it, expect } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs";
import {
  frontierTagsForFile,
  tagFile,
  tagFileFromDisk,
  type TaggerAttribute,
} from "../src/inverse/frontier-tagger.js";
import { collectSourceFiles } from "../src/inverse/static/typescript.js";

const REPO_ROOT = path.resolve(__dirname, "..");

// ── Path rules ──────────────────────────────────────────────────────────────

describe("frontier-tagger — path rules (faithful predictions)", () => {
  it("tags src/schemas/* as schema-driven", () => {
    expect(frontierTagsForFile("/repo/src/schemas/ontology.ts")).toContain(
      "schema-driven",
    );
  });

  it("tags src/runtime/effects/* as algebraic-lawful + pure-transform", () => {
    const tags = frontierTagsForFile("/repo/src/runtime/effects/result.ts");
    expect(tags).toContain("algebraic-lawful");
    expect(tags).toContain("pure-transform");
  });

  it("tags src/runtime/topos/* as algebraic-lawful + pure-transform", () => {
    const tags = frontierTagsForFile("/repo/src/runtime/topos/omega.ts");
    expect(tags).toContain("algebraic-lawful");
    expect(tags).toContain("pure-transform");
  });

  it("tags src/runtime/topos/rule-compiler.ts with the region AND the declarative-validator specific tags (multi-label intent)", () => {
    const tags = frontierTagsForFile(
      "/repo/src/runtime/topos/rule-compiler.ts",
    );
    expect(tags).toContain("algebraic-lawful");
    expect(tags).toContain("pure-transform");
    expect(tags).toContain("declarative-validator");
    expect(tags).toContain("schema-driven");
  });

  it("tags src/runtime/context/intent-validator.ts as declarative-validator + schema-driven", () => {
    const tags = frontierTagsForFile(
      "/repo/src/runtime/context/intent-validator.ts",
    );
    expect(tags).toContain("declarative-validator");
    expect(tags).toContain("schema-driven");
    // Region rule (src/runtime/context/) also applies → operational-glue.
    // That overlap is by design: intent-validator IS declarative AND
    // lives inside the broader context orchestration region.
    expect(tags).toContain("operational-glue");
  });

  it("tags src/core/integrity/* as pure-transform", () => {
    const tags = frontierTagsForFile("/repo/src/core/integrity/hash.ts");
    expect(tags).toContain("pure-transform");
  });

  it("tags src/runtime/static/* as pure-transform", () => {
    const tags = frontierTagsForFile("/repo/src/runtime/static/typescript.ts");
    expect(tags).toContain("pure-transform");
  });

  it("tags src/runtime/graph/* as pure-transform", () => {
    expect(frontierTagsForFile("/repo/src/runtime/graph/poset.ts")).toContain(
      "pure-transform",
    );
  });
});

describe("frontier-tagger — path rules (resistant predictions)", () => {
  it("tags src/runtime/llm/<provider>/adapter.ts as adapter-boundary + io-bound + operational-glue", () => {
    const tags = frontierTagsForFile(
      "/repo/src/runtime/llm/anthropic/adapter.ts",
    );
    expect(tags).toContain("adapter-boundary");
    expect(tags).toContain("io-bound");
    expect(tags).toContain("operational-glue");
  });

  it("tags src/runtime/compile/artifact-writer.ts as io-bound + operational-glue", () => {
    const tags = frontierTagsForFile(
      "/repo/src/runtime/compile/artifact-writer.ts",
    );
    expect(tags).toContain("io-bound");
    expect(tags).toContain("operational-glue");
  });

  it("tags src/core/fs/* as io-bound + operational-glue", () => {
    const tags = frontierTagsForFile("/repo/src/core/fs/lock.ts");
    expect(tags).toContain("io-bound");
    expect(tags).toContain("operational-glue");
  });

  it("tags src/core/state/* as io-bound + operational-glue", () => {
    const tags = frontierTagsForFile("/repo/src/core/state/state-store.ts");
    expect(tags).toContain("io-bound");
    expect(tags).toContain("operational-glue");
  });

  it("tags src/commands/<cmd>/index.ts as cli-parsing + operational-glue", () => {
    const tags = frontierTagsForFile(
      "/repo/src/commands/ingest/index.ts",
    );
    expect(tags).toContain("cli-parsing");
    expect(tags).toContain("operational-glue");
  });

  it("tags non-index files in src/commands/ as operational-glue (without cli-parsing)", () => {
    const tags = frontierTagsForFile(
      "/repo/src/commands/ingest/cost-estimate.ts",
    );
    expect(tags).toContain("operational-glue");
    expect(tags).not.toContain("cli-parsing");
  });

  it("tags src/walker/* as tui-rendering + operational-glue (out of 2026-05-13 perimeter, kept for later sweeps)", () => {
    const tags = frontierTagsForFile("/repo/src/walker/render.ts");
    expect(tags).toContain("tui-rendering");
    expect(tags).toContain("operational-glue");
  });
});

// ── Content rules ───────────────────────────────────────────────────────────

describe("frontier-tagger — content rules", () => {
  it("detects the @human-authored marker", () => {
    const tags = frontierTagsForFile(
      "/repo/src/runtime/foo.ts",
      `// @human-authored\nexport const x = 1;`,
    );
    expect(tags).toContain("human-authored");
  });

  it("detects literal: true near node metadata", () => {
    const tags = frontierTagsForFile(
      "/repo/src/runtime/bar.ts",
      `const node = { id: "n", literal: true };`,
    );
    expect(tags).toContain("literal-required");
  });

  it("detects a 256+ char prompt-template literal", () => {
    const longPrompt = "Long system prompt instructions ".repeat(20); // > 256 chars
    const tags = frontierTagsForFile(
      "/repo/src/runtime/qux.ts",
      `const SYSTEM_PROMPT = \`${longPrompt}\`;\nexport default SYSTEM_PROMPT;`,
    );
    expect(tags).toContain("prompt-sensitive");
  });

  it("does NOT flag a short prompt literal (under 256 chars) as prompt-sensitive", () => {
    const shortPrompt = "Short."; // way under 256
    const tags = frontierTagsForFile(
      "/repo/src/runtime/qux2.ts",
      `const prompt = "${shortPrompt}";`,
    );
    expect(tags).not.toContain("prompt-sensitive");
  });

  it("ignores content rules when contents is omitted", () => {
    const tags = frontierTagsForFile("/repo/src/runtime/foo.ts");
    expect(tags).not.toContain("human-authored");
    expect(tags).not.toContain("literal-required");
    expect(tags).not.toContain("prompt-sensitive");
  });
});

// ── Fallback ────────────────────────────────────────────────────────────────

describe("frontier-tagger — fallback", () => {
  it("returns operational-glue when no rule fires", () => {
    const tags = frontierTagsForFile("/repo/some/unmatched/path/file.ts");
    expect(tags).toEqual(["operational-glue"]);
  });

  it("never returns an empty set", () => {
    const tags = frontierTagsForFile("/totally/foreign/path.ts");
    expect(tags.length).toBeGreaterThan(0);
  });
});

// ── Tag result + reasons ────────────────────────────────────────────────────

describe("frontier-tagger — tagFile returns reasons", () => {
  it("emits one reason per rule that fired", () => {
    const result = tagFile("/repo/src/runtime/topos/rule-compiler.ts");
    // Three path rules fire: rule-compiler-specific, topos region,
    // and no content rules. All three appear in reasons.
    expect(result.reasons.length).toBeGreaterThanOrEqual(2);
    expect(result.attrs).toContain("declarative-validator");
    expect(result.attrs).toContain("algebraic-lawful");
  });

  it("reports the fallback reason when nothing matches", () => {
    const result = tagFile("/random/path.ts");
    expect(result.reasons.some((r) => r.startsWith("fallback:"))).toBe(true);
  });
});

// ── Perimeter coverage (acceptance contract) ────────────────────────────────

describe("frontier-tagger — perimeter coverage (SELF_INGEST_HYPOTHESIS_2026-05-13 §6)", () => {
  it("every file in the canonical Phase ε perimeter has at least one attribute", () => {
    const perimeter = [
      path.join(REPO_ROOT, "src", "kernel"),
      path.join(REPO_ROOT, "src", "forward"),
      path.join(REPO_ROOT, "src", "inverse"),
      path.join(REPO_ROOT, "src", "laws"),
      path.join(REPO_ROOT, "src", "runtime"),
      path.join(REPO_ROOT, "src", "surfaces"),
    ];
    const files: string[] = [];
    for (const dir of perimeter) {
      if (!fs.existsSync(dir)) continue;
      files.push(...collectSourceFiles(dir, ["ts", "tsx"]));
    }
    expect(files.length).toBeGreaterThan(0);
    const zeroTagged: string[] = [];
    for (const f of files) {
      const tags = frontierTagsForFile(f);
      if (tags.length === 0) zeroTagged.push(f);
    }
    expect(zeroTagged).toEqual([]);
  });

  it("the canonical perimeter hits every faithful-prediction tag at least once", () => {
    const perimeter = [
      path.join(REPO_ROOT, "src", "kernel"),
      path.join(REPO_ROOT, "src", "forward"),
      path.join(REPO_ROOT, "src", "inverse"),
      path.join(REPO_ROOT, "src", "laws"),
      path.join(REPO_ROOT, "src", "runtime"),
      path.join(REPO_ROOT, "src", "surfaces"),
    ];
    const files: string[] = [];
    for (const dir of perimeter) {
      if (!fs.existsSync(dir)) continue;
      files.push(...collectSourceFiles(dir, ["ts", "tsx"]));
    }
    const seen = new Set<TaggerAttribute>();
    for (const f of files) {
      for (const a of frontierTagsForFile(f)) seen.add(a);
    }
    const expectedFaithfulTags: TaggerAttribute[] = [
      "pure-transform",
      "schema-driven",
      "algebraic-lawful",
      "declarative-validator",
    ];
    for (const tag of expectedFaithfulTags) {
      expect(seen.has(tag), `expected to see ${tag} somewhere in perimeter`).toBe(true);
    }
  });

  it("the canonical perimeter hits every resistant-prediction tag at least once", () => {
    const perimeter = [
      path.join(REPO_ROOT, "src", "kernel"),
      path.join(REPO_ROOT, "src", "forward"),
      path.join(REPO_ROOT, "src", "inverse"),
      path.join(REPO_ROOT, "src", "laws"),
      path.join(REPO_ROOT, "src", "runtime"),
      path.join(REPO_ROOT, "src", "surfaces"),
    ];
    const files: string[] = [];
    for (const dir of perimeter) {
      if (!fs.existsSync(dir)) continue;
      files.push(...collectSourceFiles(dir, ["ts", "tsx"]));
    }
    const seen = new Set<TaggerAttribute>();
    for (const f of files) {
      for (const a of frontierTagsForFile(f)) seen.add(a);
    }
    const expectedResistantTags: TaggerAttribute[] = [
      "cli-parsing",
      "io-bound",
      "adapter-boundary",
      "operational-glue",
    ];
    for (const tag of expectedResistantTags) {
      expect(seen.has(tag), `expected to see ${tag} somewhere in perimeter`).toBe(true);
    }
  });
});

// ── tagFileFromDisk integration ─────────────────────────────────────────────

describe("frontier-tagger — tagFileFromDisk", () => {
  it("reads a real file and runs both path and content rules", () => {
    const target = path.join(REPO_ROOT, "src", "kernel", "core", "integrity", "hash.ts");
    const result = tagFileFromDisk(target);
    expect(result.attrs).toContain("pure-transform");
  });

  it("gracefully degrades when the file cannot be read", () => {
    const result = tagFileFromDisk("/does/not/exist/anywhere.ts");
    // Path is foreign → fallback applies. No content rules fire (read failed).
    expect(result.attrs).toEqual(["operational-glue"]);
  });
});
