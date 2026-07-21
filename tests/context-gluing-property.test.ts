import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { glueFragments, restrictSection } from "../src/forward/context/gluing.js";
import type { ContextFragment } from "../src/forward/context/presheaf.js";

// Property-based companion to context-gluing.test.ts and
// presheaf-sheaf-laws.test.ts. Those pin the separation / gluing axioms on a
// fixed 3-key universe (exhaustively over two-piece families); here the same
// invariants run over randomised families on a larger key universe, with
// fast-check shrinking any counterexample down to a minimal family.

const KEYS = ["k1", "k2", "k3", "k4", "k5", "k6", "k7", "k8"] as const;
const RULES = ["r1", "r2", "r3"] as const;

const arbKeys = fc.uniqueArray(fc.constantFrom(...KEYS), { maxLength: 4 });

// The canonical signature table: under "identify-if-equal", a compatible
// family is one whose providers all carry these signatures.
const SIG: Record<string, string> = Object.fromEntries(
  KEYS.map((k) => [k, `sig_${k}`]),
);

interface FragmentParts {
  provides: string[];
  requires: string[];
  forbids: string[];
  optional: string[];
  rules: string[];
}

const arbParts: fc.Arbitrary<FragmentParts> = fc.record({
  provides: arbKeys,
  requires: arbKeys,
  forbids: arbKeys,
  optional: arbKeys,
  rules: fc.uniqueArray(fc.constantFrom(...RULES), { maxLength: 2 }),
});

function toFragment(
  parts: FragmentParts,
  index: number,
  options: { branch?: string; signed?: boolean } = {},
): ContextFragment {
  const fragment: ContextFragment = {
    nodeId: `frag_${index}`,
    branch: options.branch ?? "main",
    provides: parts.provides,
    requires: parts.requires,
    forbids: parts.forbids,
    optional: parts.optional,
    rules: parts.rules,
  };
  if (options.signed) {
    fragment.provideSignatures = Object.fromEntries(
      parts.provides.map((k) => [k, SIG[k]]),
    );
  }
  return fragment;
}

const arbFamily: fc.Arbitrary<ContextFragment[]> = fc
  .array(arbParts, { minLength: 1, maxLength: 5 })
  .map((all) => all.map((parts, i) => toFragment(parts, i)));

const arbSignedFamily: fc.Arbitrary<ContextFragment[]> = fc
  .array(arbParts, { minLength: 1, maxLength: 5 })
  .map((all) => all.map((parts, i) => toFragment(parts, i, { signed: true })));

const sortedUnique = (xs: string[]): string[] => Array.from(new Set(xs)).sort();
const unionOf = (family: ContextFragment[], field: keyof FragmentParts): string[] =>
  sortedUnique(family.flatMap((f) => f[field] as string[]));

// Conflicts normalised for order-insensitive comparison.
const normalisedConflicts = (
  conflicts: { type: string; message: string; nodeIds: string[] },
): string => `${conflicts.type}|${conflicts.message}|${[...conflicts.nodeIds].sort().join(",")}`;

