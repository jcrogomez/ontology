// Intent-narration builder — deterministic plumbing tests.
//
// The LLM that produces the narration is stochastic; these tests pin only the
// pure framing logic (the user turn the model receives). Single-file vs
// neighbourhood framing, path/language provenance, empty guard, determinism.

import { describe, it, expect } from "vitest";
import {
  buildIntentNeighborhoodPrompt,
  INTENT_NARRATION_PROMPT,
  type NeighborhoodFile,
} from "../src/inverse/intent-narration.js";

const file = (path: string, content = "x"): NeighborhoodFile => ({ path, content });

describe("intent-narration prompt builder", () => {
  it("single file: frames the file and asks for that file's intent", () => {
    const out = buildIntentNeighborhoodPrompt([file("src/core/fs/lock.ts", "export const x = 1;")]);
    expect(out).toContain("Narrate the intent of this file");
    expect(out).toContain("File: src/core/fs/lock.ts");
    expect(out).toContain("Language hint (from extension): typescript");
    expect(out).toContain("--- BEGIN FILE ---");
    expect(out).toContain("export const x = 1;");
    expect(out).toContain("--- END FILE ---");
    // It must NOT ask for the composed/neighbourhood intent.
    expect(out).not.toContain("COMPOSED intent");
  });

  it("multiple files: asks for the COMPOSED subsystem intent and frames every file", () => {
    const out = buildIntentNeighborhoodPrompt([
      file("src/core/fs/lock.ts"),
      file("src/core/fs/json.ts"),
    ]);
    expect(out).toContain("2 files form a related neighbourhood");
    expect(out).toContain("COMPOSED intent");
    expect(out).toContain("File: src/core/fs/lock.ts");
    expect(out).toContain("File: src/core/fs/json.ts");
    // Single IntentNarration for the subsystem, not one per file.
    expect(out).toContain("single IntentNarration JSON for the composed subsystem only");
  });

  it("detects language by extension", () => {
    expect(buildIntentNeighborhoodPrompt([file("a.py")])).toContain("Language hint (from extension): python");
    expect(buildIntentNeighborhoodPrompt([file("a.rs")])).toContain("Language hint (from extension): rust");
    expect(buildIntentNeighborhoodPrompt([file("a.unknownext")])).toContain("Language hint (from extension): unknown");
  });

  it("throws on empty input — no intent to narrate for zero files", () => {
    expect(() => buildIntentNeighborhoodPrompt([])).toThrow(/at least one file/);
  });

  it("is deterministic (same input → same prompt)", () => {
    const files = [file("a.ts", "A"), file("b.ts", "B")];
    expect(buildIntentNeighborhoodPrompt(files)).toBe(buildIntentNeighborhoodPrompt(files));
  });

  it("the system prompt forbids contract-extractor output and demands a behaviour oracle", () => {
    // Guard the load-bearing instructions so a future edit can't silently turn
    // this back into a contract extractor.
    expect(INTENT_NARRATION_PROMPT).toContain("acceptanceCriteria");
    expect(INTENT_NARRATION_PROMPT).toContain("BEHAVIOUR, NOT SYMBOLS");
    expect(INTENT_NARRATION_PROMPT).toContain("COMPRESS");
    expect(INTENT_NARRATION_PROMPT).toMatch(/FORBIDDEN[\s\S]*MUST export/);
  });
});
