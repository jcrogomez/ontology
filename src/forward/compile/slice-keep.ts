import ts from "typescript";
import { scanTopLevelDecls, type DecompositionSlice, type AssemblyPart } from "./decompose-plan.js";

// Monotone decompose — the "keep what passes" half of the verify-refine loop
// (--keep-slices). Inspired by the TestSprite CLI's verification model
// (open-sourced 2026-06-11): a verifier that returns per-failure reports is
// only half the loop; the other half is that PASSING work is KEPT, so
// coverage grows monotonically instead of every round re-rolling the dice on
// the whole module. Ontology's refine loop already has the first half
// (refine-feedback.ts feeds per-criterion diagnostics back); this module adds
// the second: between refine rounds of a decomposed regeneration, slices that
// no failure implicates are FROZEN (reused verbatim, no dispatch) and only
// the implicated slices are re-generated.
//
// Everything here is pure and deterministic (text + plan in, keep-set out):
// no LLM, no IO. Attribution is conservative by construction — the dangerous
// direction is freezing a slice that is actually broken, so ANY failure that
// cannot be attributed to a specific slice unfreezes EVERYTHING (falls back
// to the pre-keep-slices behaviour of regenerating all slices).

/**
 * Per-case referenced identifiers, extracted from the behaviour fixture's
 * SOURCE TEXT. A fixture is trusted test infrastructure (authored /
 * self-validated via `onto probe`), not the shadow source — reading it leaks
 * nothing the oracle section doesn't already carry.
 *
 * Recognition: any object literal in the fixture with a `name` property whose
 * initializer is a string literal is a case; the case's referenced names are
 * every identifier appearing anywhere inside that object literal (invoke,
 * assert, setup — including property accesses like `r.statePath`).
 */
export function scanFixtureCaseReferences(fixtureText: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  let sf: ts.SourceFile;
  try {
    sf = ts.createSourceFile("fixture.ts", fixtureText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  } catch {
    return out;
  }
  const caseName = (obj: ts.ObjectLiteralExpression): string | null => {
    for (const p of obj.properties) {
      if (
        ts.isPropertyAssignment(p) &&
        ts.isIdentifier(p.name) &&
        p.name.text === "name" &&
        ts.isStringLiteral(p.initializer)
      ) {
        return p.initializer.text;
      }
    }
    return null;
  };
  const collectIdentifiers = (node: ts.Node, into: Set<string>): void => {
    if (ts.isIdentifier(node)) into.add(node.text);
    ts.forEachChild(node, (c) => collectIdentifiers(c, into));
  };
  const visit = (node: ts.Node): void => {
    if (ts.isObjectLiteralExpression(node)) {
      const name = caseName(node);
      if (name !== null) {
        const refs = new Set<string>();
        collectIdentifiers(node, refs);
        // First case wins on duplicate names (mirrors normaliseCriteria).
        if (!out.has(name)) out.set(name, refs);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

export interface KeepSetInput {
  /** The decomposition plan (slice s owns slices[s].targets). */
  slices: readonly DecompositionSlice[];
  /** The prior round's per-slice outputs (parallel to `slices`). */
  parts: readonly AssemblyPart[];
  /** Behaviour-case names the prior ASSEMBLED draft failed (outcome !== "match"). */
  failingCaseNames: readonly string[];
  /** The behaviour fixture's source text (for case → slice attribution). */
  fixtureText: string;
  /** Required exports the prior draft dropped (contract − draft). */
  missingExports: readonly string[];
  /** Identifiers the prior draft exported beyond the contract. */
  extraExports: readonly string[];
  /** Symbols named by static-lint findings on the prior draft ("" = unknown). */
  lintSymbols: readonly string[];
}

/**
 * Compute the KEEP set: indices of slices no failure implicates. An empty set
 * means "regenerate everything" — the safe fallback. Implication rules:
 *   - a failing case implicates every slice owning a name the case references;
 *     a failing case referencing NO slice-owned name unfreezes everything;
 *   - a missing export implicates its owning slice (plan lookup); a missing
 *     export owned by no slice unfreezes everything;
 *   - an extra export implicates every slice whose EMITTED CODE declares it
 *     (the assembly's export surface union means the emitter is the culprit);
 *     an extra export no slice declares unfreezes everything;
 *   - a lint symbol implicates its owning slice; an empty/unowned symbol
 *     unfreezes everything.
 */
export function computeKeepSet(input: KeepSetInput): Set<number> {
  const { slices, parts } = input;
  const all = (): Set<number> => new Set<number>(); // empty = keep nothing

  if (slices.length !== parts.length || slices.length === 0) return all();

  const ownerOf = new Map<string, number>();
  slices.forEach((s, i) => {
    for (const t of s.targets) if (!ownerOf.has(t.name)) ownerOf.set(t.name, i);
  });
  // Names each slice's emitted code actually declares (for extra-export
  // attribution — extras are by definition owned by no plan slice).
  const declaredBy: Set<string>[] = parts.map((p) => {
    try {
      return new Set(scanTopLevelDecls(p.code).map((d) => d.name));
    } catch {
      return new Set<string>();
    }
  });

  const implicated = new Set<number>();

  const caseRefs = scanFixtureCaseReferences(input.fixtureText);
  for (const name of input.failingCaseNames) {
    const refs = caseRefs.get(name);
    if (!refs) return all(); // case not found in fixture text → cannot attribute
    let hit = false;
    for (const r of refs) {
      const owner = ownerOf.get(r);
      if (owner !== undefined) {
        implicated.add(owner);
        hit = true;
      }
    }
    if (!hit) return all(); // failing case touches no owned name → unfreeze all
  }

  for (const m of input.missingExports) {
    const owner = ownerOf.get(m);
    if (owner === undefined) return all();
    implicated.add(owner);
  }

  for (const x of input.extraExports) {
    let hit = false;
    declaredBy.forEach((names, i) => {
      if (names.has(x)) {
        implicated.add(i);
        hit = true;
      }
    });
    if (!hit) return all();
  }

  for (const sym of input.lintSymbols) {
    const s = (sym ?? "").trim();
    if (s.length === 0) return all();
    const owner = ownerOf.get(s);
    if (owner === undefined) return all();
    implicated.add(owner);
  }

  const keep = new Set<number>();
  for (let i = 0; i < slices.length; i++) if (!implicated.has(i)) keep.add(i);
  return keep;
}
