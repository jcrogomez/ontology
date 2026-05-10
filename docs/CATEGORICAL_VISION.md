# Ontology — Categorical Vision

> *Models may speak. Only explicit graph commands may mutate the network.*
> *Code is the compiled shadow of a valid semantic network.*

This document is the load-bearing **categorical map** of Ontology. It maps the
nine categorical concepts most relevant to the project (categories, functors,
natural transformations, limits/colimits, adjunctions, monads, representable
functors / Yoneda, fibrations, topos / subobject classifier) onto the concrete
modules that already ship — and pins where each concept lives in source.

It is the doc to read after `ONTOLOGY_CANON.md` and `MATHEMATICAL_MODEL.md`
when you want to understand *why* the architecture looks the way it does.

> **Honesty check.** Some of the boxes below describe operationally-true
> correspondences (the code does the thing, the categorical name fits) but
> are not pinned by tests of the corresponding law. A few are explicit
> analogies. [`MATHEMATICAL_CLAIMS.md`](MATHEMATICAL_CLAIMS.md) classifies
> every claim into one of four tiers (strict / operational / analogy /
> aspirational) with file citations. Read it alongside this map to know
> *how literally* each correspondence holds.

---

## 1. The picture in one diagram

```
                    +-----------------------+
                    |   Categorical concept |
                    +-----------------------+
                              │
   ┌──────────────┬───────────┼───────────────┬──────────────┐
   ▼              ▼           ▼               ▼              ▼
Category +    Functor      Natural    Representable     Subobject
Multigraph   (compile)    transform    functor /         classifier
                                       Yoneda            (Ω, topos)
   │              │           │               │              │
   ▼              ▼           ▼               ▼              ▼
src/schemas    src/runtime  (compile        src/runtime    src/runtime
src/core/      /compile/    plan steps,     /query/        /topos/
edges/        compile-      future merge    representable  predicate.ts
nodes/        plan-runner   proposals)
                                       
   ┌────────────────────────────────────────────────────────┐
   ▼                            ▼                           ▼
   Adjunction                  Monad                  Fibration
   (propose ⊣ apply,           (Result, Effect,       (branches as fibers
    refine ⊣ project —         EffectWithLog)         over the event log)
    intuitive only,            
    not yet formal)             
   │                            │                           │
   ▼                            ▼                           ▼
   src/core/proposals/         src/runtime/effects/        src/runtime
   persist.ts                                              /fibration/
```

Each box names a concept; underneath sits the file (or files) that *embody* it
in code today. A few boxes are still labelled "future work"; those are flagged
explicitly in §3.

---

## 2. The nine concepts, mapped

### 2.1 Category & typed multigraph — *axiom 1*

The core data structure of Ontology is a typed temporal **multigraph**: a
collection of typed objects (nodes) and typed morphisms (edges), with multiple
edges allowed between the same pair of objects.

| Categorical idea           | Ontology home                                  |
| -------------------------- | ---------------------------------------------- |
| Object                     | `OntologyNode` ([src/schemas/ontology.ts](src/schemas/ontology.ts))      |
| Morphism                   | `OntologyEdge` (18 typed relations)            |
| Composition                | implicit via `compile-plan` traversal          |
| Identity                   | every node trivially has a self-existence edge |
| Multiple morphisms A → B   | allowed (multigraph, not simple graph)         |

Edges live in [`src/core/edges/create-edge.ts`](src/core/edges/create-edge.ts) and the
typed vocabulary is enforced by `EdgeTypeSchema` in
[`src/schemas/ontology.ts`](src/schemas/ontology.ts). The *abstraction poset*
(axiom 3) restricts the direction of refinement-family edges
(`refines`, `inherits_from`, `implements`, `belongs_to`) but does not restrict
the rest of the multigraph structure.

### 2.2 Functor — *axiom 6, the compiler functor*

Compilation is a **structure-preserving functor** F : 𝓘 → 𝓐 from the category
of *intentions* to the category of *artifacts*:

- **Objects.** Each compilable node maps to one artifact under
  `.ontology/artifacts/generated/`.
- **Morphisms.** Hard-dependency edges in 𝓘 (`depends_on`, `inherits_from`,
  `refines`, `implements`, `validates_against`, `belongs_to`) determine the
  topological compile order in 𝓐.
- **Identity / composition.** A leaf node compiled with the mock provider on
  `task: code_sketch` returns its `prompt.raw` verbatim — that is F acting as
  the identity functor on a degenerate object.