describe("glueFragments — separated-presheaf invariants over randomised families", () => {
  it("order independence: any permutation glues to the same result", () => {
    fc.assert(
      fc.property(
        arbFamily.chain((family) =>
          fc.tuple(
            fc.constant(family),
            fc.shuffledSubarray(family, {
              minLength: family.length,
              maxLength: family.length,
            }),
          ),
        ),
        ([family, shuffled]) => {
          const a = glueFragments(family);
          const b = glueFragments(shuffled);
          expect(b.ok).toBe(a.ok);
          expect(b.merged).toEqual(a.merged);
          expect(b.conflicts.map(normalisedConflicts).sort()).toEqual(
            a.conflicts.map(normalisedConflicts).sort(),
          );
        },
      ),
    );
  });

  it("the merged section is the union: every list field is the sorted union of the pieces", () => {
    fc.assert(
      fc.property(arbFamily, (family) => {
        const { merged } = glueFragments(family);
        expect(merged.provides).toEqual(unionOf(family, "provides"));
        expect(merged.requires).toEqual(unionOf(family, "requires"));
        expect(merged.forbids).toEqual(unionOf(family, "forbids"));
        expect(merged.optional).toEqual(unionOf(family, "optional"));
        expect(merged.rules).toEqual(unionOf(family, "rules"));
      }),
    );
  });

  it("ok soundness: ok=true implies requirements satisfied, no forbidden match, provider uniqueness, single branch", () => {
    fc.assert(
      fc.property(arbFamily, (family) => {
        const result = glueFragments(family);
        if (!result.ok) return;
        const provides = new Set(unionOf(family, "provides"));
        for (const req of unionOf(family, "requires")) {
          expect(provides.has(req)).toBe(true);
        }
        for (const forbid of unionOf(family, "forbids")) {
          expect(provides.has(forbid)).toBe(false);
        }
        const providers = new Map<string, Set<string>>();
        for (const f of family) {
          for (const key of f.provides) {
            if (!providers.has(key)) providers.set(key, new Set());
            providers.get(key)!.add(f.nodeId);
          }
        }
        for (const nodeIds of providers.values()) {
          expect(nodeIds.size).toBeLessThanOrEqual(1);
        }
        expect(new Set(family.map((f) => f.branch)).size).toBe(1);
      }),
    );
  });

  it("separation: two distinct providers of the same key always conflict under the default policy", () => {
    fc.assert(
      fc.property(
        arbFamily.filter((family) => family.length >= 2),
        fc.constantFrom(...KEYS),
        (family, key) => {
          const forced = family.map((f, i) =>
            i <= 1 ? { ...f, provides: sortedUnique([...f.provides, key]) } : f,
          );
          const result = glueFragments(forced);
          expect(result.ok).toBe(false);
          const dup = result.conflicts.filter(
            (c) => c.type === "duplicate_provider" && c.message.includes(`key: ${key}`),
          );
          expect(dup.length).toBe(1);
          expect(dup[0].nodeIds).toEqual(
            expect.arrayContaining(["frag_0", "frag_1"]),
          );
        },
      ),
    );
  });

  it("branch mismatch: fragments on two branches always raise branch_mismatch", () => {
    fc.assert(
      fc.property(
        arbFamily.filter((family) => family.length >= 2),
        (family) => {
          const mixed = family.map((f, i) =>
            i === family.length - 1 ? { ...f, branch: "other" } : f,
          );
          const result = glueFragments(mixed);
          expect(result.ok).toBe(false);
          expect(result.conflicts.some((c) => c.type === "branch_mismatch")).toBe(true);
        },
      ),
    );
  });
});

