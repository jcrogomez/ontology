# Ontology Mathematical Model

"Ontology is a typed, temporal, directed graph enriched with a partial order of abstraction, where prompts act as rewrite rules that expand subgraphs, context is assigned locally as a presheaf over graph neighborhoods, and compilation is a structure-preserving functor from the category of intention to the category of executable artifacts."

> The seven axioms below are the *foundation*. The companion document
> [`CATEGORICAL_VISION.md`](CATEGORICAL_VISION.md) maps the four further
> categorical concepts the project now embodies — **monads, representable
> functors / Yoneda, fibrations, and a topos-style subobject classifier** —
> onto concrete modules under `src/laws/effects/`, `src/laws/query/`,
> `src/laws/fibration/`, and `src/laws/topos/` respectively.
>
> Every claim made here is also classified by rigor in
> [`MATHEMATICAL_CLAIMS.md`](../../MATHEMATICAL_CLAIMS.md) (strictly implemented /
> operationally implemented / useful analogy / aspirational). When this doc
> says *"X is a Y"*, the claims map says *how literally* you should read it.

## 1. Typed Directed Multigraph

The network is a tuple

$$G \;=\; (V,\; E,\; s,\; t,\; \tau_V,\; \tau_E)$$

with $V$ the set of nodes, $E$ the set of edges, $s, t\colon E \to V$ the source / target maps, and $\tau_V \colon V \to \mathbf{NodeKind}$, $\tau_E \colon E \to \mathbf{EdgeType}$ the typing functions over finite type-token vocabularies.

- Nodes are typed semantic objects.
- Edges are typed semantic relations.
- Multiple semantic relations may connect the same pair of nodes — for distinct $e_1, e_2 \in E$ it is permitted that $s(e_1) = s(e_2)$ and $t(e_1) = t(e_2)$ provided $\tau_E(e_1) \ne \tau_E(e_2)$ (the multigraph property). This is why Ontology is not a tree and not a flat prompt list.

## 2. Temporal Event Log

The log is a totally ordered injection

$$\mathcal{L}\;\colon\; [\,0,\, N\,) \;\hookrightarrow\; \mathbf{Event},$$

with hash-prepended chain integrity: each event carries `previousEventId` so the log forms a $\mathrm{SHA{-}256}$-anchored linked list.

- Every mutation of the network is represented as an append-only event.
- Time is not inferred from file modification timestamps; `coordinates.time` is the sequence index in $\mathcal{L}$.
- Events make audit, replay, and branching possible.

## 3. Abstraction Poset

Abstraction levels form a partial order

$$(L,\,\le_L) \;=\; \{\text{canon},\,\text{project},\,\text{target},\,\text{stack},\,\text{architecture},\,\text{domain},\,\text{workflow},\,\text{interface},\,\text{unit},\,\text{token},\,\text{artifact}\}$$

with the canonical chain `canon ≥ project ≥ … ≥ artifact`. Every node carries `coordinates.abstraction ∈ L`.

- Nodes live in a partially ordered abstraction space.
- Higher abstraction nodes constrain lower abstraction nodes.
- Lower nodes may refine but not mutate higher nodes.
- The four refinement-family edges (`refines`, `inherits_from`, `implements`, `belongs_to`) carry direction semantics consistent with this axiom: for any such edge $e$ with source $s(e)$ and target $t(e)$, we require $\mathrm{abstraction}(s(e)) \le_L \mathrm{abstraction}(t(e))$ — the edge must climb toward more abstraction. Inversions are rejected at link time and detected retroactively by `onto validate`. Other edge types remain direction-agnostic.

## 4. Prompt Rewriting

- Prompts are not inert text.
- **Implemented (Bootstrap 0.7, partial).** `parsePromptAST(raw)` recognises
  three line-anchored markers (`@requires:`, `@provides:`, `@expand:`),
  strips them from the prompt body, and emits a deduplicated `PromptAST`
  consumed by `compileNode`. See `src/forward/prompt/parse.ts`.
