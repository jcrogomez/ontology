# Mathematical Claims — Audit & Map

> *Confidence comes from saying clearly what is formal and what is inspiration.*

This document is the **load-bearing rigor ledger** of the project. Every
mathematical claim made elsewhere in the docs (`ONTOLOGY_CANON.md`,
`MATHEMATICAL_MODEL.md`, `CATEGORICAL_VISION.md`, the topic RFCs, the
`README.md`, the `docs/RULES_TOPOS.md` / `docs/EFFECT_MONAD.md` /
`docs/BRANCH_FIBRATION.md` / `docs/QUERY_REPRESENTABLE.md` notes) is
classified here into one of four tiers, with a citation to the source
file (and, when applicable, the test file that pins the claim) and one
concrete suggestion for tightening it.

If a doc says *"X is a Y"* (where Y is a categorical concept), the claim
must appear here, classified honestly. If a doc *suggests* the analogy
without claiming the formal correspondence, it should still appear
here under tier T2 or T3.

The audit was last refreshed on **2026-05-26** against `main` after
Phase ε's publishable substate. Phase β + Phase γ + Phase γ-7 + Phase δ
shipped earlier; Phase ε self-ingest landed a 4-arm bake-off on the
~125-file Ontology core perimeter (Arms A grounded, A0 ablation
control, B granite hardware-vetoed, C-local starcoder contract-
violating) plus a behaviour-axis checker v0 that lifted the
cartography matrix from 1/5 → 2/5 measured columns (structural +
behaviour). §3.10 moves T4 → T2 against the recalibrated falsifiers
in `docs/legend/calibrations/SELF_INGEST_EPSILON_3A_2026-05-19_HYPOTHESIS.md`;
the originally-planned 5th frontier arm (`devstral-small-2:24b` on
rented GPU) is deferred for budget and is recorded below as future
work, not as a missing leg. Cross-provider per-task routing
(γ, `f80163d`) makes the LlmTask vocabulary load-bearing — different
tasks dispatch to different models, which was the categorical claim
behind the routing tier. Whenever code or docs change, this map
should be re-verified.

---

## 1. The four tiers

| Tier | Name | What it means |
| --- | --- | --- |
| **T1** | **Strictly implemented** | Code matches the formal definition, *and* tests verify a characterising property (a law, a parity contract, an invariant). The categorical name is load-bearing: removing it would obscure the design. |
| **T2** | **Operationally implemented** | Code does the thing, and the structural correspondence holds by construction, but no test pins a categorical law. The categorical name is accurate but unverified. |
| **T3** | **Useful analogy** | The categorical name labels a real intuition that helps reason about the design, but the implementation does not pretend to instantiate the formal definition. The doc should explicitly call this out. |
| **T4** | **Aspirational** | The categorical name appears in the docs but no code implements it (or only a placeholder exists). Roadmap material; not yet a claim about the codebase. |

Movement between tiers is always cheap (downgrade aspirational → analogy → operational → strict). Movement *upward* requires either a new test (T2 → T1) or a new module (T4 → anything).

---

## 2. Audit by axiom of `MATHEMATICAL_MODEL.md`

### Axiom 1 — Typed directed multigraph

> *"Nodes are typed semantic objects. Edges are typed semantic relations. Multiple semantic relations may connect the same pair of nodes."*

- **Tier:** T1 (strictly implemented).
- **Code:** `src/schemas/ontology.ts` (`OntologyNode`, `OntologyEdge`, `EdgeTypeSchema` — 18 typed relations); `src/core/edges/create-edge.ts`; `src/core/nodes/create-node.ts`.
- **Tests:** edge-type creation and dedup behavior in `tests/node-link-*.test.ts`; multigraph-ness is implicit (no uniqueness on `(from, to)`).
- **Why T1:** the type vocabulary is enforced by Zod at every entry point; multiple edges between the same pair are routinely created in the test fixtures and accepted without dedup, which is the literal definition of a multigraph.
- **Rigor improvement:** add one test that explicitly creates two distinct typed edges between the same node pair and asserts both survive — pins the multigraph property in test form rather than letting it be implicit.

### Axiom 2 — Temporal event log

> *"Every mutation of the network is represented as an append-only event."*

- **Tier:** T2 (operationally implemented).
- **Code:** `.ontology/events.jsonl`; `src/core/state/state-store.ts`; `src/schemas/ontology.ts` `OntologyEventSchema`; every mutation command (`init`, `node create`, `node link`, `proposal apply`, `compile run`, `run --persist`) appends.
- **Tests:** `tests/cli-observability.test.ts`, `tests/run-persistence.test.ts`.
- **Why T2 not T1:** the file is *operationally* append-only — no command rewinds or rewrites — but `writeJson` (`src/core/fs/json.ts:15`) is a direct `fs.writeFileSync`, so a SIGKILL or out-of-disk mid-write can leave a truncated file. The "append-only" contract holds in the happy path, not under crashes. The single-writer assumption (CLI single-shot) is also unverified — concurrent processes are not lock-protected.
- **Rigor improvement:** atomic write-to-temp + rename + `fsync`, plus an advisory lock under `.ontology/.lock`. This moves the claim from operational to strict.

### Axiom 3 — Abstraction poset

