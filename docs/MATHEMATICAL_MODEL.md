# Ontology Mathematical Model

"Ontology is a typed, temporal, directed graph enriched with a partial order of abstraction, where prompts act as rewrite rules that expand subgraphs, context is assigned locally as a presheaf over graph neighborhoods, and compilation is a structure-preserving functor from the category of intention to the category of executable artifacts."

> The seven axioms below are the *foundation*. The companion document
> [`CATEGORICAL_VISION.md`](CATEGORICAL_VISION.md) maps the four further
> categorical concepts the project now embodies — **monads, representable
> functors / Yoneda, fibrations, and a topos-style subobject classifier** —
> onto concrete modules under `src/runtime/effects/`, `src/runtime/query/`,
> `src/runtime/fibration/`, and `src/runtime/topos/` respectively.
>
> Every claim made here is also classified by rigor in
> [`MATHEMATICAL_CLAIMS.md`](MATHEMATICAL_CLAIMS.md) (strictly implemented /
> operationally implemented / useful analogy / aspirational). When this doc
> says *"X is a Y"*, the claims map says *how literally* you should read it.

## 1. Typed Directed Multigraph

- Nodes are typed semantic objects.
- Edges are typed semantic relations.
- Multiple semantic relations may connect the same pair of nodes.
- This is why Ontology is not a tree and not a flat prompt list.

## 2. Temporal Event Log

- Every mutation of the network is represented as an append-only event.
- Time is not inferred from file modification timestamps.
- Events make audit, replay and branching possible.

## 3. Abstraction Poset

- Nodes live in a partially ordered abstraction space.
- Canon, project, target, stack, architecture, domain, workflow, interface, unit, token and artifact are abstraction coordinates, totally ordered top → bottom.
- Higher abstraction nodes constrain lower abstraction nodes.
- Lower nodes may refine but not mutate higher nodes.
- The four refinement-family edges (`refines`, `inherits_from`, `implements`, `belongs_to`) carry direction semantics consistent with this axiom: they must climb toward more abstraction (source level ≤ target level in concreteness, i.e. source is at or below target in the poset). Inversions are rejected at link time and detected retroactively by `onto validate`. Other edge types remain direction-agnostic.

## 4. Prompt Rewriting

- Prompts are not inert text.
- **Implemented (Bootstrap 0.7, partial).** `parsePromptAST(raw)` recognises
  three line-anchored markers (`@requires:`, `@provides:`, `@expand:`),
  strips them from the prompt body, and emits a deduplicated `PromptAST`
  consumed by `compileNode`. See `src/runtime/prompt/parse.ts`.
- **Not yet implemented:** *rewriting itself*. The AST exposes the markers
  as structured metadata, but no module yet expands `@expand: <nodeId>` by
  substituting the referenced node's compiled artifact into the body. The
  current axiom-4 surface is therefore "a structural marker contract", not
  a rewrite system. `MATHEMATICAL_CLAIMS.md` §2.4 classifies this as T2
  (operational) for the AST and T3 (analogy) for the rewrite-rule framing.

## 5. Context Presheaf

- Each node declares requires, provides, forbids and optional context.
- Context is local to graph neighborhoods.
- **Implemented.** `assembleContext` (parent path + edge neighbors),
  `glueFragments` (presheaf merge with conflict reporting), and
  `validateIntent` (now compositional over the topos predicate algebra,
  see §8.4) form the strict-mode pipeline. Edge-aware extension via
  `--include-edges` brings typed neighbors into the gluing pool.
- **Not yet pinned:** the *presheaf restriction law* — `F(N') ⊂ F(N)` for
  `N' ⊂ N`. The structure is presheaf-shaped operationally; the law has
  no test. `MATHEMATICAL_CLAIMS.md` §2.5 classifies this as T2.
- The `compare` and `propose` modes that earlier drafts of this axiom
  promised are not implemented; the assembler rejects any mode other
  than `strict`. They remain on the roadmap.

## 6. Compiler Functor

- Compilation maps intention objects and semantic relations into executable artifact objects and relations.
- Compilation must preserve structure.
- Framework choice must come from target/stack nodes, not from hardcoded compiler assumptions.
- **Implemented (Bootstrap 0.8).** `onto compile run <nodeId>` walks the topological plan computed by `computeCompilePlan` and dispatches each step's prompt against the configured provider. The order is *derived* from the graph (hard-dependency edges + Kahn's algorithm), not hand-coded; that is the structure-preserving property. See `docs/COMPILER.md` for the full implementation.
- The mock provider acts as the **identity functor** when `task: code_sketch` — it returns the prompt verbatim. This makes mock-driven compilation a degenerate but mathematically valid case of axiom 6, and is what powers the offline `npm run example:hello-world` demo.