- **Not yet implemented:** *rewriting itself*. The AST exposes the markers
  as structured metadata, but no module yet expands `@expand: <nodeId>` by
  substituting the referenced node's compiled artifact into the body. The
  current axiom-4 surface is therefore "a structural marker contract", not
  a rewrite system. `MATHEMATICAL_CLAIMS.md` §2.4 classifies this as T2
  (operational) for the AST and T3 (analogy) for the rewrite-rule framing.
- The rewrite-rule framing remains T3 metadata today (verified
  2026-06-10). [`PROMPT_GENERATORS.md`](../proposals/PROMPT_GENERATORS.md) is the RFC
  that would lift it to T2 — for the generator domain only — and has not
  shipped.

## 5. Context Presheaf

Context is a presheaf on the graph:

$$\mathcal{P}\;\colon\; \mathbf{Graph}^{\mathrm{op}} \longrightarrow \mathbf{Set},
\qquad
\mathcal{P}(n) \;=\; \bigl(\,\mathrm{requires}(n),\; \mathrm{provides}(n),\; \mathrm{forbids}(n),\; \mathrm{optional}(n)\,\bigr).$$

The assembler collects sections over the neighborhood of the focal; `glueFragments` merges them with conflict reporting; `validateIntent` evaluates a candidate response against the glued presheaf. **Note:** this merge is *not* the colimit $\bigsqcup_n \mathcal{P}(n) / {\sim}$ — agreeing sections are rejected (`duplicate_provider`), not identified under $\sim$, so it is a *separated presheaf with provider-uniqueness*, not a sheaf/colimit (pinned 2026-06-01, `MATHEMATICAL_CLAIMS.md` §Axiom 5).

- Each node declares requires, provides, forbids and optional context.
- Context is local to graph neighborhoods.
- **Implemented.** `assembleContext` (parent path + edge neighbors),
  `glueFragments` (presheaf merge with conflict reporting), and
  `validateIntent` (now compositional over the topos predicate algebra,
  see §8.4) form the strict-mode pipeline. Edge-aware extension via
  `--include-edges` brings typed neighbors into the gluing pool. The
  structured contract is surfaced in the LLM prompt under a `Contract`
  section so the model sees what the validator will judge it against
  (post-0.9; see `docs/CONTEXT_ASSEMBLER.md`).
