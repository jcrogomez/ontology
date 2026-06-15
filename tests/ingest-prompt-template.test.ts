import { describe, it, expect } from "vitest";
import { EXTRACTION_SYSTEM_PROMPT } from "../src/surfaces/commands/ingest/index.js";

// Smoke fixture for the δ' EXTRACTION_SYSTEM_PROMPT — design item §4.3.
//
// The δ' calibration (2026-05-18) found that turning the extraction
// prompt from descriptive to prescriptive ("MUST" verbs, every
// `provides` name appearing inside `prompt`) moved mean Jaccard 7×
// off the γ floor. The Move 3α hypothesis treats those prescriptive
// MUSTs as load-bearing — every downstream verdict assumes the
// extractor was asked the prescriptive question.
//
// Without this fixture, a future "tidy the prompt" edit can silently
// soften the MUST verbs (e.g. replace "MUST recreate" with "should
// recreate") or drop the FORBIDDEN descriptive-phrases block, and
// nothing fails — until the next ε calibration regresses the
// Jaccard floor and the team has to bisect why. This test pins the
// load-bearing assertions so any softening edit shows up in CI as a
// red diff, and any deliberate change has to update the fixture
// alongside the prompt.
//
// Pure — reads the exported string constant, no LLM dispatch, runs
// in <1 ms.

describe("EXTRACTION_SYSTEM_PROMPT — δ' prescriptive invariants", () => {
  it("declares the constructive-not-descriptive directive", () => {
    expect(EXTRACTION_SYSTEM_PROMPT).toContain("Your job is NOT to summarize the file");
    expect(EXTRACTION_SYSTEM_PROMPT).toContain(
      "Your job is to specify what a future implementation MUST recreate",
    );
  });

  it("pins the core extraction rule (constructive, not descriptive)", () => {
    expect(EXTRACTION_SYSTEM_PROMPT).toContain("It must be constructive, not descriptive");
    expect(EXTRACTION_SYSTEM_PROMPT).toContain(
      'Every public/exported symbol listed in "provides" MUST appear inside "prompt" by its exact identifier',
    );
  });

  it("pins the per-symbol specification mandate", () => {
    expect(EXTRACTION_SYSTEM_PROMPT).toContain(
      'The "prompt" field MUST be written as a per-symbol specification',
    );
  });

  it("carries the prescriptive MUST-verb whitelist (Move 3α load-bearing)", () => {
    // These ten verbs were the δ' template's prescriptive vocabulary.
    // The 3α candado #2 (export recovery measured on the regenerated
    // OUTPUT) only holds when the extractor consistently surfaces
    // contracts in these terms — softening any of them risks
    // re-introducing the descriptive-narrative failure mode.
    const requiredVerbs = [
      '"MUST export..."',
      '"MUST return..."',
      '"MUST validate..."',
      '"MUST preserve..."',
      '"MUST re-export..."',
      '"MUST reject..."',
      '"MUST map..."',
      '"MUST construct..."',
      '"MUST parse..."',
      '"MUST normalize..."',
    ];
    for (const v of requiredVerbs) {
      expect(EXTRACTION_SYSTEM_PROMPT, `missing MUST verb: ${v}`).toContain(v);
    }
  });

  it("carries the FORBIDDEN descriptive-phrases block (the failure-mode list δ' surfaced)", () => {
    // The δ extraction failure mode was the model emitting
    // valid-looking generic summaries ("this file provides utilities
    // for X"). The FORBIDDEN list names the exact phrases that
    // collapsed the contract. Dropping any of them re-opens the door.
    const forbidden = [
      '"this file provides"',
      '"provides utilities"',
      '"provides helpers"',
      '"handles"',
      '"manages"',
      '"contains helpers"',
      '"is responsible for"',
      '"used for working with"',
      '"convenience functions"',
      '"allows working with"',
      '"supports functionality for"',
    ];
    for (const phrase of forbidden) {
      expect(EXTRACTION_SYSTEM_PROMPT, `missing FORBIDDEN phrase: ${phrase}`).toContain(phrase);
    }
  });

  it("declares that generic summaries are extraction FAILURES (not soft warnings)", () => {
    expect(EXTRACTION_SYSTEM_PROMPT).toContain(
      "Generic summaries are extraction failures",
    );
  });

  it("pins the prompt-is-ONE-STRING shape fix (the γ→δ JSON-array regression)", () => {
    // The δ template fix (commit 661c540, "ingest: δ template — prompt
    // MUST be JSON string, not array") closed the failure where the
    // model interpreted bullet formatting as a JSON array, breaking
    // 47% of files at schema validation. Pin the directive so a future
    // re-flow of the prompt can't accidentally soften it.
    expect(EXTRACTION_SYSTEM_PROMPT).toContain(
      'The "prompt" field MUST be a single JSON STRING',
    );
    expect(EXTRACTION_SYSTEM_PROMPT).toContain('never emit "prompt" as a JSON array');
    // The template literal in the source has `\\n` (escaped backslash + n),
    // which at runtime is the 2-char sequence `\n` (backslash followed by
    // the letter n — *not* a newline). Match that exact runtime sequence.
    expect(EXTRACTION_SYSTEM_PROMPT).toContain("Use \\n separators inside one string");
  });

  it("requires schema-enum compliance (no invented values)", () => {
    expect(EXTRACTION_SYSTEM_PROMPT).toContain(
      "You MUST use only the enum values allowed by the schema",
    );
    expect(EXTRACTION_SYSTEM_PROMPT).toContain("Invented values will fail validation");
  });

  it("includes the good-vs-bad concrete example contrast (anchors the per-symbol shape)", () => {
    // The contrast pair is what teaches the model the shape, not the
    // abstract rule. Pin both sides so an edit can't drop one half.
    expect(EXTRACTION_SYSTEM_PROMPT).toContain("Good:");
    expect(EXTRACTION_SYSTEM_PROMPT).toContain("Bad:");
    expect(EXTRACTION_SYSTEM_PROMPT).toContain("Why bad:");
  });

  it("preserves the load-bearing MUST density (a soft rewrite would drop this floor)", () => {
    // The δ' lesson is that "MUST" verbs are the prescriptive signal.
    // A descriptive rewrite would naturally cut this count in half or
    // more. A floor of ≥ 20 occurrences keeps the prompt firmly on the
    // prescriptive side without locking in the exact phrasing.
    const mustCount = (EXTRACTION_SYSTEM_PROMPT.match(/MUST/g) ?? []).length;
    expect(mustCount).toBeGreaterThanOrEqual(20);
  });
});