describe("glueFragments — sheaf-on-equal-signature invariants (identify-if-equal)", () => {
  it("a compatible family (all providers signed from one table) never raises duplicate_provider", () => {
    fc.assert(
      fc.property(arbSignedFamily, (family) => {
        const result = glueFragments(family, {
          onDuplicateProvider: "identify-if-equal",
        });
        expect(
          result.conflicts.filter((c) => c.type === "duplicate_provider"),
        ).toEqual([]);
      }),
    );
  });

  it("restriction round-trip: the glued section restricts back to each piece (s|_Ui = si)", () => {
    fc.assert(
      fc.property(arbSignedFamily, (family) => {
        const { merged } = glueFragments(family, {
          onDuplicateProvider: "identify-if-equal",
        });
        for (const piece of family) {
          const restricted = restrictSection(merged, piece);
          expect(restricted.nodeId).toBe(piece.nodeId);
          expect(sortedUnique(restricted.provides)).toEqual(sortedUnique(piece.provides));
          expect(sortedUnique(restricted.requires)).toEqual(sortedUnique(piece.requires));
          expect(sortedUnique(restricted.forbids)).toEqual(sortedUnique(piece.forbids));
          expect(sortedUnique(restricted.optional)).toEqual(sortedUnique(piece.optional));
          expect(sortedUnique(restricted.rules)).toEqual(sortedUnique(piece.rules));
          for (const key of piece.provides) {
            expect(restricted.provideSignatures?.[key]).toBe(SIG[key]);
          }
        }
      }),
    );
  });

  it("drift blocks: one provider deviating on a shared key always conflicts, never a false identification", () => {
    fc.assert(
      fc.property(
        arbSignedFamily.filter((family) => family.length >= 2),
        fc.constantFrom(...KEYS),
        (family, key) => {
          const forced = family.map((f, i) => {
            if (i > 1) return f;
            const provides = sortedUnique([...f.provides, key]);
            const provideSignatures = {
              ...Object.fromEntries(provides.map((k) => [k, SIG[k]])),
              ...(i === 1 ? { [key]: `${SIG[key]}_drift` } : {}),
            };
            return { ...f, provides, provideSignatures };
          });
          const result = glueFragments(forced, {
            onDuplicateProvider: "identify-if-equal",
          });
          expect(result.ok).toBe(false);
          expect(
            result.conflicts.some(
              (c) => c.type === "duplicate_provider" && c.message.includes(`key: ${key}`),
            ),
          ).toBe(true);
        },
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// The Grothendieck site (Lemma 1) + general amalgamation/uniqueness + the
// two-value-presheaf correspondence. docs/design/laws/GLUING_SITE_THEOREM.md.
// These pin the 2026-07-21 development: the sheaf lives on the FULL standard
// site (joint-surjection coverage), which is a genuine Grothendieck pretopology,
// and the two policies are two value-presheaves over it (differ only on
// provenance). Together with the arbitrary-family sheaf invariants above, this
// is the general theorem — the fixed 3-key sweep in presheaf-sheaf-laws.test.ts
// is its finite shadow.
// ---------------------------------------------------------------------------

const arbCover = fc.array(fc.uniqueArray(fc.constantFrom(...KEYS), { maxLength: 4 }), {
  minLength: 1,
  maxLength: 5,
});

describe("gluing site — the joint-surjection coverage is Grothendieck (Lemma 1)", () => {
  // A cover {Ui} of U (= ⋃Ui). Identity ({U} covers U) and transitivity
  // (⋃⋃Uij = ⋃Ui) are immediate unions; the substantive axiom is stability.
  it("stability under pullback (= ∩): {Ui} covers U, V ⊆ U ⟹ {Ui ∩ V} covers V", () => {
    fc.assert(
      fc.property(arbCover, fc.uniqueArray(fc.constantFrom(...KEYS)), (pieces, Vraw) => {
        const U = new Set(pieces.flat());
        const V = Vraw.filter((k) => U.has(k)); // V ⊆ U
        const pulled = pieces.flatMap((p) => p.filter((k) => V.includes(k))); // ⋃(Ui ∩ V)
        expect(sortedUnique(pulled)).toEqual(sortedUnique(V)); // = V
      }),
    );
  });
});

describe("sheaf on the site — general amalgamation + uniqueness (identify-if-equal)", () => {
  it("EXISTENCE (any cover): a signature-coherent family amalgamates to the union of the cover", () => {
    fc.assert(
      fc.property(arbSignedFamily, (family) => {
        const g = glueFragments(family, { onDuplicateProvider: "identify-if-equal" });
        expect(g.conflicts.filter((c) => c.type === "duplicate_provider")).toEqual([]);
        expect(g.merged.provides).toEqual(unionOf(family, "provides"));
      }),
    );
  });

  it("UNIQUENESS (any cover): glue → restrict to each piece → re-glue recovers the section (s determined by its restrictions)", () => {
    fc.assert(
      fc.property(arbSignedFamily, (family) => {
        const first = glueFragments(family, { onDuplicateProvider: "identify-if-equal" });
        const restrictions = family.map((p) => restrictSection(first.merged, p));
        const reglued = glueFragments(restrictions, { onDuplicateProvider: "identify-if-equal" });
        expect(reglued.merged).toEqual(first.merged);
      }),
    );
  });
});

describe("two value-presheaves over one site — default (SSoT) vs identify-if-equal differ only on provenance", () => {
  it("a shared key with EQUAL signatures: default conflicts (provenance-tagged F_Node), identify-if-equal glues (F_Sig)", () => {
    fc.assert(
      fc.property(
        arbSignedFamily.filter((f) => f.length >= 2),
        fc.constantFrom(...KEYS),
        (family, key) => {
          // Two DISTINCT providers of `key`, same (table) signature → coherent.
          const forced = family.map((f, i) =>
            i <= 1
              ? {
                  ...f,
                  provides: sortedUnique([...f.provides, key]),
                  provideSignatures: { ...(f.provideSignatures ?? {}), [key]: SIG[key] },
                }
              : f,
          );
          const dupFor = (r: ReturnType<typeof glueFragments>) =>
            r.conflicts.some(
              (c) => c.type === "duplicate_provider" && c.message.includes(`key: ${key}`),
            );
          // F_Node: two nodeIds ⇒ non-matching ⇒ conflict (single-source-of-truth).
          expect(dupFor(glueFragments(forced))).toBe(true);
          // F_Sig: equal signature ⇒ matching ⇒ glued (no duplicate conflict).
          expect(
            dupFor(glueFragments(forced, { onDuplicateProvider: "identify-if-equal" })),
          ).toBe(false);
        },
      ),
    );
  });
});

describe("restrictSection — restriction is a projection for any family", () => {
  it("restricting the merged union by any piece recovers exactly that piece's domains (set-equality)", () => {
    fc.assert(
      fc.property(arbFamily, (family) => {
        const { merged } = glueFragments(family);
        for (const piece of family) {
          const restricted = restrictSection(merged, piece);
          expect(sortedUnique(restricted.provides)).toEqual(sortedUnique(piece.provides));
          expect(sortedUnique(restricted.requires)).toEqual(sortedUnique(piece.requires));
          expect(sortedUnique(restricted.forbids)).toEqual(sortedUnique(piece.forbids));
          expect(sortedUnique(restricted.optional)).toEqual(sortedUnique(piece.optional));
          expect(sortedUnique(restricted.rules)).toEqual(sortedUnique(piece.rules));
        }
      }),
    );
  });
});
