# Rules as Subobjects: a Topos-style Predicate Algebra

> Status: additive. The existing `intent-validator.ts` and `gluing.ts` are
> unchanged and continue to ship. This document describes a new layer in
> `src/runtime/topos/` that lifts a node's `requires` / `provides` / `forbids`
> declarations into a first-class, composable predicate algebra. A follow-up
> PR may rebuild the validator on top of this algebra; this PR only adds the
> machinery.

## 1. Why a topos?

In an elementary topos `E`, the **subobject classifier** `Ω` is the object
such that, for every object `X`, the subobjects of `X` are in natural
bijection with morphisms `X → Ω`. In `Set`, `Ω = {⊤, ⊥}` and a subobject of
`X` (an injection `S ↪ X`) corresponds to its characteristic function
`χ_S : X → Ω`. In other topoi `Ω` carries richer logical structure — for
example, in a presheaf topos `Set^{C^{op}}`, `Ω(c)` is the set of sieves on
`c`, and the internal logic is intuitionistic.

Ontology already has rule-like data: each node carries

- `provides : string[]` — semantic tokens this node asserts into scope,
- `requires : string[]` — semantic tokens this node depends on,
- `forbids  : string[]` — semantic tokens this node refuses to coexist with,

and `intent-validator.ts` / `gluing.ts` consume these arrays imperatively. The
topos layer lifts them into a small **predicate algebra**: each node compiles
into a `Predicate`, and two nodes' predicates can be combined with `∧, ∨, ¬,
→`. The predicate is then evaluated against an `EvaluationContext` (the
tokens currently in scope) to yield a value of `Ω`.

The point is not to be slavishly faithful to a topos-theoretic construction —
we are not, for instance, computing inside `Set^{C^{op}}` directly. The point
is to give the runtime a **composable, total, well-typed logic of rules**
whose laws and limits are spelled out, so that the validator can be moved
from ad-hoc loops into algebraic expressions.

## 2. A three-valued Ω

A graph under construction is, almost by definition, partial. At any moment
some semantic tokens have been declared and some have not. A two-valued logic
forces us to read "this token has not been declared yet" as `false`, which
silently turns "I don't know" into "no". The topos layer instead uses a
three-valued `Ω`:

```
type Omega = "true" | "false" | "unknown";
```

`unknown` means "the available evidence does not decide this question". The
evaluator is **monotone wrt information refinement**: if you replace some
`unknown` inputs with definite values, you can only refine the result toward
a definite answer — you can never flip an existing `true` to `false` or
vice versa.

### 2.1 Truth tables

```
∧  | T   F   U          ∨  | T   F   U          ¬T = F
---+-----------         ---+-----------         ¬F = T
 T | T   F   U           T | T   T   T          ¬U = U
 F | F   F   F           F | T   F   U
 U | U   F   U           U | T   U   U
```

`a → b` is defined as `(¬a) ∨ b`:

```
→  | T   F   U
---+-----------
 T | T   F   U
 F | T   T   T
 U | U   U   U     (NB: U → T  =  T, because T dominates ∨)
```

Two design notes:

- **`false` dominates `∧`, `true` dominates `∨`.** This is the strong-Kleene
  reading: a single decisive subterm decides the compound regardless of any
  unknowns in its siblings.
- **`unknown` is a fixed point of `¬`.** Refusing to commit to `p` is equally
  refusing to commit to `¬p`.

We do **not** use the intuitionistic Heyting implication `(a → b) := ⋁{c | a
∧ c ≤ b}` of a frame `Ω`. The `omegaImplies` defined here is the operational
material implication `¬a ∨ b`, which agrees with `→` on the Boolean slice and
is sufficient for validator-style checks. Promoting to a Heyting algebra is a
later concern.

## 3. The predicate algebra

```ts
type Atom =
  | { tag: "provides"; token: string }
  | { tag: "requires"; token: string }
  | { tag: "forbids"; token: string };

type Predicate =
  | { tag: "atom"; atom: Atom }
  | { tag: "and"; left: Predicate; right: Predicate }
  | { tag: "or"; left: Predicate; right: Predicate }
  | { tag: "not"; inner: Predicate }
  | { tag: "implies"; antecedent: Predicate; consequent: Predicate }
  | { tag: "true" } | { tag: "false" };