The implementation is [`src/runtime/compile/compile-plan-runner.ts`](src/runtime/compile/compile-plan-runner.ts)
plus the planner [`src/runtime/graph/compile-plan.ts`](src/runtime/graph/compile-plan.ts)
(Kahn's algorithm over the hard-dependency edge family).

### 2.3 Natural transformation — *between equivalent functors*

A natural transformation η : F ⇒ G is a coherent family of morphisms
{η_X : F(X) → G(X)} that commutes with the morphisms of the source category.

In Ontology, the most natural place this concept will land is the
**branch-merge proposal** (future work): given two compile functors that view
the graph from two different branches, merging branches is a natural
transformation between them. Today the structure is implicit in the proposal
system ([`src/core/proposals/persist.ts`](src/core/proposals/persist.ts)) which
already pins `parentHash` re-validation and stale detection — these are the
coherence conditions a natural transformation must satisfy.

The branch fibration module ([§2.8](#28-fibration--branches-as-fibers))
provides the read-only foundation that this future natural-transformation
formalisation will build on.

### 2.4 Limits / colimits — *via topological closure*

Limits and colimits are universal cones into / out of a diagram. Today
Ontology realises them in two places:

- **Compile plan as a colimit.** `computeCompilePlan(focal)` returns the
  topological closure of `focal` under hard-dependency edges. Read backward,
  this is the colimit of all dependencies *into* `focal`.
- **Context assembly as a limit.** `assembleContext(focal)` walks parents and
  edge neighbours and glues their context fragments. Reading the gluing
  ([`src/runtime/context/gluing.ts`](src/runtime/context/gluing.ts)) as a limit
  in the presheaf topos is the formal interpretation of axiom 5.

These are not labelled "limit" or "colimit" in the source today; the
correspondence is a matter of how you read the existing functions.

### 2.5 Adjunction — *propose ⊣ apply (informal)*

The proposal system has the *shape* of an adjunction: every node mutation
factors through a typed candidate (`propose`) which is then either applied
(`apply`) or rejected. The Hom-set bijection

> Hom(propose(X), Y)  ≅  Hom(X, apply^{-1}(Y))

is not pinned formally yet, but the existing parentHash re-validation
([`src/core/proposals/persist.ts`](src/core/proposals/persist.ts)) is exactly
the coherence law a unit / counit pair would impose. Treat this as a
*candidate* adjunction; formalising it cleanly is on the roadmap.

A second candidate adjunction worth flagging is
**refine ⊣ project**: refinement-family edges climb the abstraction poset
(refine: source → target with `level(source) ≤ level(target)`), and the
"forget the refinement" projection is its right adjoint.

### 2.6 Monad — *Effect runtime, [src/runtime/effects/](src/runtime/effects/)*

A monad is an endofunctor T : 𝓒 → 𝓒 with unit η : 1 ⇒ T and multiplication
μ : T² ⇒ T satisfying associativity and identity. The new effects module ships
the trio:

| Layer            | Type                                            | Purpose                       |
| ---------------- | ----------------------------------------------- | ----------------------------- |
| `Result<T, E>`   | `{ ok: T } ∣ { err: E }`                        | total disjoint sum / Either   |
| `Effect<T, E>`   | `() => Result<T, E>`                            | suspended Result (IO ∘ Result) |
| `EffectWithLog`  | `() => { value: Result<T,E>; logs: LogEntry[] }`| Writer ∘ IO ∘ Result          |

All three obey the **three monad laws** (left identity, right identity,
associativity), proven on hand-picked values in
[`tests/runtime/effects/result.test.ts`](tests/runtime/effects/result.test.ts) and
[`tests/runtime/effects/io.test.ts`](tests/runtime/effects/io.test.ts).

`bindWithLog` concatenates logs even when the inner effect fails — log entries
are write-only and survive failure. This is exactly what the compiler needs
for principled diagnostic accumulation.

**Status.** Shipped and integrated. The library ships in PR #111 with proven
monad laws; `compileNode` is now built on `EffectWithLog` (PR #115) — the
dispatch / write / validate / runtime-check pipeline composes via
`bindWithLog`, and the top-level `try/catch` is retired. Design rationale is
in [`docs/EFFECT_MONAD.md`](docs/EFFECT_MONAD.md).

### 2.7 Representable functor & Yoneda — *`onto query`, [src/runtime/query/](src/runtime/query/)*

The Yoneda Lemma states that an object X in a locally small category is
fully determined, up to isomorphism, by its representable functor
`Hom(–, X)`: the profile of all morphisms targeting X.

Ontology's new `onto query` verb operationalises this: a node is fully
characterised by its **Hom-profile** — what edges arrive at it, what edges
leave it, what concepts its context provides / requires / forbids, and what
intrinsic coordinates (kind, abstraction, plane, manifestation, status,
branch) classify it. A *query shape* is a partial Hom-profile; the matcher
returns every node whose actual Hom-profile is a superset.

```bash
onto query --kind rule --has-incoming refines --provides spec
```

The pure matcher lives at
[`src/runtime/query/representable.ts`](src/runtime/query/representable.ts);
its Zod-validated shape grammar is in
[`src/runtime/query/types.ts`](src/runtime/query/types.ts).

The empty shape `{}` matches every node (the identity Hom-profile). That's
the trivial Yoneda statement — every object represents itself.

Full design in [`docs/QUERY_REPRESENTABLE.md`](docs/QUERY_REPRESENTABLE.md).

### 2.8 Fibration — *branches as fibers, [src/runtime/fibration/](src/runtime/fibration/)*

A **Grothendieck fibration** is a functor p : E → B such that for every
morphism f : b → b' in the base and every object E over b', there is a
*cartesian* morphism above f.

In Ontology:

| Fibration concept                  | Ontology construct                                            |
| ---------------------------------- | ------------------------------------------------------------- |
| Base category B                    | the temporal log `.ontology/events.jsonl` (linear sequence)   |
| Total category E                   | events tagged by branch                                       |
| Functor p : E → B                  | "forget the branch label"                                     |
| Object over branch b               | a node with `coordinates.branch === b`                        |
| Fiber p⁻¹(b)                       | the induced subgraph of nodes + edges on branch b             |
| Cartesian lift of f at node N      | a node N' over b' agreeing with N on kind / abstraction / etc.|

The library implements *fibers* and *cartesian lifts* explicitly. The
**base** category and the functor p are implicit (the existing event log and
the existing `coordinates.branch` projection).

Public API in
[`src/runtime/fibration/branch-fiber.ts`](src/runtime/fibration/branch-fiber.ts):

```ts
listBranches(state)                 // unique branch names, sorted
computeBranchFiber(state, branch)   // induced subgraph
computeAllFibers(state)             // partition of state by branch
describeCartesianLift(node, target) // proposal for relabelling a node
```

Status: read-only library shipped in PR #111. Walker `:branch list` (PR #114)
is the first surface. Open follow-ups: `onto branch list / fiber` CLI,
branch-aware compile (`compile run --branch feature/x`), `onto branch lift`,
and branch-merge proposals (a natural transformation between two functors
into a fiber).

Full design in [`docs/BRANCH_FIBRATION.md`](docs/BRANCH_FIBRATION.md).

### 2.9 Topos / subobject classifier — *rule predicates, [src/runtime/topos/](src/runtime/topos/)*

In an elementary topos, the **subobject classifier** Ω classifies subobjects:
subobjects of an object X correspond to morphisms X → Ω. In Set, Ω = {⊤, ⊥}.
In a presheaf topos, Ω carries richer (intuitionistic) logical structure.

Ontology's new topos module lifts a node's `requires` / `provides` / `forbids`
declarations into a **first-class predicate algebra** evaluated against a
three-valued Ω = `"true" | "false" | "unknown"`:

- `"true"` — the predicate holds in scope.
- `"false"` — it definitely fails.
- `"unknown"` — the available evidence does not decide.

The three-valued reading matters because a graph under construction is
*partial*: many tokens are simply not yet declared. A two-valued logic would
silently turn "I don't know" into "no". The evaluator is **monotone wrt
information refinement**: replacing `unknown` inputs with definite values can
only refine the result toward a definite answer.

Operations:

```
∧  | T  F  U          ∨  | T  F  U          ¬T = F     →  | T  F  U
---+--------          ---+--------          ¬F = T     ---+--------
 T | T  F  U           T | T  T  T          ¬U = U      T | T  F  U
 F | F  F  F           F | T  F  U                      F | T  T  T
 U | U  F  U           U | T  U  U                      U | U  U  U
```

Predicate constructors: `pAnd`, `pOr`, `pNot`, `pImplies`, `allOf`, `anyOf`,
`atomProvides`, `atomRequires`, `atomForbids`. A node compiles into one
predicate via `compileNodeRules(node, neighborhood)`, and
`evaluatePredicate(p, ctx)` returns Ω.

**Status: shipped + integrated.** `intent-validator.ts` is now built on
this algebra: its three checks (gluing ok, candidate non-empty, FORBID
phrase scan) compile to predicates that fold via `allOf`, evaluated
against an `EvaluationContext` synthesised from the input. The
`IntentValidationResult` contract is preserved (`ok`, `score`,
`violations`, `warnings`); a new `verdict: Omega` field exposes the
underlying three-valued result. Closed-world by default — every synthetic
token is classified — so externally observable behaviour stays Boolean.

We are *not* a topos in the strict sense: `omegaImplies` is the Kleene
material implication, not the Heyting implication of a frame Ω.
`MATHEMATICAL_CLAIMS.md` §3.9 calls this out explicitly.

Full design in [`docs/RULES_TOPOS.md`](docs/RULES_TOPOS.md).

---

## 3. Status table

| Concept                       | Status                                            | Lives in                                  |
| ----------------------------- | ------------------------------------------------- | ----------------------------------------- |
| Category / typed multigraph   | ✅ shipped (axiom 1)                              | `src/schemas/`, `src/core/edges/`         |
| Compiler functor              | ✅ shipped (axiom 6, Bootstrap 0.8)               | `src/runtime/compile/`                    |
| Natural transformation        | 🟡 implicit (proposal coherence) — formal pending | `src/core/proposals/`                     |
| Limit / colimit (compile plan)| ✅ shipped, not yet labelled as such              | `src/runtime/graph/compile-plan.ts`       |
| Limit (context as presheaf)   | ✅ shipped (axiom 5)                              | `src/runtime/context/gluing.ts`           |
| Adjunction (propose ⊣ apply)  | 🟡 candidate, not formal                          | `src/core/proposals/persist.ts`           |
| Monad (Result / Effect)       | ✅ library shipped, ✅ `compileNode` on `EffectWithLog` (PR #115) | `src/runtime/effects/`                    |
| Representable / Yoneda query  | ✅ shipped (CLI + walker `:query`)                | `src/runtime/query/`, `src/commands/query/` |
| Fibration (branches)          | ✅ library shipped, walker `:branch list`, **`onto branch` CLI TODO** | `src/runtime/fibration/`                  |
| Topos / Ω predicate algebra   | ✅ library shipped, ✅ validator ported onto algebra | `src/runtime/topos/`, `src/runtime/context/intent-validator.ts` |

---

## 4. What this unlocks next

- ✅ **Compiler refactor onto `EffectWithLog`** (PR #115) — every step
  accumulates logs even when failing, errors propagate via `bindWithLog`
  instead of `try/catch`.
- ✅ **Validator port onto topos algebra** — `intent-validator.ts` is now
  built on `compileValidationPredicate` + `evaluatePredicate`. Three-valued
  internally; closed-world, two-valued externally; `result.verdict` exposes
  the underlying Ω. See [`MATHEMATICAL_CLAIMS.md`](MATHEMATICAL_CLAIMS.md)
  §3.9 for the rigor classification.
- 🟡 **Branch-aware compile** — `onto compile run --branch feature/x` walks
  the fiber, not the global graph. `computeBranchFiber` is in place; only the
  CLI wiring is missing. Then a real natural transformation `merge` can
  relate two fibers.
- 🟡 **`onto branch lift <nodeId> --to feature/x`** — turns the read-only
  `describeCartesianLift` into a proposal.
- 🟡 **`onto query` extensions** — negation in shapes (`!hasIncoming`), exact
  edge profiles, multi-shape OR queries.

Each of these items has a one-line entry in [`docs/ROADMAP.md`](docs/ROADMAP.md).

---

## 5. Reading list

- Mac Lane, *Categories for the Working Mathematician* — for limits, adjoints,
  monads, Yoneda.
- Goldblatt, *Topoi: The Categorial Analysis of Logic* — for the topos / Ω /
  internal-logic story.
- Grothendieck, *SGA 1* — for fibered categories and descent.
- Lawvere & Schanuel, *Conceptual Mathematics* — gentle entry point.
- The corresponding Ontology design notes, one per categorical concept:
  [`docs/QUERY_REPRESENTABLE.md`](docs/QUERY_REPRESENTABLE.md),
  [`docs/EFFECT_MONAD.md`](docs/EFFECT_MONAD.md),
  [`docs/BRANCH_FIBRATION.md`](docs/BRANCH_FIBRATION.md),
  [`docs/RULES_TOPOS.md`](docs/RULES_TOPOS.md).
