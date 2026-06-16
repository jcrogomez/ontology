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
> analogies. [`MATHEMATICAL_CLAIMS.md`](../../MATHEMATICAL_CLAIMS.md) classifies
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
src/kernel/schemas    src/forward/  (compile        src/laws/      src/laws/
src/kernel/core/      compile/      plan steps,     query/         topos/
edges/, nodes/        plan-runner   future merge    representable  predicate.ts
                                    proposals)
                                       
   ┌────────────────────────────────────────────────────────┐
   ▼                            ▼                           ▼
   Adjunction                  Monad                  Fibration
   (propose ⊣ apply,           (Result, Effect,       (branches as fibers
    refine ⊣ project —         EffectWithLog)         over the event log)
    intuitive only,            
    not yet formal)             
   │                            │                           │
   ▼                            ▼                           ▼
   src/kernel/core/proposals/    src/laws/effects/        src/laws/
   persist.ts                                             fibration/
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
| Object                     | `OntologyNode` ([src/kernel/schemas/ontology.ts](../../../src/kernel/schemas/ontology.ts))      |
| Morphism                   | `OntologyEdge` (18 typed relations)            |
| Composition                | implicit via `compile-plan` traversal          |
| Identity                   | every node trivially has a self-existence edge |
| Multiple morphisms A → B   | allowed (multigraph, not simple graph)         |

Edges live in [`src/kernel/core/edges/create-edge.ts`](../../../src/kernel/core/edges/create-edge.ts) and the
typed vocabulary is enforced by `EdgeTypeSchema` in
[`src/kernel/schemas/ontology.ts`](../../../src/kernel/schemas/ontology.ts). The *abstraction poset*
(axiom 3) restricts the direction of refinement-family edges
(`refines`, `inherits_from`, `implements`, `belongs_to`) but does not restrict
the rest of the multigraph structure.

### 2.2 Functor — *axiom 6, the compiler functor*

Compilation is a **structure-preserving functor**

$$F\;\colon\; \mathcal{I} \longrightarrow \mathcal{C}$$

from the category of *intentions* to the category $\mathcal{C}$ of *artifacts* (artifacts/source trees):

- **Objects.** Each compilable node $n \in \mathrm{Ob}(\mathcal{I})$ maps to one artifact $F(n)$ under `.ontology/artifacts/generated/`.
- **Morphisms.** Hard-dependency edges in $\mathcal{I}$ (`depends_on`, `inherits_from`, `refines`, `implements`, `validates_against`, `belongs_to`) determine the topological compile order in $\mathcal{C}$.
- **Identity / composition.** A leaf node compiled with the mock provider on `task: code_sketch` returns its `prompt.raw` verbatim — that is $F$ acting as the identity functor on a degenerate object.