```

The atomic predicates evaluate as follows against an
`EvaluationContext = { providedTokens, deniedTokens }`:

| Atom | `T ∈ providedTokens` | `T ∈ deniedTokens` | otherwise |
| --- | --- | --- | --- |
| `provides T` | `true` | `false` | `unknown` |
| `requires T` | `true` | `false` | `unknown` |
| `forbids  T` | `false` | `true` | `unknown` |

`requires` and `provides` agree on the atomic question — "is this token in
scope?" — and differ only in label / intent. The two tags are kept distinct
so a future translator can surface different diagnostics ("missing
requirement" vs "claimed but unprovided"), but the evaluator treats them
identically.

### 3.1 Smart constructors

The smart constructors (`pAnd`, `pOr`, `pNot`, `pImplies`, `allOf`, `anyOf`)
apply a few exact algebraic simplifications eagerly:

- `pAnd(⊤, q) = q`, `pAnd(p, ⊤) = p`, `pAnd(⊥, _) = pAnd(_, ⊥) = ⊥`
- `pOr(⊥, q) = q`, `pOr(p, ⊥) = p`, `pOr(⊤, _) = pOr(_, ⊤) = ⊤`
- `pNot(⊤) = ⊥`, `pNot(⊥) = ⊤`, `pNot(pNot(p)) = p`
- `pImplies(⊥, _) = ⊤`, `pImplies(_, ⊤) = ⊤`, `pImplies(⊤, q) = q`
- `allOf([]) = ⊤`, `anyOf([]) = ⊥` (vacuous reductions)

These keep the compiled trees small and make `compileNodeRules` produce a
canonical form for trivial nodes.

## 4. Compiling a node

`compileNodeRules` is the bridge from ontological declarations to the
predicate algebra:

```
∧_{r ∈ requires} requires(r)   ∧   ∧_{f ∈ forbids} forbids(f)
```

Three deliberate choices:

1. **`provides` declarations are NOT injected** into the predicate. They are
   the node's *output*, not a check it imposes on itself. The caller is
   responsible for folding the focal node's `provides` into `providedTokens`
   *before* calling `compileNodeRules`. This keeps the compiler a pure
   mapping over the neighborhood.
2. **Empty arrays are handled by `allOf`** returning `pTrue`. A node that
   declares no constraints trivially passes — the vacuous conjunction.
3. **Duplicates are collapsed.** `requires: ["X", "X"]` compiles to a single
   `requires(X)` clause.

### 4.1 Worked example

```ts
const node = {
  requires: ["session-id", "audit-trail"],
  provides: ["report-row"],
  forbids: ["raw-pii"],
};

// Caller folds focal's provides into the providedTokens set before compiling.
const provided = new Set([...neighborhoodTokens, ...node.provides]);

const predicate = compileNodeRules(node, { providedTokens: provided });
// predicate ≅ requires("session-id")
//             ∧ requires("audit-trail")
//             ∧ forbids("raw-pii")

const verdict = evaluatePredicate(predicate, {
  providedTokens: provided,
  deniedTokens: new Set(),  // partial-graph: nothing explicitly denied
});

if (verdict === "true")  { /* accept */ }
if (verdict === "false") { /* reject */ }
if (verdict === "unknown"){
  // Recommended policy: warn but do not fail. The graph hasn't classified
  // every token yet; surfacing the unknowns is more useful than rejecting.
}
```

### 4.2 Composing rules across nodes

Because `Predicate` is a value, we can lift cross-node policies into the
algebra without rewriting `compileNodeRules`:

```ts
import { pImplies, atomProvides, atomForbids } from "ontology/runtime/topos";

// "If the upstream node provides `secret-input`, the downstream node must
// not provide `public-output`."
const policy = pImplies(
  atomProvides("secret-input"),
  atomForbids("public-output"),
);

const decision = evaluatePredicate(policy, ctx);
```

This is a tiny but real example of the gain: cross-node policies can now be
expressed and evaluated alongside per-node rules in the same algebra,
returning the same `Ω`.

## 5. Parity with existing gluing

`compileNodeRules` is designed so that, under a **closed-world** evaluation
context (every token in the universe is either in `providedTokens` or in
`deniedTokens` — no `unknown`s), the verdict matches the per-node subset of
`glueFragments`:

- `requires R` with `R ∉ providedTokens` ↔ `missing_requirement` conflict
- `forbids F` with `F ∈ providedTokens` ↔ `forbidden_match` conflict

The other two `glueFragments` conflict types — `duplicate_provider` and
`branch_mismatch` — are properties of *combinations* of fragments, not of a
single node's rules, and are intentionally outside the scope of the predicate
algebra. The parity test in
`tests/runtime/topos/rule-compiler.test.ts` exhausts a small token universe
(2⁴ = 16 token-set assignments × 7 hand-built rule shapes) and checks the
per-node parity contract holds in every closed-world configuration.

Under partial information (no closed-world assumption) the predicate evaluator
produces `unknown` where the gluing-style check would have silently said
`false`. That is the additive value: the topos layer can distinguish "this
node's requirement is contradicted" from "this node's requirement has not yet
been answered".

## 6. Recommended treatment of `unknown`

The validator is free to choose any policy on `unknown`. We recommend:

- `true`  → accept,
- `false` → reject (with the predicate offered as the diagnostic),
- `unknown` → emit a warning, do **not** fail. The token landscape is
  evolving; demoting partial knowledge to a hard failure invites churn.

A stricter "no unknowns allowed" mode (Boolean parity with gluing) is
recoverable by passing a complete `deniedTokens` set — i.e. the complement
of `providedTokens` over the known token universe.

## 7. What is intentionally not here

- A frame / Heyting structure on `Ω`. The current `omegaImplies` is the
  Kleene material implication, not the right adjoint to `∧`.
- A general "internal language" that mirrors the topos's own logic. We are
  sketching the operational core; a future PR can introduce quantifiers
  ranging over neighborhoods.
- A rewrite of `intent-validator.ts`. That validator currently checks
  candidate text against `FORBID:` constraints and operates after gluing.
  Porting it onto this algebra is a follow-up task.