> *"Higher abstraction nodes constrain lower abstraction nodes. Lower nodes may refine but not mutate higher nodes."*

- **Tier:** T1 (strictly implemented) for the four refinement-family edges; T3 (useful analogy) for the broader "constrains" claim.
- **Code:** `src/runtime/graph/poset.ts`; enforcement at `src/core/edges/create-edge.ts` and `src/commands/validate.ts`.
- **Tests:** `tests/node-link-poset.test.ts`, `tests/runtime/graph/poset.test.ts`.
- **Why split:** `refines`, `inherits_from`, `implements`, `belongs_to` direction is mechanically rejected when the source node is at a strictly higher abstraction than the target; this is a tested partial order. The broader claim that *all* abstraction constraints flow downward is rhetorical — most edge types are direction-agnostic and many "constraint" semantics (e.g., a higher node's prompt must dominate a lower node's outputs) are not enforced anywhere.
- **Rigor improvement:** either enumerate which edge types participate in the poset (already done in code, mostly absent from `MATHEMATICAL_MODEL.md`) and stop generalising, or add a `poset-violation` retroactive check on every edge type whose semantics imply a direction.

### Axiom 4 — Prompts as rewrite rules

> *"Future phases will parse prompts into ASTs. Prompt functions may expand compact intentions into subgraphs."*

- **Tier:** T3 (useful analogy) for "rewrite rule"; T2 (operationally implemented) for "AST".
- **Code:** `src/runtime/prompt/parse.ts`; `src/runtime/prompt/types.ts`; consumed by `src/runtime/compile/compile-node.ts`.
- **Tests:** `tests/runtime/prompt/parse.test.ts`.
- **Why T3 for rewrite rule:** the AST recognises three line-anchored markers (`@requires:`, `@provides:`, `@expand:`) and emits deduplicated token lists. **No actual rewriting happens** — the markers are stripped from the body and the body is dispatched verbatim. There is no rewrite system, no production rules, no expansion of `@expand:` into a subgraph (today it is just metadata). The categorical analogy is a term-rewriting system over node bodies; what we ship is a marker parser.
- **Why T2 for AST:** the parsed structure is real — token order is preserved, duplicates collapse with first-occurrence-wins, the body is a clean string — but no module *rewrites* anything based on the AST; the AST is a contract surface for future tooling.
- **Rigor improvement:** either downgrade the language in `MATHEMATICAL_MODEL.md` ("today axiom 4 surfaces only the marker parser; rewriting is future work") or implement the missing piece — `@expand: <nodeId>` resolves to the referenced node's compiled artifact and substitutes it inline. The latter would lift this to T2 across the board.
- **Path now planned:** [`PROMPT_GENERATORS.md`](PROMPT_GENERATORS.md) (RFC) instantiates the missing piece in the *generator* domain — `@expand: gen_xxx` inside a `generator.body` is resolved at materialisation time against the registry, performing real substitution (with cycle detection and parameter inheritance). When that RFC ships, Axiom 4 lifts to **T2 in the generator domain** (rewriting verified by tests that the same generator + parameters produce byte-identical materialised text), while `@expand:` in `node.prompt.raw` remains T3 metadata until a separate RFC chooses to lift node-level substitution.

### Axiom 5 — Presheaf context

> *"Each node declares requires, provides, forbids and optional context. Context is local to graph neighborhoods. Future validation will attempt to glue local contexts into a globally consistent state."*

