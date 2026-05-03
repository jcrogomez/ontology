import type { ContextAssemblyOutput } from "./types.js";
import type { GluingResult } from "./gluing.js";
import type { LlmProvider } from "../llm/types.js";

export interface IntentValidationInput {
  assembled: ContextAssemblyOutput;
  glued: GluingResult;
  candidate: {
    text: string;
    provider: LlmProvider;
    model: string;
  };
}

export interface IntentValidationResult {
  ok: boolean;
  score: number;
  violations: string[];
  warnings: string[];
}

export function validateIntent(input: IntentValidationInput): IntentValidationResult {
  const { assembled, glued, candidate } = input;
  const warnings = [...glued.warnings];
  const violations: string[] = [];

  let ok = true;
  let score = 1.0;

  // 1. Si glued.ok === false, la validación falla. (Score 0.0)
  if (!glued.ok) {
    ok = false;
    score = Math.min(score, 0.0);
    for (const conflict of glued.conflicts) {
      violations.push(`Gluing conflict: ${conflict.type} - ${conflict.message}`);
    }
  }

  // 2. Si candidate.text está vacío o sólo whitespace, falla. (Score 0.25)
  if (!candidate.text || candidate.text.trim().length === 0) {
    ok = false;
    score = Math.min(score, 0.25);
    violations.push("empty_candidate");
  }

  // 3. Si el texto contiene una frase explícitamente prohibida por una constraint simple, falla. (Score 0.5)
  for (const constraint of assembled.constraints) {
    if (constraint.startsWith("FORBID: ")) {
      const forbiddenPhrase = constraint.substring(8).trim();
      if (candidate.text.includes(forbiddenPhrase)) {
        ok = false;
        score = Math.min(score, 0.5);
        violations.push(`Forbidden phrase found: ${forbiddenPhrase}`);
      }
    }
  }

  return {
    ok,
    score,
    violations,
    warnings,
  };
}