- **Pinned (2026-06-01):** the *presheaf restriction law* — $\mathcal{P}(n') \sqsubseteq \mathcal{P}(n)$ for $n' \subseteq n$ — is now test-pinned over `assembleContext` (`tests/presheaf-sheaf-laws.test.ts`), so this half is **T1**. `MATHEMATICAL_CLAIMS.md` §Axiom 5 carries the full entry; the gluing half stays T2 (separated presheaf, not a sheaf).
- The `compare` and `propose` modes that earlier drafts of this axiom
  promised are not implemented; the assembler rejects any mode other
  than `strict`. They remain on the roadmap.

## 6. Compiler Functor

Compilation is a functor

$$F\;\colon\; \mathcal{I} \longrightarrow \mathcal{C}$$

from the **intent category** $\mathcal{I}$ (objects: Ontology networks; morphisms: structure-preserving evolutions — `node_created`, `node_updated`, `edge_created`, `edge_updated`) to the **code category** $\mathcal{C}$ (objects: artifact files on disk; morphisms: refactors preserving module identity). The order is *derived* — the plan is computed by Kahn's algorithm over the hard-dependency edge family — not hand-coded.

Post-0.9, every compile step is the composite

$$F_n\;\colon\; n \;\xrightarrow{\text{dispatch}}\; A_n \;\xrightarrow{\text{validateIntent}}\; \Omega,$$

so the functor refuses to step forward when the candidate $A_n$ would violate the focal's contract — see `docs/COMPILER.md` for the gate.

- Compilation maps intention objects and semantic relations into executable artifact objects and relations.
- Compilation must preserve structure.
- Framework choice must come from target/stack nodes, not from hardcoded compiler assumptions.
- **Implemented (Bootstrap 0.8 + post-0.9 hardening).** `onto compile run <nodeId>` walks the topological plan and dispatches each step's prompt against the configured provider. The structure-preserving property is *derived* from the graph + Kahn's algorithm, not hand-coded.
- The mock provider acts as the **identity functor** when `task: code_sketch` — it returns the prompt verbatim. This makes mock-driven compilation a degenerate but mathematically valid case of axiom 6, and is what powers the offline `npm run example:hello-world` demo.
- **The inverse direction** $G\colon \mathcal{C} \to \mathcal{I}$ — extracting intent from existing code — is the subject of [Project Legend](../inverse/PROJECT_LEGEND.md). It tests the operational adjunction $G \dashv F$ ($G$ the left adjoint) and measures the round-trip $F \circ G \approx \mathrm{id}$ on a quantified subcategory.

## 7. Code as Compiled Shadow

For every artifact $a$ on disk, there exists a chain

$$a \;\longleftarrow\; e_{\text{compilation\_run}} \;\longleftarrow\; r_{\text{PersistedRun}} \;\longleftarrow\; h_{\text{promptHash}} \;\longleftarrow\; n_{\text{node}},$$

each arrow a stored back-reference, each hash content-addressed.

- Code is not the source of truth.
- Code is a generated artifact.
- Generated artifacts must be traceable to nodes, edges, events and hashes.
- **Implemented.** Every artifact under `.ontology/artifacts/generated/<nodeId>.<ext>` is anchored by a `compilation_run` event whose payload carries `nodeId`, `runId`, `cached`, and `artifactRelativePath`. The `runId` resolves to a content-addressed `PersistedRun` record whose `input.promptHash` ties back to the source node body. The audit chain $a \to e \to r \to h \to n$ is replayable end-to-end via `onto runs verify <runId>`.

## 8. Beyond the seven axioms — categorical extensions

Four further categorical concepts now ship as runtime libraries. They are
*additive*: they extend the model without altering axioms 1–7.

### 8.1 Monad — `src/laws/effects/`

The trio `Result<T,E>`, `Effect<T,E> = () => Result<T,E>`, and
`EffectWithLog<T,E> = () => { value: Result<T,E>; logs: LogEntry[] }` provides
a principled foundation for the compiler to thread errors and diagnostics.
All three obey the three monad laws (left identity, right identity,
associativity). `bindWithLog` concatenates logs even when the inner effect
fails.

`compileNode` runs on top of `EffectWithLog` (PR #115): the dispatch /
write / parse-validate / runtime-check pipeline is `bindWithLog`-chained
and the top-level `try/catch` is gone. The walker-side `runFromWalker` is
still on the legacy try/catch path — porting it is open follow-up work.
See [`EFFECT_MONAD.md`](EFFECT_MONAD.md).

### 8.2 Representable functor / Yoneda — `src/laws/query/`

`onto query` exposes a node's Hom-profile as a search verb. A query shape is
a partial Hom-profile (incoming / outgoing edge types, context tokens,
intrinsic coordinates); the matcher returns every node whose actual profile
is a superset. The empty shape `{}` matches every node — the trivial Yoneda
identity. See [`QUERY_REPRESENTABLE.md`](QUERY_REPRESENTABLE.md).

### 8.3 Grothendieck fibration — `src/laws/fibration/`

Branches are modelled as **fibers** over the temporal log. The functor
`p : Events × Branches → Events` "forgets the branch label". `computeBranchFiber`
returns the induced subgraph on a single branch; `describeCartesianLift`
describes the proposal that would relabel a node from one branch to another.
Read-only library; CLI surface is future work. See
[`BRANCH_FIBRATION.md`](BRANCH_FIBRATION.md).

### 8.4 Topos / subobject classifier — `src/laws/topos/`

Rules (`requires` / `provides` / `forbids`) lift into a composable predicate
algebra over a three-valued Ω = `"true" | "false" | "unknown"`. The "unknown"
value reflects partial information in a graph still under construction; the
evaluator is monotone wrt information refinement.
`intent-validator.ts` is now built on this algebra: each of its three checks
(gluing ok, candidate non-empty, FORBID phrases) compiles to a `Predicate`
and they fold via `allOf`. The high-level `IntentValidationResult` contract
is preserved; the `verdict: Omega` field exposes the underlying three-valued
result. See [`RULES_TOPOS.md`](RULES_TOPOS.md) for the algebra and
`src/forward/context/intent-validator.ts` for the port.

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
