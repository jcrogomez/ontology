import { describe, it, expect } from "vitest";
import { resolveContract } from "../src/surfaces/commands/workflow/run.js";
import type { WorkflowProvision } from "../src/kernel/schemas/workflow.js";

// O4 — the round-trip F∘G ≈ id on a single workflow output. `resolveContract`
// takes the DECLARED contract (intent) and, when the artefact is code,
// MEASURES the produced contract (G = static extraction) and reports
// declared≠produced as defects. For non-code artefacts the declaration stands
// alone (honest degradation: intent without measurement).

const decl = (key: string, signature?: string): WorkflowProvision =>
  signature ? { key, signature } : { key };

describe("resolveContract — non-code artefact (declaration stands alone)", () => {
  it("passes the declared contract through, measured=false, no mismatches", () => {
    const c = resolveContract(
      [decl("episode_brief", "string"), decl("script")],
      undefined, // no artefactLanguage
      "a freeform prose artefact that is not code",
    );
    expect(c.measured).toBe(false);
    expect(c.provides).toEqual(["episode_brief", "script"]);
    expect(c.provideSignatures).toEqual({ episode_brief: "string" });
    expect(c.mismatches).toEqual([]);
  });
});

describe("resolveContract — code artefact (the round-trip has teeth)", () => {
  const ARTEFACT = `
    export function add(a: number, b: number): number { return a + b; }
    export interface Box { x: number }
  `;

  it("MEASURES the produced contract and verifies a matching declaration", () => {
    const c = resolveContract(
      [decl("add", "(a: number, b: number): number"), decl("Box")],
      "typescript",
      ARTEFACT,
    );
    expect(c.measured).toBe(true);
    expect(c.provides.sort()).toEqual(["Box", "add"]);
    // signature is the MEASURED one (grounded), available for O2 gluing.
    expect(c.provideSignatures.add).toBe("(a: number, b: number): number");
    expect(c.mismatches).toEqual([]);
  });

  it("strips markdown fences before measuring (compiler parity — found by the first live ζ run, 2026-06-09)", () => {
    // qwen2.5-coder:7b wrapped a CORRECT artefact in ```typescript fences;
    // pre-fix the measurement parsed the fenced text, found zero exports,
    // and reported a false "declared but not provided" mismatch.
    const fenced = "```typescript\nexport function slugify(title: string): string { return title; }\n```";
    const c = resolveContract(
      [decl("slugify", "(title: string): string")],
      "typescript",
      fenced,
    );
    expect(c.measured).toBe(true);
    expect(c.provides).toEqual(["slugify"]);
    expect(c.provideSignatures.slugify).toBe("(title: string): string");
    expect(c.mismatches).toEqual([]);
  });

  it("flags a declared capability the artefact does not produce", () => {
    const c = resolveContract(
      [decl("add"), decl("subtract")], // subtract is never produced
      "typescript",
      ARTEFACT,
    );
    expect(c.mismatches).toContainEqual(
      expect.stringContaining('declared "subtract" but the artefact does not provide it'),
    );
  });

  it("flags signature drift (declared ≠ produced)", () => {
    const c = resolveContract(
      [decl("add", "(a: string, b: string): string")], // wrong signature
      "typescript",
      ARTEFACT,
    );
    expect(c.mismatches.some((m) => m.includes("signature drift"))).toBe(true);
  });

  it("flags an undeclared capability the artefact over-delivers", () => {
    const c = resolveContract(
      [decl("add", "(a: number, b: number): number")], // Box not declared
      "typescript",
      ARTEFACT,
    );
    expect(c.mismatches).toContainEqual(
      expect.stringContaining('produced "Box" which the workflow did not declare'),
    );
  });

  it("the node carries the MEASURED contract even when nothing was declared", () => {
    const c = resolveContract([], "typescript", ARTEFACT);
    expect(c.measured).toBe(true);
    expect(c.provides.sort()).toEqual(["Box", "add"]);
    // produced-but-not-declared shows up as informational mismatches…
    expect(c.mismatches.length).toBe(2);
  });
});
