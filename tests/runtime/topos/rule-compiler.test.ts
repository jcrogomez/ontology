// Parity decision (documented):
//
// We RE-IMPLEMENT the relevant subset of glueFragments inline (the
// `missing_requirement` and `forbidden_match` cases) rather than importing
// `validateIntent` or `glueFragments`. Reasons:
//
//   • `validateIntent` operates on candidate text + glued fragments, not on
//     a focal node's neighborhood. Its scope is broader than this PR's.
//   • `glueFragments` also reports `duplicate_provider` and `branch_mismatch`
//     which are not predicate-level concerns (they're about how multiple
//     fragments combine, not about whether a single node's rules pass). Our
//     `compileNodeRules` is intentionally a per-node check.
//   • Re-implementing inline makes the parity contract explicit in the test
//     itself: any reader can see precisely which decision is being mirrored.
//
// The contract: under a CLOSED-WORLD context (every token is either provided
// or denied — no "unknown"), `evaluatePredicate(compileNodeRules(node, ctx))`
// returns "true" iff the equivalent gluing decision would be "ok". We verify
// this on three hand-built scenarios and one randomised sweep.

import { describe, it, expect } from "vitest";
import {
  compileNodeRules,
  type CompilableNode,
} from "../../../src/laws/topos/rule-compiler.js";
import {
  evaluatePredicate,
  type EvaluationContext,
} from "../../../src/laws/topos/predicate.js";

/**
 * Re-implementation of the per-node subset of `glueFragments`. Returns true
 * iff every `requires` is provided in scope and no `forbids` is provided.
 * Equivalent (modulo cross-fragment effects) to: no `missing_requirement` and
 * no `forbidden_match` would be reported.
 */
function gluingDecision(
  node: CompilableNode,
  providedTokens: ReadonlySet<string>,
): boolean {
  for (const r of node.requires ?? []) {
    if (!providedTokens.has(r)) return false;
  }
  for (const f of node.forbids ?? []) {
    if (providedTokens.has(f)) return false;
  }
  return true;
}

function closedWorldContext(
  provided: ReadonlySet<string>,
  universe: ReadonlySet<string>,
): EvaluationContext {
  // Closed-world: any token in the universe but not provided is denied.
  const denied = new Set<string>();
  for (const t of universe) if (!provided.has(t)) denied.add(t);
  return { providedTokens: provided, deniedTokens: denied };
}

describe("compileNodeRules parity with gluing", () => {
  it("scenario 1: requires satisfied, no forbids → both pass", () => {
    const node: CompilableNode = { requires: ["alpha"], provides: ["beta"] };
    // Caller folds focal `provides` into providedTokens before compile/eval.
    const provided = new Set(["alpha", "beta"]);
    const universe = new Set(["alpha", "beta", "gamma"]);

    const predicate = compileNodeRules(node, { providedTokens: provided });
    const verdict = evaluatePredicate(predicate, closedWorldContext(provided, universe));

    expect(verdict).toBe("true");
    expect(gluingDecision(node, provided)).toBe(true);
  });

  it("scenario 2: missing requirement → both fail", () => {
    const node: CompilableNode = { requires: ["alpha", "missing"] };
    const provided = new Set(["alpha"]);
    const universe = new Set(["alpha", "missing"]);

    const predicate = compileNodeRules(node, { providedTokens: provided });
    const verdict = evaluatePredicate(predicate, closedWorldContext(provided, universe));

    expect(verdict).toBe("false");
    expect(gluingDecision(node, provided)).toBe(false);
  });

  it("scenario 3: forbidden token is provided → both fail", () => {
    const node: CompilableNode = { requires: [], forbids: ["taboo"] };
    const provided = new Set(["taboo"]);
    const universe = new Set(["taboo"]);

    const predicate = compileNodeRules(node, { providedTokens: provided });
    const verdict = evaluatePredicate(predicate, closedWorldContext(provided, universe));

    expect(verdict).toBe("false");
    expect(gluingDecision(node, provided)).toBe(false);
  });

  it("scenario 4: empty rules trivially pass", () => {
    const node: CompilableNode = {};
    const provided = new Set<string>();
    const universe = new Set<string>();

    const predicate = compileNodeRules(node, { providedTokens: provided });
    const verdict = evaluatePredicate(predicate, closedWorldContext(provided, universe));

    expect(verdict).toBe("true");
    expect(gluingDecision(node, provided)).toBe(true);
  });

  it("randomised sweep: closed-world Boolean parity holds", () => {
    // Small but non-trivial token universe; exhaustively check all subsets.
    const universe = ["a", "b", "c", "d"];
    const cases: CompilableNode[] = [
      { requires: ["a"] },
      { requires: ["a", "b"] },
      { forbids: ["c"] },
      { requires: ["a"], forbids: ["b"] },
      { requires: ["a", "b"], forbids: ["c", "d"] },
      { requires: [], forbids: [] },
      { requires: ["a", "a"] }, // duplicates collapse
    ];

    for (const node of cases) {
      for (let mask = 0; mask < 1 << universe.length; mask++) {
        const provided = new Set<string>();
        universe.forEach((tok, i) => {
          if (mask & (1 << i)) provided.add(tok);
        });
        const ctx = closedWorldContext(provided, new Set(universe));

        const predicate = compileNodeRules(node, { providedTokens: provided });
        const verdict = evaluatePredicate(predicate, ctx);
        const expected = gluingDecision(node, provided) ? "true" : "false";

        expect(verdict, `node=${JSON.stringify(node)} provided=${[...provided]}`).toBe(expected);
      }
    }
  });
});

describe("compileNodeRules under partial information", () => {
  it("a missing-but-not-denied requirement evaluates to unknown", () => {
    const node: CompilableNode = { requires: ["maybe"] };
    const predicate = compileNodeRules(node, { providedTokens: new Set() });
    const verdict = evaluatePredicate(predicate, {
      providedTokens: new Set(),
      deniedTokens: new Set(), // partial-graph, nothing denied
    });
    expect(verdict).toBe("unknown");
  });

  it("a forbids over an unseen token evaluates to unknown", () => {
    const node: CompilableNode = { forbids: ["maybe"] };
    const predicate = compileNodeRules(node, { providedTokens: new Set() });
    const verdict = evaluatePredicate(predicate, {
      providedTokens: new Set(),
      deniedTokens: new Set(),
    });
    expect(verdict).toBe("unknown");
  });

  it("conjunction of a satisfied requires with an unknown one is unknown", () => {
    const node: CompilableNode = { requires: ["seen", "unseen"] };
    const predicate = compileNodeRules(node, { providedTokens: new Set(["seen"]) });
    const verdict = evaluatePredicate(predicate, {
      providedTokens: new Set(["seen"]),
      deniedTokens: new Set(),
    });
    expect(verdict).toBe("unknown");
  });

  it("conjunction collapses to false if any clause is decisively false", () => {
    // forbids(taboo) is false because taboo IS provided; the requires clause
    // is unknown, but `false` dominates `and`.
    const node: CompilableNode = { requires: ["unseen"], forbids: ["taboo"] };
    const predicate = compileNodeRules(node, { providedTokens: new Set(["taboo"]) });
    const verdict = evaluatePredicate(predicate, {
      providedTokens: new Set(["taboo"]),
      deniedTokens: new Set(),
    });
    expect(verdict).toBe("false");
  });
});