The implementation is [`src/forward/compile/compile-plan-runner.ts`](../../../src/forward/compile/compile-plan-runner.ts) plus the planner [`src/kernel/graph/compile-plan.ts`](../../../src/kernel/graph/compile-plan.ts) (Kahn's algorithm over the hard-dependency edge family).

The **inverse direction** $G\colon \mathcal{C} \to \mathcal{I}$ is the central construction of [Project Legend](../inverse/PROJECT_LEGEND.md) — an approximate left adjoint that lifts existing source into the intent layer. The operational adjunction $G \dashv F$ (with unit $\eta\colon \mathrm{id}_{\mathcal{C}} \Rightarrow F \circ G$) and the measured $\varepsilon$ on the round-trip $F \circ G \approx \mathrm{id}_{\mathcal{C}}$ is `MATHEMATICAL_CLAIMS.md` §3.10.

### 2.3 Natural transformation — *between equivalent functors*

A natural transformation $\eta\colon F \Rightarrow G$ is a coherent family of morphisms $\{\eta_X\colon F(X) \to G(X)\}_{X \in \mathrm{Ob}(\mathcal{C})}$ that commutes with the morphisms of the source category — i.e. for every $f\colon X \to Y$, the square

$$\begin{array}{ccc} F(X) & \xrightarrow{\eta_X} & G(X) \\ F(f)\downarrow & & \downarrow G(f) \\ F(Y) & \xrightarrow{\eta_Y} & G(Y) \end{array}$$

commutes.

In Ontology, the most natural place this concept will land is the **branch-merge proposal** (future work): given two compile functors $F_b, F_{b'}\colon \mathcal{I} \to \mathcal{C}$ viewing the graph from two different branches $b, b'$, merging branches is a natural transformation $F_b \Rightarrow F_{b'}$ over the cartesian-lift functor. Today the structure is implicit in the proposal system ([`src/kernel/core/proposals/persist.ts`](../../../src/kernel/core/proposals/persist.ts)) which already pins `parentHash` re-validation and stale detection — these are the coherence conditions a natural transformation must satisfy.

A second concrete natural transformation is the **Inspector triangle** (Project Legend §3): $\tau\colon \mathrm{intent} \Rightarrow \mathrm{prose}$ produces a per-node `translator` paragraph; combined with $F$ and the LLM-described-code map $\sigma$, it gives a (probabilistically) commuting square.

### 2.4 Limits / colimits — *analogy only (T3); not a universal construction*

> **Honesty note (`MATHEMATICAL_CLAIMS.md` §3.4, T3).** Nothing here is a
> categorical limit or colimit in the strict sense: no universal property is
> constructed or tested. Kahn's algorithm computes *a* topological order, not
> the universal cocone of a diagram; the gluing is a merge-with-conflict-checks,
> not a colimit. The two readings below are useful intuitions for the shape of
> the code, not claims about the codebase. Read them as analogy.

- **Compile plan — read as a colimit-shaped closure.** `computeCompilePlan(focal)` returns the topological closure of $n$ under hard-dependency edges,
  
  $$\mathrm{Plan}(n) \;\approx\; \mathrm{colim}\Bigl(\,\{m \in \mathcal{I} : m \to^{\,*}\, n \text{ along hard-deps}\}\,\Bigr).$$
  
  What is *actually* pinned (and stronger than this analogy) is **functoriality**: the plan is a linear extension of the dependency poset that `F` preserves — identity, morphisms, and composition are test-pinned (`MATHEMATICAL_CLAIMS.md` §Axiom 6 / §3.2, T1). That is the real structural claim; "colimit" is just the diagram shape.
- **Context assembly — a *separated-presheaf merge*, NOT a colimit.** `assembleContext(focal)` walks parents and edge neighbours and glues their fragments via [`src/forward/context/gluing.ts`](../../../src/forward/context/gluing.ts). It is tempting to write this as a quotient
  
  $$\mathrm{Glue}(n) \;\overset{?}{=}\; \bigsqcup_{m \in \mathrm{Nbhd}(n)} \mathcal{P}(m) \;\big/\; {\sim},$$
  
  but **that quotient is exactly what `glueFragments` does *not* compute** (negative result pinned 2026-06-01, `tests/presheaf-sheaf-laws.test.ts`; see `MATHEMATICAL_CLAIMS.md` §Axiom 5). Two fragments that *agree* on a shared provider are **rejected** (`duplicate_provider`), not identified under $\sim$. So the gluing is a **separated presheaf with provider-uniqueness** — it detects obstructions (missing requirement / forbidden match / branch mismatch / duplicate provider) but does not quotient agreeing sections into a colimit. The *restriction* law $F(S') \sqsubseteq F(S)$ that a presheaf must satisfy **is** pinned (T1); the gluing/colimit axiom is not (and, by design, should not be — provider-uniqueness is a feature).

### 2.5 Adjunction — *propose ⊣ apply (informal)*

The proposal system has the *shape* of an adjunction: every node mutation factors through a typed candidate (`propose`) which is then either applied (`apply`) or rejected. The Hom-set bijection

$$\mathrm{Hom}_{\mathcal{C}}\bigl(\mathrm{propose}(X),\,Y\bigr) \;\cong\; \mathrm{Hom}_{\mathcal{D}}\bigl(X,\,\mathrm{apply}^{-1}(Y)\bigr)$$

is not pinned formally yet, but the existing parentHash re-validation ([`src/kernel/core/proposals/persist.ts`](../../../src/kernel/core/proposals/persist.ts)) is exactly the coherence law a unit / counit pair would impose. Treat this as a *candidate* adjunction; formalising it cleanly is on the roadmap.

A second candidate adjunction worth flagging is **refine ⊣ project**: refinement-family edges climb the abstraction poset (refine: $s \to t$ with $\mathrm{level}(s) \le_L \mathrm{level}(t)$), and the "forget the refinement" projection is its right adjoint.

The **third and most important** candidate adjunction — and the only one with a concrete plan to make operational — is **Project Legend's $G \dashv F$** (the ingest functor $G$ as left adjoint to the compile functor $F$), with the round-trip homeomorphism $F \circ G \approx \mathrm{id}$ measured empirically. See [`PROJECT_LEGEND.md`](../inverse/PROJECT_LEGEND.md) §2.1 and [`MATHEMATICAL_CLAIMS.md`](../../MATHEMATICAL_CLAIMS.md) §3.10.

### 2.6 Monad — *Effect runtime, [src/laws/effects/](../../../src/laws/effects)*

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
[`tests/runtime/effects/result.test.ts`](../../../tests/runtime/effects/result.test.ts) and
[`tests/runtime/effects/io.test.ts`](../../../tests/runtime/effects/io.test.ts).

`bindWithLog` concatenates logs even when the inner effect fails — log entries
are write-only and survive failure. This is exactly what the compiler needs
for principled diagnostic accumulation.

**Status.** Shipped and integrated. The library ships in PR #111 with proven
monad laws; `compileNode` is now built on `EffectWithLog` (PR #115) — the
dispatch / write / validate / runtime-check pipeline composes via
`bindWithLog`, and the top-level `try/catch` is retired. Design rationale is
in [`docs/EFFECT_MONAD.md`](EFFECT_MONAD.md).

### 2.7 Representable functor & Yoneda — *`onto query`, [src/laws/query/](../../../src/laws/query)*

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
[`src/laws/query/representable.ts`](../../../src/laws/query/representable.ts);
its Zod-validated shape grammar is in
[`src/laws/query/types.ts`](../../../src/laws/query/types.ts).

The empty shape `{}` matches every node (the identity Hom-profile). That's
the trivial Yoneda statement — every object represents itself.

Full design in [`docs/QUERY_REPRESENTABLE.md`](QUERY_REPRESENTABLE.md).

### 2.8 Fibration — *branches as fibers, [src/laws/fibration/](../../../src/laws/fibration)*

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
[`src/laws/fibration/branch-fiber.ts`](../../../src/laws/fibration/branch-fiber.ts):

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

Full design in [`docs/BRANCH_FIBRATION.md`](BRANCH_FIBRATION.md).

### 2.9 Topos / subobject classifier — *rule predicates, [src/laws/topos/](../../../src/laws/topos)*

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

Full design in [`docs/RULES_TOPOS.md`](RULES_TOPOS.md).

---

## 3. Status table

| Concept                       | Status                                            | Lives in                                  |
| ----------------------------- | ------------------------------------------------- | ----------------------------------------- |
| Category / typed multigraph   | ✅ shipped (axiom 1)                              | `src/kernel/schemas/`, `src/kernel/core/edges/`         |
| Compiler functor              | ✅ shipped + functor laws pinned (axiom 6, T1 2026-06-01) | `src/forward/compile/`, `src/kernel/graph/artifact-category.ts` |
| Natural transformation        | 🟡 implicit (proposal coherence) — formal pending | `src/kernel/core/proposals/`                     |
| Limit / colimit (compile plan)| 🟡 analogy only (T3) — no universal property; functoriality is the real pin | `src/kernel/graph/compile-plan.ts`       |
| Presheaf (context assembly)   | ✅ restriction law T1; gluing is a separated presheaf, **not** a colimit (T3) | `src/forward/context/gluing.ts`           |
| Adjunction (propose ⊣ apply)  | 🟡 candidate, not formal                          | `src/kernel/core/proposals/persist.ts`           |
| Monad (Result / Effect)       | ✅ library shipped, ✅ `compileNode` on `EffectWithLog` (PR #115) | `src/laws/effects/`                    |
| Representable / Yoneda query  | ✅ shipped (CLI + walker `:query`)                | `src/laws/query/`, `src/surfaces/commands/query/` |
| Fibration (branches)          | ✅ library shipped, walker `:branch list`, **`onto branch` CLI TODO** | `src/laws/fibration/`                  |
| Topos / Ω predicate algebra   | ✅ library shipped, ✅ validator ported onto algebra | `src/laws/topos/`, `src/forward/context/intent-validator.ts` |

---

## 4. What this unlocks next

- ✅ **Compiler refactor onto `EffectWithLog`** (PR #115) — every step
  accumulates logs even when failing, errors propagate via `bindWithLog`
  instead of `try/catch`.
- ✅ **Validator port onto topos algebra** — `intent-validator.ts` is now
  built on `compileValidationPredicate` + `evaluatePredicate`. Three-valued
  internally; closed-world, two-valued externally; `result.verdict` exposes
  the underlying Ω. See [`MATHEMATICAL_CLAIMS.md`](../../MATHEMATICAL_CLAIMS.md)
  §3.9 for the rigor classification.
- 🟡 **Branch-aware compile** — `onto compile run --branch feature/x` walks
  the fiber, not the global graph. `computeBranchFiber` is in place; only the
  CLI wiring is missing. Then a real natural transformation `merge` can
  relate two fibers.
- 🟡 **`onto branch lift <nodeId> --to feature/x`** — turns the read-only
  `describeCartesianLift` into a proposal.
- 🟡 **`onto query` extensions** — negation in shapes (`!hasIncoming`), exact
  edge profiles, multi-shape OR queries.
- 🟡 **Prompt Generators** ([`PROMPT_GENERATORS.md`](../proposals/PROMPT_GENERATORS.md))
  — `@expand: gen_xxx` substitution in generator bodies makes Axiom 4
  operational rewriting in the generator domain. Lifts
  [`MATHEMATICAL_CLAIMS.md`](../../MATHEMATICAL_CLAIMS.md) §Axiom 4 from T3
  (metadata marker) to T2 in that domain; node-level `@expand:`
  remains metadata until separate work picks it up.

Each of these items has a one-line entry in [`docs/ROADMAP.md`](../../ROADMAP.md).

---

## 5. Reading list

- Mac Lane, *Categories for the Working Mathematician* — for limits, adjoints,
  monads, Yoneda.
- Goldblatt, *Topoi: The Categorial Analysis of Logic* — for the topos / Ω /
  internal-logic story.
- Grothendieck, *SGA 1* — for fibered categories and descent.
- Lawvere & Schanuel, *Conceptual Mathematics* — gentle entry point.
- The corresponding Ontology design notes, one per categorical concept:
  [`docs/QUERY_REPRESENTABLE.md`](QUERY_REPRESENTABLE.md),
  [`docs/EFFECT_MONAD.md`](EFFECT_MONAD.md),
  [`docs/BRANCH_FIBRATION.md`](BRANCH_FIBRATION.md),
  [`docs/RULES_TOPOS.md`](RULES_TOPOS.md).