## 7. Code as Compiled Shadow

- Code is not the source of truth.
- Code is a generated artifact.
- Generated artifacts must be traceable to nodes, edges, events and hashes.
- **Implemented.** Every artifact under `.ontology/artifacts/generated/<nodeId>.<ext>` is anchored by a `compilation_run` event whose payload carries `nodeId`, `runId`, `cached`, and `artifactRelativePath`. The `runId` resolves to a content-addressed `PersistedRun` record whose `input.promptHash` ties back to the source node body. The audit chain `artifact → event → run → prompt hash → node` is replayable end-to-end.

## 8. Beyond the seven axioms — categorical extensions

Four further categorical concepts now ship as runtime libraries. They are
*additive*: they extend the model without altering axioms 1–7.

### 8.1 Monad — `src/runtime/effects/`

The trio `Result<T,E>`, `Effect<T,E> = () => Result<T,E>`, and
`EffectWithLog<T,E> = () => { value: Result<T,E>; logs: LogEntry[] }` provides
a principled foundation for the compiler to thread errors and diagnostics.
All three obey the three monad laws (left identity, right identity,
associativity). `bindWithLog` concatenates logs even when the inner effect
fails.

The compiler does *not* yet use the library — that integration is the next
milestone. See [`EFFECT_MONAD.md`](EFFECT_MONAD.md).

### 8.2 Representable functor / Yoneda — `src/runtime/query/`

`onto query` exposes a node's Hom-profile as a search verb. A query shape is
a partial Hom-profile (incoming / outgoing edge types, context tokens,
intrinsic coordinates); the matcher returns every node whose actual profile
is a superset. The empty shape `{}` matches every node — the trivial Yoneda
identity. See [`QUERY_REPRESENTABLE.md`](QUERY_REPRESENTABLE.md).

### 8.3 Grothendieck fibration — `src/runtime/fibration/`

Branches are modelled as **fibers** over the temporal log. The functor
`p : Events × Branches → Events` "forgets the branch label". `computeBranchFiber`
returns the induced subgraph on a single branch; `describeCartesianLift`
describes the proposal that would relabel a node from one branch to another.
Read-only library; CLI surface is future work. See
[`BRANCH_FIBRATION.md`](BRANCH_FIBRATION.md).

### 8.4 Topos / subobject classifier — `src/runtime/topos/`

Rules (`requires` / `provides` / `forbids`) lift into a composable predicate
algebra over a three-valued Ω = `"true" | "false" | "unknown"`. The "unknown"
value reflects partial information in a graph still under construction; the
evaluator is monotone wrt information refinement.
`intent-validator.ts` is now built on this algebra: each of its three checks
(gluing ok, candidate non-empty, FORBID phrases) compiles to a `Predicate`
and they fold via `allOf`. The high-level `IntentValidationResult` contract
is preserved; the `verdict: Omega` field exposes the underlying three-valued
result. See [`RULES_TOPOS.md`](RULES_TOPOS.md) for the algebra and
`src/runtime/context/intent-validator.ts` for the port.

We are *not* a topos in the strict sense: `omegaImplies` is the Kleene
material implication `¬a ∨ b`, not the Heyting implication of a frame Ω.
`MATHEMATICAL_CLAIMS.md` §3.9 spells out which parts of this story are T1
(the algebra), which are T2 (the validator port), and what would be needed
to lift either further.

```text
┌─────────────────────────────────────────────┐
│                  CANON                      │
│   typed temporal graph + abstraction poset  │
└─────────────────────┬───────────────────────┘
                      │ constrains
                      ▼
┌─────────────────────────────────────────────┐
│                 NODES                       │
│ prompts, inputs, rules, models, processors  │
└─────────────────────┬───────────────────────┘
                      │ connected by
                      ▼
┌─────────────────────────────────────────────┐
│                 EDGES                       │
│ typed semantic relations                    │
└─────────────────────┬───────────────────────┘
                      │ audited by
                      ▼
┌─────────────────────────────────────────────┐
│                EVENTS                       │
│ append-only temporal log                    │
└─────────────────────┬───────────────────────┘
                      │ validated through
                      ▼
┌─────────────────────────────────────────────┐
│              VALIDATION                     │
│ schema + hash + topology + registry checks  │
└─────────────────────┬───────────────────────┘
                      │ future
                      ▼
┌─────────────────────────────────────────────┐
│              COMPILATION                    │
│ functor from intention to artifacts         │
└─────────────────────────────────────────────┘
```