- **Tier:** T2 (operationally implemented).
- **Code:** `src/runtime/context/presheaf.ts` (`buildFragment`); `src/runtime/context/gluing.ts` (`glueFragments`); `src/runtime/context/assembler.ts`; `src/runtime/context/intent-validator.ts` (now ported onto Ω, see §3.9).
- **Tests:** `tests/intent-validator.test.ts`, `tests/semantic-linker*.test.ts`.
- **Why T2:** the fragments-and-gluing structure is real and used everywhere validation runs. What is *not* verified is the presheaf-restriction law: the doc says context is "local to graph neighborhoods" but we never assert *F(U) ↪ F(V) for V ⊂ U* — i.e., that restricting a node's context to a smaller neighborhood agrees with the same node's context computed against that smaller neighborhood directly. The gluing is a coproduct-with-coherence-checks rather than a colimit in any topos.
- **Rigor improvement:** add a presheaf-restriction test: build a focal context against neighborhood `N`, then build it again against `N' ⊂ N`, and assert the second is a substructure of the first. That pins the *F(N') ⊂ F(N)* law and converts this to T1.

### Axiom 6 — Compiler functor

> *"Compilation maps intention objects and semantic relations into executable artifact objects and relations. Compilation must preserve structure."*

- **Tier:** T2 (operationally implemented).
- **Code:** `src/runtime/compile/compile-plan-runner.ts`; `src/runtime/graph/compile-plan.ts` (Kahn's topological sort over hard-dependency edges); `src/runtime/compile/compile-node.ts`.
- **Tests:** `tests/runtime/graph/compile-plan.test.ts`, `tests/cli-compile-*.test.ts`.
- **Why T2:** the structure-preserving claim is true *operationally* — the compile order is derived from the graph and not hand-coded — but functoriality (F(g ∘ f) = F(g) ∘ F(f)) is not asserted in any test. We have one functor candidate (`F : intentions → artifacts`) but morphisms in the artifact category aren't even named: artifacts produced by `compileNode` don't carry typed edges between themselves, only filesystem paths. So we have an **object map**, not a functor in the strict categorical sense.
- **Rigor improvement:** define an artifact category explicitly (artifacts as objects, "depends-on by virtue of compile order" as morphisms) and add a test that asserts `F` preserves at least one composition: compiling A → B → C produces artifacts `a`, `b`, `c` whose dependency edges in the artifact category mirror the hard-dependency edges in the intention category. That brings this to T1.

### Axiom 7 — Code as compiled shadow

> *"Code is not the source of truth. Code is a generated artifact. Generated artifacts must be traceable to nodes, edges, events and hashes."*

- **Tier:** T1 (strictly implemented) for the *traceability* claim; T3 (useful analogy) for the *shadow* metaphor.
- **Code:** `src/runtime/compile/artifact-writer.ts`; `src/runtime/compile/post/runtime-check.ts`; events `compilation_run` carry `{ nodeId, runId, cached, artifactRelativePath, bytes }`; `src/core/runs/persist.ts` (content-addressed run records).
- **Tests:** `tests/cli-compile-audit*.test.ts`, `tests/run-persistence.test.ts`.
- **Why T1 for traceability:** the chain `artifact → compilation_run event → runId → run record → prompt hash → node` is real, replayable, and exercised by `onto runs verify`.
- **Why T3 for "shadow":** "shadow" is a useful metaphor (Plato), not a mathematical concept. The doc should not be embarrassed about saying so.
- **Rigor improvement:** none for traceability — already tested. Drop the "shadow" framing from the formal axiom list and keep it in narrative prose.

---

## 3. Audit by categorical concept of `CATEGORICAL_VISION.md`

### 3.1 Category & typed multigraph

- **Tier:** T1 (strictly implemented).
- **Same as axiom 1.** See above.

### 3.2 Compiler functor

- **Tier:** T2 (operationally implemented).
- **Same as axiom 6.** See above.

### 3.3 Natural transformation

- **Tier:** T4 (aspirational).
- **Code:** none. `CATEGORICAL_VISION.md` §2.3 is honest about this — it points at the proposal system as the *future* home, not as a current implementation.
- **Why T4:** there is no `BranchMergeProposal`, no `naturalTransformation` API, no test that two functors `F_a, F_b : I → Fiber` admit a coherent family of components. The proposal system's `parentHash` re-validation is a coherence-like check on individual proposals, but it does not establish a transformation between functors.
- **Rigor improvement:** keep this as future work. When implemented, the test that pins it is: define two compile functors over a shared diagram, build a merge proposal, and assert the diagram of components commutes.

### 3.4 Limits / colimits

- **Tier:** T3 (useful analogy).
- **Code:** `src/runtime/graph/compile-plan.ts` (Kahn's algorithm); `src/runtime/context/gluing.ts` (fragment merge).
- **Why T3:** Kahn's topological sort produces a deterministic linearisation of the dependency closure; the doc reads this as a colimit. It is *not* — Kahn's algorithm computes a specific topological order, not the universal cocone in a category. Nothing in the code asserts a universal property; nothing tests that the result is initial / terminal in any cone-of-extensions category. Same for `glueFragments`: it's a merge with conflict reporting, not a categorical limit.
- **Rigor improvement:** either drop the limit/colimit framing from `CATEGORICAL_VISION.md` §2.4 (the cleanest fix), or add the universal-property test (compile-plan: any other topological order factors through the canonical one). The former is cheaper and more honest.

### 3.5 Adjunction (propose ⊣ apply)

- **Tier:** T3 (useful analogy).
- **Code:** `src/core/proposals/persist.ts`.
- **Why T3:** `CATEGORICAL_VISION.md` §2.5 already labels this *intuitive only, not yet formal*. The Hom-set bijection `Hom(propose(X), Y) ≅ Hom(X, apply⁻¹(Y))` is not constructed anywhere; the proposal system has the *shape* of an adjunction (every mutation factors through a candidate, candidates can be applied or rejected) but the universal property is unproven. Same for "refine ⊣ project".
- **Rigor improvement:** either keep this clearly tagged as analogy in the doc (already done — keep doing it), or define `propose` and `apply` as functors between two named categories and check the unit/counit triangles. The latter is real categorical work; analogy is the safer default until someone needs the formality.

### 3.6 Monad — `Result`, `Effect`, `EffectWithLog`

- **Tier:** T1 (strictly implemented).
- **Code:** `src/runtime/effects/result.ts`, `src/runtime/effects/io.ts`, `src/runtime/effects/laws.ts`, `src/runtime/effects/index.ts`. Compiler integration at `src/runtime/compile/compile-node.ts` (uses `bindWithLog`).
- **Tests:** `tests/runtime/effects/result.test.ts`, `tests/runtime/effects/io.test.ts` — the three monad laws (left identity, right identity, associativity) are exercised on hand-picked representatives, including `EffectWithLog` programs with non-empty logs to verify log-concatenation associativity. `tests/runtime/effects/async.test.ts` covers the async variant (which is **shipped but undocumented in `EFFECT_MONAD.md`**'s file map — see §5).
- **Why T1:** laws verified, integration verified (`compileNode` retired its top-level `try/catch` via `bindWithLog`), and `bindWithLog` log-on-failure is tested explicitly.
- **Rigor improvement:** add property-based tests (e.g. fast-check) over `Result<number, string>` to widen the law coverage from hand-picked representatives to randomised inputs. Update `EFFECT_MONAD.md` §"File map" to mention `async.ts`.

### 3.7 Representable functor / Yoneda

- **Tier:** T2 (operationally implemented).
- **Code:** `src/runtime/query/representable.ts`, `src/runtime/query/types.ts`; `src/commands/query/run-query.ts`.
- **Tests:** `tests/runtime/query/representable.test.ts`.
- **Why T2:** the matcher implements "find every node whose Hom-profile is a superset of the query shape" and the empty shape `{}` matches every node (the trivial Yoneda statement, asserted in tests). What is *not* verified is the Yoneda lemma itself — *for all X, Hom(–, X) determines X up to iso*. The matcher is a sound subset of the embedding (a partial Hom-profile under-determines the node), not the embedding itself.
- **Rigor improvement:** add an "anti-Yoneda" test: construct two distinct nodes with the same complete Hom-profile and assert that the kernel rejects the second (or refuses to distinguish them). This is the inverse direction — *if the embedding is faithful, two nodes with equal Hom-profiles are equal*. Today nothing forces that; nodes are distinguished by `id`.

### 3.8 Grothendieck fibration

- **Tier:** T2 (operationally implemented) for `computeBranchFiber`; T3 (useful analogy) for `describeCartesianLift`.
- **Code:** `src/runtime/fibration/branch-fiber.ts`; `src/runtime/fibration/types.ts`.
- **Tests:** `tests/runtime/fibration/branch-fiber.test.ts` covers sub-graph closure, induced-subgraph, determinism, cartesian preservation, partition.
- **Why T2 for fibers:** the partition property is tested (`computeAllFibers(input).fibers.flatMap(f => f.nodes).length === input.nodes.length`), the sub-graph closure is tested. The functor `p : E → B` and the base category `B` are *implicit* (the existing event log + the existing `coordinates.branch` projection); no module names them or proves the fibration property at the level of morphisms.
- **Why T3 for cartesian lift:** `describeCartesianLift` mechanically copies every coordinate except `branch`. That is *necessary* for cartesianness but not *sufficient* — the cartesian property requires a universal property over the base morphism `f`, not just preservation of attributes. The current API describes a candidate lift; calling it cartesian is interpretation, not proof.
- **Rigor improvement:** add a test that names the base morphism explicitly (a `BranchRelabel` value) and asserts that any lift through it factors uniquely through `describeCartesianLift`'s output. This is the missing universal-property check.

### 3.9 Topos / subobject classifier

- **Tier:** T1 (strictly implemented) for the three-valued algebra; T2 (operationally implemented) for the validator port.
- **Code:** `src/runtime/topos/omega.ts`, `src/runtime/topos/predicate.ts`, `src/runtime/topos/rule-compiler.ts`. Validator port at `src/runtime/context/intent-validator.ts` (uses `compileValidationPredicate`, `buildEvaluationContext`, `evaluatePredicate`).
- **Tests:** `tests/runtime/topos/omega.test.ts` (truth tables, commutativity, monotonicity wrt information refinement); `tests/runtime/topos/predicate.test.ts` (smart-constructor identities, compound evaluation); `tests/runtime/topos/rule-compiler.test.ts` (closed-world parity with `glueFragments`); `tests/intent-validator.test.ts` (verdict ∈ {true, false, unknown}, six-test compatibility surface preserved).
- **Why T1 for the algebra:** truth tables exhausted, monotonicity tested, parity-with-gluing pinned by an exhaustive sweep over a small token universe.
- **Why T2 for the validator port:** the validator is now compositional and three-valued internally, but the externally-observable behaviour is closed-world (every synthetic token is classified by `buildEvaluationContext`). The Ω verdict is exposed via `result.verdict`, but the high-level `result.ok` collapses to Boolean. We *can* see "unknown" via the lower-level helpers; we don't yet *use* it from any caller.
- **Why we are **not** a topos:** `omegaImplies` is the Kleene material implication `¬a ∨ b`, not the Heyting implication of a frame Ω. We don't compute inside any presheaf topos; Ω is just a three-element set with operations. `RULES_TOPOS.md` §1 and §7 admit this directly — keep that disclaimer.
- **Rigor improvement:** add a property test that `evaluatePredicate(p, ctx)` over the closed-world reduction agrees with a hand-rolled Boolean evaluator for the same `p` (parity contract for the validator's domain, not just for `compileNodeRules`). And, when a real caller materialises that wants three-valued verdicts, expose an `openWorld?: boolean` flag on `validateIntent` rather than only via the lower-level helpers — that uplifts the validator port to T1. **Update 2026-05-11:** `openWorld` shipped at commit `c835509`; the validator now exposes the three-valued verdict end-to-end through `semanticLink` and `validateIntent`. The validator port is on a T1 path; only the closed-world parity property test remains.

### 3.10 Compile adjoint (Project Legend)

- **Tier:** T2 (operationally implemented). Promoted from T4 on **2026-05-26** against the Phase ε self-ingest substate: 4-arm bake-off over the 125-node Ontology core perimeter, plus a 2-column cartography matrix (structural + behaviour) with measured per-axis honesty aggregates and a $0 axis-orthogonal control resolving the §3.1 metric-circularity worry from Move 3α. The categorical claim is **operationally** instantiated — there is a measurable subcategory $\mathcal{C}_{\text{faithful}} \subseteq \mathcal{C}$ with finite per-axis $\varepsilon$ on the Ontology repo. It is not yet T1 because no test pins the adjoint property (e.g. determinism of the verdict map at `temperature = 0`); that is the named T1 path below.
- **Code:** Forward functor $F\colon \mathcal{I} \to \mathcal{C}$ ships at `src/runtime/compile/compile-node.ts` + `compile-plan-runner.ts`. The approximate left adjoint $G\colon \mathcal{C} \to \mathcal{I}$ is operational as `onto ingest <file>` (`src/commands/ingest/index.ts`, γ-1) routing through the cross-provider dispatcher (`src/runtime/llm/dispatcher.ts`, anthropic/ollama/mock). Proposal payload carries the rich extracted intent (γ-3, `src/schemas/ontology.ts` ProposalNodeCreatePayloadSchema), so apply produces a complete node in one step. The Phase ε measurement surface is `onto verify-homeomorphism --matrix --behavior-check`; the matrix builder + the behaviour-axis checker live at `src/runtime/legend/matrix.ts` + `behavior-checker.ts` + `verify-homeomorphism.ts`.
- **The claim, formally.** There exists a probabilistic functor $G$ and a natural transformation $\eta\colon \mathrm{id}_{\mathcal{C}} \Rightarrow F \circ G$ such that for a measurable subcategory $\mathcal{C}_{\text{faithful}} \subseteq \mathcal{C}$,

  $$d_{\text{axis}}\bigl(c,\, F(G(c))\bigr) < \varepsilon_{\text{axis}} \quad \forall c \in \mathcal{C}_{\text{faithful}}^{(\text{axis})},$$

  where each axis $\in$ {structural, behaviour, contract, intent, literal-required, cost} has its own distance $d_{\text{axis}}$ and tolerance $\varepsilon_{\text{axis}}$, per POSITIONING.md §2. The complement $\mathcal{C}_{\text{resistant}}$ is the intent-resistant subcategory: code carrying irreducible implementation detail (escape-hatched via `node.literal`) or code whose intent does not compress.
- **Phase ε measurement — Ontology self-ingest, 125-node core perimeter (canonical evidence).** Pre-registered hypothesis: `docs/legend/calibrations/SELF_INGEST_EPSILON_3A_2026-05-19_HYPOTHESIS.md` (recalibrated against Arm A0 control on 2026-05-24 per the H1' / H3' addenda). Four arms shipped against the same perimeter; arm reports live under `docs/legend/calibrations/SELF_INGEST_EPSILON_3A_2026-05-19_ARM_*.md` with the cross-arm synthesis in `..._SYNTHESIS.md`:

  | Arm | Model | mean Jaccard | structural honesty | unrecoverable |
  |---|---|---:|---:|---:|
  | **A** (grounded) | `qwen2.5-coder:7b` + `--ast-grounding` | **0.581** | **0.496** | 0 / 125 |
  | **A0** (ablation control, no grounding) | `qwen2.5-coder:7b` | 0.226 | 0.332 | 0 / 125 |
  | B | `granite4.1:8b` | hardware-vetoed | — | 124 / 125 |
  | C-local | `starcoder2:7b` | contract-violating | — | 67 / 125 |

  **Headline finding (Move 3α):** AST grounding contributes $\Delta = +0.355$ mean Jaccard on the same base model — a real lift, not metric circularity. The §3.1 worry that grounding artificially inflates the structural Jaccard (because grounding feeds the AST identifiers the metric measures) was resolved by Arm A0: the un-grounded run on the same 7B coder lands at 0.226, far below the grounded 0.581, so the lift is intervention-attributable. The honest cost of grounding: a 7× export over-stuffing (16 → 116 mean declarations per regen) — the matrix's behaviour axis and the export-recovery aggregate both surface this so a downstream consumer is not mislead by the structural number alone. The full reading is in [[move-3a-findings]] (`docs/legend/calibrations/CALIBRATION_LOG.md`).

- **Behaviour-axis checker v0 (2026-05-26) — second filled cartography column.** Spec at [`docs/legend/BEHAVIOUR_AXIS_CHECKER_SPEC.md`](legend/BEHAVIOUR_AXIS_CHECKER_SPEC.md). The checker lives at `src/runtime/legend/behavior-checker.ts` and is invoked via the new `--behavior-check` CLI flag; per-node call-site fixtures live under `tests/behavior-fixtures/` (v0 ships ≥ 20). The axis is **orthogonal to AST grounding** by construction — grounding injects identifier names that the structural Jaccard reads; it does not change what those identifiers *do* at runtime. A behaviour-pass under grounding is therefore a signal grounding cannot manufacture, which sidesteps the §3.1 circularity worry that complicated the structural-only reading. v0's behaviour-axis verdict {pass, fail, untested} folds into `cell.behavior` and `honesty.behavior` (`pass → 1`, `fail → 0`, `untested → null`); aggregate counts surface as `byAxis.behavior` in the verify report. The unit tests in `tests/behavior-checker.test.ts` cover all four spec §6 scenarios (fixture-less → untested; identity → pass; deliberate divergence → fail; regen-load-failure → untested) and pass 20/20; the E2E smoke in `tests/behavior-checker-smoke.test.ts` exercises the runner against real source files in the project tree and passes 8/8.

- **Why T2 (not T1) today.** The structural correspondence holds by construction and the per-axis distances are measured on the Ontology repo with pre-registered falsifiers (H1' floor: Arm-must-clear-control mean Jaccard 0.30, met by A at 0.581; H3' coding-spec floor unevaluated until cloud Arm C lands; H4 Arm A beats A0 by ≥ 0.20, met by Δ = 0.355). No test pins the adjoint *property* (e.g. verdict-map determinism at `temperature = 0`), which is the standard T2 → T1 gate; see "Path to T1" below.

- **Path to T1.** Phase ζ (next chapter) — a property test that, for a small fixed test repo, `verify-homeomorphism` returns the same verdict map deterministically across runs at `temperature = 0`. The non-determinism of $F$ (LLM sampling) means we cannot pin every artifact byte-equal; the verdict map per node *is* deterministic at temperature zero and that is what gets pinned. Note: the **workflow-runtime** is also labelled Phase ζ in the post-2026-05-26 roadmap (see `WORKFLOW_RUNTIME_SPEC.md` once authored); the two threads share a Phase number because they are scope-parallel, not sequenced.

- **Deferred future work — 5th frontier arm.** A 5-arm extension adding `devstral-small-2:24b` on rented GPU (~$5–10, A10/L4 class) was originally scoped to test H3 ("coding-specialisation transfers to a coding-specialised frontier model"). Deferred 2026-05-26 for budget; the close substate does **not** depend on it because the T4 → T2 gate was *≥ 2 filled cartography columns*, which is met. When budget permits, the 5-arm synthesis is a one-line edit to `scripts/run-3a-bakeoff-synthesis.ts` (the 3 → 4 extension in `4697e4e` is the template) and a re-render of §3.10 with the additional column.

- **First two empirical data points — predecessor calibrations (kept for completeness).**
  - **`hash.ts` single-file round-trip** (γ-2, `docs/legend/calibrations/HASH_TS_2026-05-12.md`): 5/5 functions semantically equivalent with `claude-opus-4-7`, $d \approx 1.2$ LoC, ~$0.08, ~70s, $n = 1$.
  - **Vibe-Reasoning external Python corpus** (γ-7, `docs/legend/calibrations/VIBE_REASONING_GAMMA_7_2026-05-12.md`): ε-equivalent fraction $36\% \to 65\%$ under γ-7 invariants, `divergent_both` eliminated (4 → 0), $n = 19$ overlapping, ~$2.28.

  Both data points are now subsumed by the Phase ε measurement on the Ontology repo (canonical $\mathcal{C}$) but retained here so the empirical-evidence chain β-2 → γ-2 → γ-7 → ε is auditable.

- **The LoC-vs-semantic gap surfaced by γ-2 — still load-bearing.** The hash.ts calibration ranks **divergent** under the §2.5 LoC distance ($d \approx 1.2 > 0.3$) but **ε-equivalent** under behaviour. Divergence is concentrated in docstring density and added branded types — semantic invariants are preserved. Phase ε's matrix design (POSITIONING.md §2) is the formalisation of this lesson: the structural Jaccard and the behaviour-axis checker are reported **separately**, not folded into a single percentage. The behaviour-axis v0 makes this concrete on the Ontology perimeter.

- **Why this is the load-bearing T2 of the project.** Every other category-theoretic claim shipped is either a single-direction functor (T1/T2) or an internal monad (T1). An **adjoint pair with measured per-axis tolerance** is qualitatively stronger; it is the standard structure category theory uses to relate two categories, and constructing one operationally is what distinguishes "rhetorical category theory in a README" from "operational category theory in a tool". γ-2 was the first concrete evidence (n = 1); Phase ε is where the claim moved from "exists for n = 1" to "exists with measured tolerance on a subcategory of the Ontology repo, against pre-registered falsifiers, with a control arm isolating the intervention effect".

---

## 4. Cross-cutting claims

### 4.1 Content-addressed run records ("hash chain")

- **Tier:** T1 (strictly implemented).
- **Code:** `src/core/integrity/hash.ts`, `src/core/runs/persist.ts`.
- **Tests:** `tests/run-persistence.test.ts` exercises the deterministic id (re-running with identical inputs hits the cache); `onto runs verify` is the audit primitive.
- **Why T1:** runs are derived from `SHA-256` over canonical JSON of `(input, model)`; verification is a recompute-and-compare; deterministic ids are tested.
- **Rigor improvement:** none required. Optional: pin "hash collision implies algorithmic break" by referencing the SHA-256 assumption explicitly in `RUN_PERSISTENCE.md`.

### 4.2 Proposal system as "rewrite rule with provenance"

- **Tier:** T2 (operationally implemented).
- **Code:** `src/core/proposals/persist.ts`; `src/commands/proposal/*.ts`; lifecycle events `proposal_{created,applied,rejected,staled}`.
- **Tests:** extensive proposal lifecycle tests under `tests/proposal-*.test.ts`.
- **Why T2:** the lifecycle is total (`pending → applied | rejected | staled`), `parentHash` re-validation is tested, the audit chain `run → proposal → mutation event → node` is replayable. What is not pinned: the categorical reading. `PROPOSAL_SYSTEM.md` references the canon's "prompts act as rewrite rules" line, but a rewrite rule has form `LHS → RHS`; a proposal carries a candidate mutation, not a pattern-matching pair. Calling proposals "rewrite rules" is generous.
- **Rigor improvement:** drop the rewrite-rule framing from `PROPOSAL_SYSTEM.md` §1 and replace it with "typed candidate mutation with full provenance" — what the system actually delivers. The rewrite-rule framing *is* accurate elsewhere — see [`PROMPT_GENERATORS.md`](PROMPT_GENERATORS.md), where `@expand: gen_xxx` substitution in generator bodies is actual rewriting and lifts Axiom 4 to T2 in that domain (see §Axiom 4 above) — but proposals themselves are typed mutations, not rewrites.

### 4.3 Mock provider as "identity functor"

- **Tier:** T3 (useful analogy).
- **Code:** `src/runtime/llm/mock.ts` returns the prompt verbatim *for `task: code_sketch` only*.
- **Why T3:** the identity functor takes any object to itself and any morphism to itself. The mock provider takes a prompt to itself, but only for one task; for all other tasks it returns a `[mock:...]` echo. So "identity functor" is true on a one-task slice and false elsewhere. It's a useful framing for explaining how `npm run example:hello-world` works offline; it is not a categorical statement about the mock.
- **Rigor improvement:** in `COMPILER.md` and `MATHEMATICAL_MODEL.md`, qualify the claim explicitly: *"the mock provider acts as the identity for `task: code_sketch` — the leaf prompt becomes the artifact byte-for-byte; for other tasks the mock prefixes a marker"*. Already partially done; finish the job.

### 4.4 Append-only log "supports replay"

- **Tier:** T3 (useful analogy).
- **Code:** events.jsonl is read by `onto events tail`, `onto runs show`, `onto inspect`; no command actually replays the log to reconstruct state.
- **Why T3:** *Replay* in the strict sense means a function `replay(events) → state` such that `replay(history(state)) === state`. We have `history(state)` (the event log is appended on every mutation), but we do not have `replay`. State is loaded from `state.json`, not reconstructed from events.
- **Rigor improvement:** either add `onto replay` (a one-shot rebuild of `state.json` from `events.jsonl`) and assert `replay(currentEvents) === currentState` in tests — that would lift this to T1 — or stop saying "replayable" in docs and say "auditable" / "traceable" instead.

### 4.5 Validation modes (`compare`, `propose`)

- **Tier:** T4 (aspirational).
- **Code:** none — `assembleContext` rejects any mode other than `strict` (`src/runtime/context/assembler.ts:16`).
- **Why T4:** documented in `CONTEXT_ASSEMBLER.md` and `MATHEMATICAL_MODEL.md` but not implemented.
- **Rigor improvement:** keep them in `CONTEXT_ASSEMBLER.md` §"Future Extensions" only; remove them from anywhere they look like current capability.

### 4.6 Visual DAG Studio

- **Tier:** T4 (aspirational).
- **Code:** none.
- **Rigor improvement:** keep it in `ROADMAP.md` only.

### 4.7 Branch-merge as natural transformation

- **Tier:** T4 (aspirational).
- **Code:** none — only the read-only `describeCartesianLift` exists.
- **Rigor improvement:** keep it in `BRANCH_FIBRATION.md` §Future Work and `CATEGORICAL_VISION.md` §2.3 only; do not advertise it as "shipped".

### 4.8 Inspector triangle (translator natural transformation)

- **Tier:** T4 (aspirational), planned T2 after Phase δ of Project Legend.
- **Code:** none — see [`PROJECT_LEGEND.md`](PROJECT_LEGEND.md) §3.
- **The claim, formally.** There exists a natural transformation $\tau\colon \mathrm{intent} \Rightarrow \mathrm{prose}$ (LLM-mediated, one call per node, cached as `node.translator`) such that the triangle

  $$\mathrm{intent} \xrightarrow{F} \mathrm{code} \xrightarrow{\sigma} \mathrm{prose}$$

  factors through $\tau$ up to $\varepsilon$ — i.e., the translator of the intent and the LLM-described code are equivalent under a paragraph-similarity metric. The economic claim attached: $\tau$ is *cheaper* than $\sigma \circ F$ because the intent is shorter than the code and the translator runs once per node lifetime rather than per inspection.
- **Path to T2:** Phase δ ships `onto node inspect <id>` + the caching schema field; report measured agreement between $\tau$ and $\sigma \circ F$ on a sample of nodes.

### 4.9 Open-Prompt protocol

- **Tier:** T4 (aspirational).
- **Code:** none — see [`PROJECT_LEGEND.md`](PROJECT_LEGEND.md) §4.
- **The claim, formally.** Given an organisation $O$ publishing $(\mathsf{N}_O, \sigma_O(\mathsf{N}_O), \mathsf{events}_O)$ where $\sigma_O$ is a digital signature over a Merkle root of node hashes, any third party can verify
  1. Audit-chain integrity (events form a hash-prepended chain);
  2. Intent-source consistency (every emitted artefact passes `validateIntent` against $\mathsf{N}_O$);
  3. Lineage (each `compilation_run` event references a node and a runId that re-verifies under `onto runs verify`).

  The protocol gives a third party verifiable answers about what code runs *without* exposing the code itself — a trust-transparency layer between open-source and proprietary self-attestation.
- **Path to T2:** Phase ζ ships `onto sign`, `onto verify-published`, `onto replay --against`. Out of scope for Legend v1; recorded here so the formal claim is named and tier-classified.

---

## 5. Index — claims by tier

### T1 — Strictly implemented (8)

- Axiom 1: typed directed multigraph.
- Axiom 3 (refinement-family edges only): poset enforcement.
- Axiom 7 (traceability): `artifact → compilation_run → runId → run record → prompt hash → node`.
- §3.1: category & typed multigraph (= axiom 1).
- §3.6: monad library + `compileNode` integration (laws + integration both tested).
- §3.9 (algebra only): three-valued Ω predicate algebra (truth tables, monotonicity, parity sweep).
- §4.1: content-addressed run records.

### T2 — Operationally implemented (10)

- Axiom 2: append-only log (operational; not crash-atomic).
- Axiom 4 (AST): marker-based prompt parser (no actual rewriting).
- Axiom 5: presheaf context + gluing (no restriction-law test).
- Axiom 6: compiler functor (object map; no functoriality test).
- §3.2: compiler functor (= axiom 6).
- §3.7: representable functor / Yoneda query (sound subset; no faithfulness test).
- §3.8 (fibers): branch fibration partition + induced subgraph (no morphism-level fibration test).
- §3.9 (validator port): three-valued internally, two-valued externally; lower-level helpers expose unknown.
- §3.10: compile adjoint — Phase ε self-ingest, 2-column cartography matrix, pre-registered falsifiers met (no verdict-map determinism test yet).
- §4.2: proposal system lifecycle + provenance (categorical reading is generous).

### T3 — Useful analogy (7)

- Axiom 3 (broader "constrains"): not all edges encode poset constraints.
- Axiom 4 (rewrite rule): no actual rewriting.
- Axiom 7 (shadow metaphor): rhetorical, not categorical.
- §3.4: limit / colimit framing of compile-plan and gluing (no universal-property test).
- §3.5: propose ⊣ apply (admitted as informal in the doc itself).
- §3.8 (cartesian lift): cartesian property is interpretation, not proof.
- §4.3: mock provider as identity functor (true on one task only).
- §4.4: append-only log "replayable" (auditable, not replayable).

### T4 — Aspirational (4)

- §3.3: natural transformation (branch-merge — future work).
- §4.5: `compare` / `propose` validation modes — schema rejects them.
- §4.6: Visual DAG Studio — no code.
- §4.7: branch-merge as natural transformation — no code.

### Summary

| Tier | Count |
| --- | --- |
| T1 | 8 |
| T2 | 10 |
| T3 | 7 |
| T4 | 4 |
| **Total** | **29** |

Note: the 2026-05-26 refresh adds §3.10 to the T2 index — the 2026-05-13 audit had §3.10 in the body marked T4 but did not index it under T4 below, so re-counting after the promotion lands a +1 net on T2 with no T4 decrement. The original T2 label "(8)" undercounted the body by one; canonical recount is "(10)".

---

## 6. Recommended near-term rigor improvements

Listed in priority order (cheapest-with-most-leverage first). Each item is a roughly day-sized PR.

1. **Atomic writes + advisory lock on `events.jsonl` and `state.json`** — promotes axiom 2 from T2 to T1 and closes the highest-impact crash-safety gap.
2. **Presheaf-restriction test on `assembleContext`** — promotes axiom 5 from T2 to T1.
3. **Drop rhetorical claims that overstate rigor** — edit `CATEGORICAL_VISION.md` §2.4 (limit/colimit), `PROPOSAL_SYSTEM.md` §1 (rewrite-rule), and `MATHEMATICAL_MODEL.md` axiom 4 to match what the code actually delivers. Pure prose work; closes the largest credibility risk.
4. **Replace "replayable" with "auditable" / "traceable"** project-wide except where a real `onto replay` exists. Trivial sed-style edit; closes §4.4.
5. **Define an artifact category for the compiler functor** and add one composition-preservation test — promotes axiom 6 from T2 to T1.
6. **Cartesian-lift universal-property test** — promotes §3.8 (cartesian lift portion) from T3 to T2.
7. **`onto branch` CLI surface** (already in roadmap) — adds a real surface to the fibration library, makes T2 claims about fibration easier to defend.
8. **`onto replay` command** — would promote §4.4 from T3 to T1 *and* give a useful tool. Higher cost than the others.

---

## 7. How to keep this document honest

- Whenever a doc adds a new mathematical claim, add an entry here in the same PR.
- Whenever a test pinning a categorical law lands, upgrade the relevant tier here.
- Whenever a feature is removed or downgraded, downgrade the tier.
- The daily review (findings tracked in `docs/ROADMAP.md`) should reference this document by section number when reporting on rigor changes (rather than restating the audit).
