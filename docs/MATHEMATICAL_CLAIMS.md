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

The audit was last refreshed on **2026-06-09**: added Axiom 5 gluing's opt-in
`identify-if-equal` mode (a sheaf on the equal-signature overlap subcategory;
O2 of `docs/legend/CONTEXT_GLUING_REGIMES.md`) as a new line item, then
**promoted it T2 → T1** after pinning the sheaf gluing axiom as a characterising
law over an explicit cover with restriction maps (Path-to-T1 gate #2). Net:
**T1 13 → 14, total 30 → 31**; no other tier changed. (Recount 2026-06-09: a
clerical off-by-one in the T1/T3 headers had persisted since the first audit,
and §4.8/§4.9 were never indexed under T4; honest totals are **T1 13 / T2 6 /
T3 8 / T4 6 = 33**. Tier *movements* recorded in past refreshes are
unaffected.) The prior refresh on
**2026-06-01** ran in two passes (T1 count 8 → 13). Pass 1 (categorical
laws): Axiom 5 restriction-law pin (+ sheaf characterisation) and Axiom 6
/ §3.2 compiler functoriality. Pass 2 (load-bearing hardening): Axiom 2
(crash-atomic durable log + advisory lock — the entry was stale; code
already shipped) and §3.9 validator port (closed-world parity exhaustively
pinned). See §Axiom 2, §Axiom 5, §Axiom 6, §3.9 and §5. The prior full refresh was
**2026-05-26** against `main` after Phase ε's publishable substate. Phase β + Phase γ + Phase γ-7 + Phase δ
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
- **Code:** `src/kernel/schemas/ontology.ts` (`OntologyNode`, `OntologyEdge`, `EdgeTypeSchema` — 18 typed relations); `src/kernel/core/edges/create-edge.ts`; `src/kernel/core/nodes/create-node.ts`.
- **Tests:** edge-type creation and dedup behavior in `tests/node-link-*.test.ts`; multigraph-ness is implicit (no uniqueness on `(from, to)`).
- **Why T1:** the type vocabulary is enforced by Zod at every entry point; multiple edges *of distinct types* between the same pair are routinely created in the test fixtures and accepted, which is the literal definition of a multigraph. (Qualification: identical `(from, to, type, branch)` edges **are** deduped by `createEdge` — the multigraph property is about distinct edge types between the same pair, not unlimited duplicates.)
- **Rigor improvement:** add one test that explicitly creates two distinct typed edges between the same node pair and asserts both survive — pins the multigraph property in test form rather than letting it be implicit.

### Axiom 2 — Temporal event log

> *"Every mutation of the network is represented as an append-only event."*

- **Tier:** T1 (strictly implemented). Promoted from T2 on **2026-06-01** — the two rigor improvements the prior audit named (crash-atomic writes + advisory lock) had in fact already shipped and are test-pinned; this entry was stale.
- **Code:** `.ontology/events.jsonl`; `src/kernel/core/state/state-store.ts`; `src/kernel/schemas/ontology.ts` `OntologyEventSchema`; every mutation command (`init`, `node create`, `node link`, `proposal apply`, `compile run`, `run --persist`) appends. Durability primitives: `src/kernel/core/fs/json.ts` — `writeJson` is **crash-atomic** (serialise to `${file}.tmp.${pid}` → `fsync` the fd → `rename(2)` → `fsync` the parent dir; temp unlinked on failure so the original is never truncated), and `appendJsonl` is **durable** (`O_APPEND` single-buffer write + `fsync` before close). Advisory single-writer lock: `src/kernel/core/fs/lock.ts` (`acquireLock` / `withLock`, `O_CREAT|O_EXCL` atomic create, PID+hostname body, same-host stale-PID recovery, cross-host refusal, `--no-lock` opt-out).
- **Tests:** `tests/fs-json.test.ts` (round-trip, no `.tmp` leftover after success, **original intact + temp cleaned when rename fails**, fd hygiene over 512 appends, exactly-one-terminator JSONL); `tests/advisory-lock.test.ts` (acquire/held/idempotent-release, stale-PID recovery, cross-host refusal, corrupt-body recovery, `withLock` release-on-throw, no-steal-on-takeover, `skipLock`); plus `tests/cli-observability.test.ts`, `tests/run-persistence.test.ts`.
- **Why T1:** the characterising invariant — *the log is append-only and a crash cannot truncate or corrupt it* — is pinned: `writeJson`'s catch-path test proves the original target survives a mid-write failure with no temp residue, and `appendJsonl` always yields valid JSONL. The advisory-lock primitive is fully pinned, closing the multi-process single-writer hole the prior audit flagged.
- **Honest scope of the lock (not a gap, a precise statement):** `withLock` is wired into the long-running, multi-write commands where concurrent runs are genuinely dangerous — `compile run`, `compile run-batch`, `verify-homeomorphism`. The quick single-shot mutations (`node create` / `link`, `proposal apply`, `init`) are **not** lock-wrapped; they rely on per-write atomicity, so the worst case under a (rare, single-user) concurrent invocation is a *last-writer-wins lost update* on `state.json`, never a corrupt file. Universalising the lock across the quick mutations is a deliberate future hardening, not a correctness bug — recorded in ROADMAP.

### Axiom 3 — Abstraction poset

> *"Higher abstraction nodes constrain lower abstraction nodes. Lower nodes may refine but not mutate higher nodes."*

- **Tier:** T1 (strictly implemented) for the four refinement-family edges; T3 (useful analogy) for the broader "constrains" claim.
- **Code:** `src/kernel/graph/poset.ts`; enforcement at `src/surfaces/commands/node/link.ts`, `src/surfaces/commands/proposal/propose-link.ts`, and `src/surfaces/commands/validate.ts` (note: `src/kernel/core/edges/create-edge.ts` itself does **not** check poset direction — the check lives at the command entry points).
- **Tests:** `tests/poset.test.ts`, `tests/poset-cli.test.ts`.
- **Why split:** `refines`, `inherits_from`, `implements`, `belongs_to` direction is mechanically rejected when the source node is at a strictly higher abstraction than the target; this is a tested partial order. The broader claim that *all* abstraction constraints flow downward is rhetorical — most edge types are direction-agnostic and many "constraint" semantics (e.g., a higher node's prompt must dominate a lower node's outputs) are not enforced anywhere.
- **Rigor improvement:** either enumerate which edge types participate in the poset (already done in code, mostly absent from `MATHEMATICAL_MODEL.md`) and stop generalising, or add a `poset-violation` retroactive check on every edge type whose semantics imply a direction.

### Axiom 4 — Prompts as rewrite rules

> *"Future phases will parse prompts into ASTs. Prompt functions may expand compact intentions into subgraphs."*

- **Tier:** T3 (useful analogy) for "rewrite rule"; T2 (operationally implemented) for "AST".
- **Code:** `src/forward/prompt/parse.ts`; `src/forward/prompt/types.ts`; consumed by `src/forward/compile/compile-node.ts`.
- **Tests:** `tests/runtime/prompt/parse.test.ts`.
- **Why T3 for rewrite rule:** the AST recognises three line-anchored markers (`@requires:`, `@provides:`, `@expand:`) and emits deduplicated token lists. **No actual rewriting happens** — the markers are stripped from the body and the body is dispatched verbatim. There is no rewrite system, no production rules, no expansion of `@expand:` into a subgraph (today it is just metadata). The categorical analogy is a term-rewriting system over node bodies; what we ship is a marker parser.
- **Why T2 for AST:** the parsed structure is real — token order is preserved, duplicates collapse with first-occurrence-wins, the body is a clean string — but no module *rewrites* anything based on the AST; the AST is a contract surface for future tooling.
- **Rigor improvement:** either downgrade the language in `MATHEMATICAL_MODEL.md` ("today axiom 4 surfaces only the marker parser; rewriting is future work") or implement the missing piece — `@expand: <nodeId>` resolves to the referenced node's compiled artifact and substitutes it inline. The latter would lift this to T2 across the board.
- **Path now planned:** [`PROMPT_GENERATORS.md`](design/proposals/PROMPT_GENERATORS.md) (RFC) instantiates the missing piece in the *generator* domain — `@expand: gen_xxx` inside a `generator.body` is resolved at materialisation time against the registry, performing real substitution (with cycle detection and parameter inheritance). When that RFC ships, Axiom 4 lifts to **T2 in the generator domain** (rewriting verified by tests that the same generator + parameters produce byte-identical materialised text), while `@expand:` in `node.prompt.raw` remains T3 metadata until a separate RFC chooses to lift node-level substitution.

### Axiom 5 — Presheaf context

> *"Each node declares requires, provides, forbids and optional context. Context is local to graph neighborhoods. Future validation will attempt to glue local contexts into a globally consistent state."*

- **Tier:** T1 (strictly implemented) for the **presheaf-restriction law**; T2 (operationally implemented) characterised down to a **separated presheaf, explicitly *not* a sheaf**, for the **default** gluing operation (negative law pinned 2026-06-01); **T1 (strictly implemented) for the opt-in `identify-if-equal` gluing as a sheaf on the equal-signature overlap subcategory** — the gluing axiom is pinned as a characterising law over an explicit cover with restriction maps (promoted 2026-06-09, O2 + Path-to-T1 gate #2 — see below).
- **Code:** `src/forward/context/presheaf.ts` (`buildFragment`); `src/forward/context/gluing.ts` (`glueFragments`); `src/forward/context/assembler.ts`; `src/forward/context/intent-validator.ts` (now ported onto Ω, see §3.9).
- **Tests:** `tests/presheaf-sheaf-laws.test.ts` (Part 1 restriction law; Part 2 separated-presheaf characterisation of the default; **Part 3 the sheaf gluing axiom of `identify-if-equal` as a law — restriction map round-trip + an exhaustive characterisation sweep over all 49 ordered two-piece families (28 distinct two-piece covers) + the boundary**); `tests/context-gluing.test.ts` (default conflict + `identify-if-equal` policy: glue on equal signature, conflict on drift/missing); `tests/intent-validator.test.ts` (incl. the §3.9 parity guard `gluing_ok` ↔ `glued.ok` under both policies); `tests/semantic-linker*.test.ts`.
- **Why T1 for restriction:** `tests/presheaf-sheaf-laws.test.ts` Part 1 models the "open set" as the edge-type set deciding which neighbours `assembleContext` pulls in, and pins *F(S') ⊑ F(S)* for *S' ⊆ S* on every component of the assembled section (nodes, constraints, edges), the invariance of the parent-chain base under restriction, and idempotence/determinism of recomputation. This is the *F(S') ⊑ F(S)* law the prior audit asked for, in test form.
- **What we learned about gluing (negative result, T2):** `glueFragments` is **not a sheaf**. Part 2 of the test pins the precise shape: the **separation axiom holds** (two distinct sections providing the same key are rejected, not silently identified — provider uniqueness is enforced), **identity holds** (a self-contained fragment glues to itself), the **merge is order-independent** (a genuine presheaf-coherence law), and **incompatibility is an obstruction to gluing** (missing requirement / forbidden match / branch mismatch all block, which is what makes failure-to-glue a usable conflict-detection primitive) — but the **gluing axiom FAILS**: two local sections that *agree* on an overlap (both provide the same key) conflict rather than glue to the shared global section. So it is a **separated presheaf with provider-uniqueness**, not a sheaf / colimit. This makes §3.4's "not a colimit" disclaimer precise rather than hand-waved.
- **Why T1 for `identify-if-equal` (sheaf on the equal-signature subcategory, promoted 2026-06-09).** The opt-in policy `glueFragments(frags, { onDuplicateProvider: "identify-if-equal" })` identifies (glues) two distinct providers of the same key **iff** both carry an identical, *defined* signature (`ContextFragment.provideSignatures`); drift or a missing signature still conflicts — conservative by construction (*unknown ⇒ conflict, never a false identification*). The **sheaf gluing axiom is now pinned as a law**, not behaviour cases, on the subcategory of covers whose overlapping providers carry identical signatures: the restriction map `restrictSection` (F(U)→F(Uᵢ)) is named explicitly (the site structure that was implicit and kept this at T2), and `presheaf-sheaf-laws.test.ts` Part 3 pins **existence** (a compatible family glues), the **restriction round-trip** (the glued section restricts back to each piece, *s|_Uᵢ = sᵢ* — by construction on the support components, since `restrictSection` intersects with the piece's support; the substantive content is on `provideSignatures`), **well-definedness + reconstruction** (the glue is order-independent, and re-gluing the restrictions recovers the section; section-*uniqueness* then follows because a section is fully determined by its keys and signatures — it is a consequence, not a directly pinned law), and an **exhaustive characterisation sweep** over all 49 ordered two-piece families (28 distinct two-piece covers) on a 3-key universe (*glue ⟺ overlaps agree*; every glue round-trips; every disagreeing overlap blocked) — the §3.9-style exhaustiveness the T1 bar requires (n-piece reduces to pairwise because the implementation checks that ALL providers' signatures are equal per key, and all-equal ⟺ pairwise-equal by transitivity of string equality). The **boundary** is pinned too: drift on an overlap fails, so it is a sheaf *only* on the equal-signature subcategory, never globally.
- **Honest scope (a fidelity axis, not a law gap).** The subcategory is currently defined by the **syntactic** signature discriminator (O1), so this is the sheaf on the *syntactic*-equal-signature subcategory: two genuinely-equal capabilities with differently-*written* signatures are (safely) not identified — a *false non-match*, never a false merge. The **resolved-type discriminator** that would make the subcategory more natural is built and feasibility-pinned (`src/inverse/static/typescript-resolved.ts`, `tests/typescript-resolved.test.ts`: resolves inferred returns/consts the syntactic tier cannot; tier-tagged via `RESOLVED_SIGNATURE_PREFIX` so it never string-equals a syntactic signature) and **now wired as opt-in `onto ingest <dir> --resolved-signatures`** (2026-06-09, `tests/ingest-resolved-signatures-cli.test.ts`: a barrel re-export with no syntactic signature gains a real resolved one; default stays syntactic, no test churn). Wiring it *refines which covers are in the subcategory*; it does not change the gluing axiom, so it is a fidelity refinement, not a T1 blocker. Caveat (code review 2026-06-09): the resolved-type tier printed nominal types by NAME unqualified, so two same-named but structurally different types in different files could produce string-equal resolved signatures — a potential false identification. **Closed same day, two fixes:** type-only exports resolving to `any` emit no signature (missing ⇒ conflict, conservative), and every resolved signature now carries a content-hash suffix for the project-local nominal types it transitively references (`resolved:(c: Config) => string [Config#a1b2c3d4]`) — equal declaration text ⇒ equal hash (the legitimate identification survives), structural drift anywhere in the closure ⇒ different hash ⇒ conflict; lib/`node_modules` types stay un-hashed (globally identical by construction), and hashes cover declaration text only, never paths, so signatures are machine/checkout-deterministic. Law pinned in `tests/typescript-resolved.test.ts` (same-named-distinct ⇒ ≠, identical ⇒ =, nested-`Inner` drift caught via the closure, cycle-safe, lib-stable). The other Path-to-T1 gate — a real consumer — is **done (O3/O4)**: `onto workflow run --as-proposal` produces contracted nodes the policy reconciles.
- **Default stays a separated presheaf.** The opt-in does not change the default `glueFragments` behaviour, so the T1 restriction law and the T2 separated-presheaf characterisation above are untouched; the §3.9 closed-world parity rests on `glued.ok` ↔ `gluing_ok`, which a parity guard now pins under *both* policies. Documentation note still applies: `CONTEXT_ASSEMBLER.md` should state that the default gluing is a separated presheaf by design and the sheaf is an opt-in subcategory mode.

### Axiom 6 — Compiler functor

> *"Compilation maps intention objects and semantic relations into executable artifact objects and relations. Compilation must preserve structure."*

- **Tier:** T1 (strictly implemented). Promoted from T2 on **2026-06-01**: the artifact category is now named and the functor laws are test-pinned.
- **Code:** `src/forward/compile/compile-plan-runner.ts`; `src/kernel/graph/compile-plan.ts` (Kahn's topological sort over hard-dependency edges); `src/kernel/graph/artifact-category.ts` (the codomain category C + `verifyFunctoriality`); `src/forward/compile/compile-node.ts`.
- **Tests:** `tests/compiler-functoriality.test.ts` (identity, morphism-preservation, composition-preservation, 5 cases); `tests/compile-plan.test.ts`, `tests/compile-cli-*.test.ts`.
- **Why T1 now:** `src/kernel/graph/artifact-category.ts` names the artifact category C explicitly — objects are the emitted artifacts, morphisms are "depends-on by virtue of compile order" **read back from the plan output** (`step.dependsOn`), with composition as the transitive closure. `verifyFunctoriality` checks the three laws by comparing C against the intention poset I: identity (bijection on objects), morphism-preservation (every hard-dep edge's image is realised by the compile order), and composition-preservation (the transitive closures of I and C agree, i.e. *F(g∘f) = F(g)∘F(f)*). The composition law is checked on a chain with a **purely transitive** dependency (C↝A through B, no direct C→A edge), so it is not true-by-construction: C is built from the plan, and the composite must emerge. The check also reports `planFailed` (F undefined) for cyclic diagrams rather than claiming preservation.
- **What stays out of scope:** F is here a functor on the *dependency poset* (objects + the partial order generated by hard-dep edges). Richer artifact-side morphisms (typed relations between emitted files beyond compile order) are not modelled; the claim is precisely "F preserves the dependency-poset structure", which is what the structure-preservation axiom asserts.

### Axiom 7 — Code as compiled shadow

> *"Code is not the source of truth. Code is a generated artifact. Generated artifacts must be traceable to nodes, edges, events and hashes."*

- **Tier:** T1 (strictly implemented) for the *traceability* claim; T3 (useful analogy) for the *shadow* metaphor.
- **Code:** `src/forward/compile/artifact-writer.ts`; `src/forward/compile/post/runtime-check.ts`; events `compilation_run` carry `{ nodeId, runId, cached, artifactRelativePath, bytes }`; `src/kernel/core/runs/persist.ts` (content-addressed run records).
- **Tests:** `tests/run-persistence.test.ts`, `tests/homeomorphism-event-audit.test.ts`.
- **Why T1 for traceability:** the chain `artifact → compilation_run event → runId → run record → prompt hash → node` is real, replayable, and exercised by `onto runs verify`.
- **Why T3 for "shadow":** "shadow" is a useful metaphor (Plato), not a mathematical concept. The doc should not be embarrassed about saying so.
- **Rigor improvement:** none for traceability — already tested. Drop the "shadow" framing from the formal axiom list and keep it in narrative prose.

---

## 3. Audit by categorical concept of `CATEGORICAL_VISION.md`

### 3.1 Category & typed multigraph

- **Tier:** T1 (strictly implemented).
- **Same as axiom 1.** See above.

### 3.2 Compiler functor

- **Tier:** T1 (strictly implemented) as of 2026-06-01 — functor laws test-pinned.
- **Same as axiom 6.** See above.

### 3.3 Natural transformation

- **Tier:** T4 (aspirational).
- **Code:** none. `CATEGORICAL_VISION.md` §2.3 is honest about this — it points at the proposal system as the *future* home, not as a current implementation.
- **Why T4:** there is no `BranchMergeProposal`, no `naturalTransformation` API, no test that two functors `F_a, F_b : I → Fiber` admit a coherent family of components. The proposal system's `parentHash` re-validation is a coherence-like check on individual proposals, but it does not establish a transformation between functors.
- **Rigor improvement:** keep this as future work. When implemented, the test that pins it is: define two compile functors over a shared diagram, build a merge proposal, and assert the diagram of components commutes.

### 3.4 Limits / colimits

- **Tier:** T3 (useful analogy).
- **Code:** `src/kernel/graph/compile-plan.ts` (Kahn's algorithm); `src/forward/context/gluing.ts` (fragment merge).
- **Why T3:** Kahn's topological sort produces a deterministic linearisation of the dependency closure; the doc reads this as a colimit. It is *not* — Kahn's algorithm computes a specific topological order, not the universal cocone in a category. Nothing in the code asserts a universal property; nothing tests that the result is initial / terminal in any cone-of-extensions category. Same for `glueFragments`: it's a merge with conflict reporting, not a categorical limit.
- **Rigor improvement:** either drop the limit/colimit framing from `CATEGORICAL_VISION.md` §2.4 (the cleanest fix), or add the universal-property test (compile-plan: any other topological order factors through the canonical one). The former is cheaper and more honest.

### 3.5 Adjunction (propose ⊣ apply)

- **Tier:** T3 (useful analogy).
- **Code:** `src/kernel/core/proposals/persist.ts`.
- **Why T3:** `CATEGORICAL_VISION.md` §2.5 already labels this *intuitive only, not yet formal*. The Hom-set bijection `Hom(propose(X), Y) ≅ Hom(X, apply⁻¹(Y))` is not constructed anywhere; the proposal system has the *shape* of an adjunction (every mutation factors through a candidate, candidates can be applied or rejected) but the universal property is unproven. Same for "refine ⊣ project".
- **Rigor improvement:** either keep this clearly tagged as analogy in the doc (already done — keep doing it), or define `propose` and `apply` as functors between two named categories and check the unit/counit triangles. The latter is real categorical work; analogy is the safer default until someone needs the formality.

### 3.6 Monad — `Result`, `Effect`, `EffectWithLog`

- **Tier:** T1 (strictly implemented).
- **Code:** `src/laws/effects/result.ts`, `src/laws/effects/io.ts`, `src/laws/effects/laws.ts`, `src/laws/effects/index.ts`. Compiler integration at `src/forward/compile/compile-node.ts` (uses `bindWithLog`).
- **Tests:** `tests/runtime/effects/result.test.ts`, `tests/runtime/effects/io.test.ts` — the three monad laws (left identity, right identity, associativity) are exercised on hand-picked representatives, including `EffectWithLog` programs with non-empty logs to verify log-concatenation associativity. `tests/runtime/effects/async.test.ts` covers the async variant (done — `async.ts` is in `EFFECT_MONAD.md`'s file map).
- **Why T1:** laws verified, integration verified (`compileNode` retired its top-level `try/catch` via `bindWithLog`), and `bindWithLog` log-on-failure is tested explicitly.
- **Rigor improvement:** add property-based tests (e.g. fast-check) over `Result<number, string>` to widen the law coverage from hand-picked representatives to randomised inputs. ~~Update `EFFECT_MONAD.md` §"File map" to mention `async.ts`~~ (done — `async.ts` is in `EFFECT_MONAD.md`'s file map).

### 3.7 Representable functor / Yoneda

- **Tier:** T2 (operationally implemented).
- **Code:** `src/laws/query/representable.ts`, `src/laws/query/types.ts`; `src/surfaces/commands/query/run-query.ts`.
- **Tests:** `tests/runtime/query/representable.test.ts`.
- **Why T2:** the matcher implements "find every node whose Hom-profile is a superset of the query shape" and the empty shape `{}` matches every node (the trivial Yoneda statement, asserted in tests). What is *not* verified is the Yoneda lemma itself — *for all X, Hom(–, X) determines X up to iso*. The matcher is a sound subset of the embedding (a partial Hom-profile under-determines the node), not the embedding itself.
- **Rigor improvement:** add an "anti-Yoneda" test: construct two distinct nodes with the same complete Hom-profile and assert that the kernel rejects the second (or refuses to distinguish them). This is the inverse direction — *if the embedding is faithful, two nodes with equal Hom-profiles are equal*. Today nothing forces that; nodes are distinguished by `id`.

### 3.8 Grothendieck fibration

- **Tier:** T2 (operationally implemented) for `computeBranchFiber`; T3 (useful analogy) for `describeCartesianLift`.
- **Code:** `src/laws/fibration/branch-fiber.ts`; `src/laws/fibration/types.ts`.
- **Tests:** `tests/runtime/fibration/branch-fiber.test.ts` covers sub-graph closure, induced-subgraph, determinism, cartesian preservation, partition; `tests/runtime/fibration/fiber-by.test.ts` covers the generic projection fibration (`computeFiberBy`).
- **Why T2 for fibers:** the partition property is tested (`computeAllFibers(input).fibers.flatMap(f => f.nodes).length === input.nodes.length`), the sub-graph closure is tested. The functor `p : E → B` and the base category `B` are *implicit* (the existing event log + the existing `coordinates.branch` projection); no module names them or proves the fibration property at the level of morphisms.
- **Why T3 for cartesian lift:** `describeCartesianLift` mechanically copies every coordinate except `branch`. That is *necessary* for cartesianness but not *sufficient* — the cartesian property requires a universal property over the base morphism `f`, not just preservation of attributes. The current API describes a candidate lift; calling it cartesian is interpretation, not proof.
- **Rigor improvement:** add a test that names the base morphism explicitly (a `BranchRelabel` value) and asserts that any lift through it factors uniquely through `describeCartesianLift`'s output. This is the missing universal-property check.

### 3.9 Topos / subobject classifier

- **Tier:** T1 (strictly implemented) for the three-valued algebra **and** the validator port — closed-world parity pinned 2026-06-01.
- **Code:** `src/laws/topos/omega.ts`, `src/laws/topos/predicate.ts`, `src/laws/topos/rule-compiler.ts`. Validator port at `src/forward/context/intent-validator.ts` (uses `compileValidationPredicate`, `buildEvaluationContext`, `evaluatePredicate`).
- **Tests:** `tests/runtime/topos/omega.test.ts` (truth tables, commutativity, monotonicity wrt information refinement); `tests/runtime/topos/predicate.test.ts` (smart-constructor identities, compound evaluation); `tests/runtime/topos/closed-world-parity.test.ts` (**exhaustive** parity: `evaluatePredicate` == a hand-rolled Boolean oracle over every predicate tree up to depth 2 (plus depth-3 spot-nests) × every closed world, never `unknown`; open world genuinely yields `unknown` — 3000+ checks); `tests/runtime/topos/rule-compiler.test.ts` (closed-world parity with `glueFragments`); `tests/intent-validator.test.ts` (verdict ∈ {true, false, unknown}, six-test compatibility surface preserved).
- **Why T1 for the algebra:** truth tables exhausted, monotonicity tested, parity-with-gluing pinned by an exhaustive sweep over a small token universe.
- **Why T1 for the validator port (2026-06-01):** the last gate — the parity contract — is now pinned. `tests/runtime/topos/closed-world-parity.test.ts` proves *exhaustively* (every predicate tree up to depth 2 — plus depth-3 spot-nests — over a 3-token universe × all 2³ closed worlds, 3000+ checks; general parity follows compositionally) that under the closed-world reduction `evaluatePredicate` is byte-for-byte the same function as ordinary Boolean logic and **never** returns `unknown`. That is exactly what licenses the validator to surface a Boolean `result.ok` honestly: when the world is closed, the Ω machinery provably *is* a Boolean evaluator. The converse is pinned too — an open world genuinely yields `unknown` — so the three-valuedness is real, not a relabelled Bool. Combined with `openWorld` (shipped `c835509`, three-valued verdict exposed end-to-end through `semanticLink` / `validateIntent`), the validator port is strict.
- **Why we are **not** a topos:** `omegaImplies` is the Kleene material implication `¬a ∨ b`, not the Heyting implication of a frame Ω. We don't compute inside any presheaf topos; Ω is just a three-element set with operations. `RULES_TOPOS.md` §1 and §7 admit this directly — keep that disclaimer.
- **Rigor improvement:** ~~add a property test that `evaluatePredicate(p, ctx)` over the closed-world reduction agrees with a hand-rolled Boolean evaluator~~ **(done 2026-06-01, `closed-world-parity.test.ts`)**; ~~expose `openWorld?` on `validateIntent`~~ **(done `c835509`)**. Both gates closed → validator port T1. No further rigor work outstanding here; the only standing caveat is the honest "we are not a topos" disclaimer below (Kleene, not Heyting, implication), which is a *scope* statement, not a gap.

### 3.10 Compile adjoint (Project Legend)

- **Tier:** T2 (operationally implemented). Promoted from T4 on **2026-05-26** against the Phase ε self-ingest substate: 4-arm bake-off over the 125-node Ontology core perimeter, plus a 2-column cartography matrix (structural + behaviour) with measured per-axis honesty aggregates and a \$0 axis-orthogonal control resolving the §3.1 metric-circularity worry from Move 3α. The categorical claim is **operationally** instantiated — there is a measurable subcategory $\mathcal{C}_{\text{faithful}} \subseteq \mathcal{C}$ with finite per-axis $\varepsilon$ on the Ontology repo. It is not yet T1 because the *end-to-end* adjoint property (real-model verdict-map determinism at `temperature = 0`) is empirically unmet, even though the deterministic verdict *fold* is now test-pinned; see "Path to T1" below.
- **Code:** Forward functor $F\colon \mathcal{I} \to \mathcal{C}$ ships at `src/forward/compile/compile-node.ts` + `compile-plan-runner.ts`. The approximate left adjoint $G\colon \mathcal{C} \to \mathcal{I}$ is operational as `onto ingest <file>` (`src/surfaces/commands/ingest/index.ts`, γ-1) routing through the cross-provider dispatcher (`src/runtime/llm/dispatcher.ts`, anthropic/ollama/mock). Proposal payload carries the rich extracted intent (γ-3, `src/kernel/schemas/ontology.ts` ProposalNodeCreatePayloadSchema), so apply produces a complete node in one step. The Phase ε measurement surface is `onto verify-homeomorphism --matrix --behavior-check`; the matrix builder + the behaviour-axis checker live at `src/laws/matrix.ts` + `behavior-checker.ts` + `verify-homeomorphism.ts`.
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

  **Headline finding (Move 3α):** AST grounding contributes $\Delta = +0.355$ mean Jaccard on the same base model — a real lift, not metric circularity. The §3.1 worry that grounding artificially inflates the structural Jaccard (because grounding feeds the AST identifiers the metric measures) was resolved by Arm A0: the un-grounded run on the same 7B coder lands at 0.226, far below the grounded 0.581, so the lift is intervention-attributable. **Two honest costs, precisely stated (refined 2026-05-29).** (1) Grounding genuinely *increases over-emission*: vs the ungrounded A0 control, unexpected exports rise ~7× (`vocabGaps.totalUnexpectedExports` 16 → 116; `exportRecovery.totalHallucinated` 52 → 127). So the original "7× over-stuffing (16 → 116)" was substantively right — only the gloss "mean declarations per regen" was imprecise: 116 is a 125-node *total*, not a per-regen mean (the real per-node regen mean is ~4.7). (2) But grounding's *net* effect is dominated by a large **recall gain** — missing exports fall 500 → 211 and recall rises 0.256 → 0.700 (A0 → A), so the +75 hallucinated is far outweighed by the +288 recovered. Consequently the *residual* loss in Arm A is **recall-bound**, not precision-bound: 211 dropped > 127 over-emitted, mean recall 0.700 < precision 0.832, and the regen emits *fewer* declarations than the source in aggregate (587 vs 671). It concentrates in 22 large multi-export modules the 7B model collapses into **recoverable-but-truncated stubs** (e.g. `effects/result.ts`, `proposals/persist.ts` 746 → 71 LoC) despite the MANDATORY EXPORTS block — **0 / 125 unrecoverable** — so the next fidelity lever is extraction/prompt completeness on large modules, not curbing over-emission. Symbol-level split via `scripts/loss-report.ts` / `src/laws/loss-breakdown.ts`, cross-checked against the report's `exportRecovery`. The full reading is in [[move-3a-findings]] (`docs/legend/calibrations/CALIBRATION_LOG.md`).

- **Behaviour-axis checker v0 (2026-05-26) — second filled cartography column.** Spec at [`docs/legend/BEHAVIOUR_AXIS_CHECKER_SPEC.md`](design/inverse/BEHAVIOUR_AXIS_CHECKER_SPEC.md). The checker lives at `src/laws/behavior-checker.ts` and is invoked via the new `--behavior-check` CLI flag; per-node call-site fixtures live under `tests/behavior-fixtures/` (v0 ships ≥ 20). The axis is **orthogonal to AST grounding** by construction — grounding injects identifier names that the structural Jaccard reads; it does not change what those identifiers *do* at runtime. A behaviour-pass under grounding is therefore a signal grounding cannot manufacture, which sidesteps the §3.1 circularity worry that complicated the structural-only reading. v0's behaviour-axis verdict {pass, fail, untested} folds into `cell.behavior` and `honesty.behavior` (`pass → 1`, `fail → 0`, `untested → null`); aggregate counts surface as `byAxis.behavior` in the verify report. The unit tests in `tests/behavior-checker.test.ts` cover all four spec §6 scenarios (fixture-less → untested; identity → pass; deliberate divergence → fail; regen-load-failure → untested) and pass 20/20; the E2E smoke in `tests/behavior-checker-smoke.test.ts` exercises the runner against real source files in the project tree and passes 8/8.

- **Contract-axis checker + fill (2026-06-09) — third filled cartography column (matrix 3/5).** Checker: `src/laws/contract-checker.ts` via `--contract-check` (spec [`docs/legend/CONTRACT_AXIS_CHECKER_SPEC.md`](design/inverse/CONTRACT_AXIS_CHECKER_SPEC.md)) — declared `context.provides` (keys + O1 signatures) vs the regen's extracted exports, pure static, \$0; the violation verdict is conservative the *reverse* way from gluing (incomparable signature ⇒ never `fail`). Fill: pre-registered run (`SELF_INGEST_CONTRACT_COLUMN_2026-06-09_HYPOTHESIS.md`, committed before launch) over the archived Arm A regens via run-cache resurrection (zero sampling variance, ~5 min): **117/125 measured, pass 85 / fail 32 / unknown 8 (pass rate 0.726)**; all fails `missing_keys` (the May graph predates O1 signatures → key-presence regime, registered premise); fails concentrate in `divergent_both` (22/32) while 60/73 `divergent_loc` nodes pass — the axis discriminates and is not the structural Jaccard in disguise. Judgement triplet in `CALIBRATION_LOG.md` §contract-column. Tier-neutral for §3.10 (the matrix detail strengthens the measured-tolerance evidence; the T1 gate is unchanged — the variance N-run).

- **Verdict-map determinism — partial T2 evidence (2026-05-28), NOT a T1 claim.** The verdict map decomposes into a pure fold and a probabilistic source. The fold — `computeDistanceMetrics → classifyVerdict` (`src/laws/verify-homeomorphism.ts`) — has no LLM call, no clock, no randomness, so the per-node verdict and the whole verdict map are a deterministic, order-independent *function* of the (original, regen) pairs. `tests/verify-determinism.test.ts` pins exactly that (referential transparency across repeated calls, stable declaration ordering, and map-equality under reversed node order), which guards against our pipeline leaking nondeterminism (Set/Map iteration order, `Date`/random). This is **half** the named T1 gate; it does not pin the other half (below), so §3.10 stays T2.

- **Why T2 (not T1) today.** The structural correspondence holds by construction and the per-axis distances are measured on the Ontology repo with pre-registered falsifiers (H1' floor: Arm-must-clear-control mean Jaccard 0.30, met by A at 0.581; H3' coding-spec floor unevaluated until cloud Arm C lands; H4 Arm A beats A0 by ≥ 0.20, met by Δ = 0.355). The deterministic *fold* of the verdict map is now pinned (evidence bullet above), but the end-to-end gate — that a **real** model at `temperature = 0` reproduces the verdict map across runs — is empirically unmet: production inference is not bit-deterministic at temp 0 (server batching, fp nondeterminism), so the end-to-end property cannot be honestly asserted by a test. That gap is what keeps this at T2.

- **The right object is enriched, not Set-valued (framing clarified 2026-06-01).** Chasing a binary-determinism T1 is a category error: production LLM inference is not bit-deterministic at temperature 0 (server batching, fp nondeterminism), so $G$ is irreducibly a **probabilistic functor** and $\eta\colon \mathrm{id}_{\mathcal C} \Rightarrow F\circ G$ is a natural transformation valued in a category **enriched over probability distributions** (a Kleisli-style arrow into the Giry/distribution monad), not a function in $\mathbf{Set}$. The deterministic verdict *fold* is the $\mathbf{Set}$-level shadow that is genuinely T1 (pinned); the adjoint itself lives one level up and its rigor artefact is a *measured concentration*, not a determinism proof. Owning this is what distinguishes an honest probabilistic-categorical claim from a determinism claim that can never be met.
- **Path to T1.** Two honest routes: (a) pin end-to-end determinism against a *deterministic* provider stand-in (the `mock` adapter) — but that pins our orchestration, not the adjoint, so it is weak T1 evidence; (b) *measure* real-LLM temp-0 verdict-map variance across N runs on a fixed small repo and report the spread, converting the claim from binary to quantitative — the more meaningful upgrade. **Route (b)'s measurement core now ships** (`src/laws/verdict-variance.ts` + `tests/verdict-variance.test.ts`, 2026-06-01): a pure, test-pinned fold from N regen samples → per-node verdict distribution → agreement rate / Shannon entropy / metric-stdev, with `agreement = 1 / entropy = 0` recovering the deterministic idealisation as a limiting case (verified against identical/mock samples). What remains budget/frontier-gated is only the **generation** of the N real-LLM samples (an 8 GB local box cannot host an adequate model — see ROADMAP); the measurement method is no longer a gap. Until that run lands, the deterministic-fold evidence plus the shipped variance core are the honest extent of the pin, and §3.10 stays T2. Note: the **workflow-runtime** is also labelled Phase ζ in the post-2026-05-26 roadmap (`WORKFLOW_RUNTIME_SPEC.md`); the two threads share a Phase number because they are scope-parallel, not sequenced.

- **Deferred future work — 5th frontier arm.** A 5-arm extension adding `devstral-small-2:24b` on rented GPU (~\$5–10, A10/L4 class) was originally scoped to test H3 ("coding-specialisation transfers to a coding-specialised frontier model"). Deferred 2026-05-26 for budget; the close substate does **not** depend on it because the T4 → T2 gate was *≥ 2 filled cartography columns*, which is met. When budget permits, the 5-arm synthesis is a one-line edit to `scripts/run-3a-bakeoff-synthesis.ts` (the 3 → 4 extension in `4697e4e` is the template) and a re-render of §3.10 with the additional column.

- **First two empirical data points — predecessor calibrations (kept for completeness).**
  - **`hash.ts` single-file round-trip** (γ-2, `docs/legend/calibrations/HASH_TS_2026-05-12.md`): 5/5 functions semantically equivalent with `claude-opus-4-7`, $d \approx 1.2$ LoC, ~\$0.08, ~70s, $n = 1$.
  - **Vibe-Reasoning external Python corpus** (γ-7, `docs/legend/calibrations/VIBE_REASONING_GAMMA_7_2026-05-12.md`): ε-equivalent fraction $36\% \to 65\%$ under γ-7 invariants, `divergent_both` eliminated (4 → 0), $n = 19$ overlapping, ~\$2.28.

  Both data points are now subsumed by the Phase ε measurement on the Ontology repo (canonical $\mathcal{C}$) but retained here so the empirical-evidence chain β-2 → γ-2 → γ-7 → ε is auditable.

- **The LoC-vs-semantic gap surfaced by γ-2 — still load-bearing.** The hash.ts calibration ranks **divergent** under the §2.5 LoC distance ($d \approx 1.2 > 0.3$) but **ε-equivalent** under behaviour. Divergence is concentrated in docstring density and added branded types — semantic invariants are preserved. Phase ε's matrix design (POSITIONING.md §2) is the formalisation of this lesson: the structural Jaccard and the behaviour-axis checker are reported **separately**, not folded into a single percentage. The behaviour-axis v0 makes this concrete on the Ontology perimeter.

- **Why this is the load-bearing T2 of the project.** Every other category-theoretic claim shipped is either a single-direction functor (T1/T2) or an internal monad (T1). An **adjoint pair with measured per-axis tolerance** is qualitatively stronger; it is the standard structure category theory uses to relate two categories, and constructing one operationally is what distinguishes "rhetorical category theory in a README" from "operational category theory in a tool". γ-2 was the first concrete evidence (n = 1); Phase ε is where the claim moved from "exists for n = 1" to "exists with measured tolerance on a subcategory of the Ontology repo, against pre-registered falsifiers, with a control arm isolating the intervention effect".

---

## 4. Cross-cutting claims

### 4.1 Content-addressed run records ("hash chain")

- **Tier:** T1 (strictly implemented).
- **Code:** `src/kernel/core/integrity/hash.ts`, `src/kernel/core/runs/persist.ts`.
- **Tests:** `tests/run-persistence.test.ts` exercises the deterministic id (re-running with identical inputs hits the cache); `onto runs verify` is the audit primitive.
- **Why T1:** runs are derived from `SHA-256` over canonical JSON of `(input, model)`; verification is a recompute-and-compare; deterministic ids are tested.
- **Rigor improvement:** none required. Optional: pin "hash collision implies algorithmic break" by referencing the SHA-256 assumption explicitly in `RUN_PERSISTENCE.md`.

### 4.2 Proposal system as "rewrite rule with provenance"

- **Tier:** T2 (operationally implemented).
- **Code:** `src/kernel/core/proposals/persist.ts`; `src/surfaces/commands/proposal/*.ts`; lifecycle events `proposal_{created,applied,rejected,staled}`.
- **Tests:** extensive proposal lifecycle tests under `tests/proposal-*.test.ts`.
- **Why T2:** the lifecycle is total (`pending → applied | rejected | staled`), `parentHash` re-validation is tested, the audit chain `run → proposal → mutation event → node` is replayable. What is not pinned: the categorical reading. `PROPOSAL_SYSTEM.md` references the canon's "prompts act as rewrite rules" line, but a rewrite rule has form `LHS → RHS`; a proposal carries a candidate mutation, not a pattern-matching pair. Calling proposals "rewrite rules" is generous.
- **Rigor improvement:** drop the rewrite-rule framing from `PROPOSAL_SYSTEM.md` §1 and replace it with "typed candidate mutation with full provenance" — what the system actually delivers. The rewrite-rule framing *is* accurate elsewhere — see [`PROMPT_GENERATORS.md`](design/proposals/PROMPT_GENERATORS.md), where `@expand: gen_xxx` substitution in generator bodies is actual rewriting and lifts Axiom 4 to T2 in that domain (see §Axiom 4 above) — but proposals themselves are typed mutations, not rewrites.

### 4.3 Mock provider as "identity functor"

- **Tier:** T3 (useful analogy).
- **Code:** `src/runtime/llm/mock.ts` returns the prompt verbatim *for `task: code_sketch` only*.
- **Why T3:** the identity functor takes any object to itself and any morphism to itself. The mock provider takes a prompt to itself, but only for one task; for all other tasks it returns a `[mock:...]` echo. So "identity functor" is true on a one-task slice and false elsewhere. It's a useful framing for explaining how `npm run example:hello-world` works offline; it is not a categorical statement about the mock.
- **Rigor improvement:** in `COMPILER.md` and `MATHEMATICAL_MODEL.md`, qualify the claim explicitly: *"the mock provider acts as the identity for `task: code_sketch` — the leaf prompt becomes the artifact byte-for-byte; for other tasks the mock prefixes a marker"*. Already partially done; finish the job.

### 4.4 Append-only log "supports replay"

- **Tier:** T1 (strictly implemented). Promoted from T3 on **2026-06-09** — `onto replay` ships and the replay law is test-pinned.
- **Code:** `src/kernel/core/state/replay.ts` (`replayEvents` — the pure fold `replay(events) → state`, plus chain-integrity verification of `sequence` and `previousEventId` in the same pass); `src/surfaces/commands/replay.ts` (`onto replay`, read-only check by default, `--write` as the recovery primitive, refused when the chain itself is broken).
- **Tests:** `tests/replay-cli.test.ts` — the law `replay(history(state)) === state` over a real mutation history (init + node creates + link + proposal apply + edge remove); tamper-detection (hand-mangled `state.json` → divergence reported, `--write` repairs, law holds again); broken-chain detection (tampered `previousEventId` → violation reported, `--write` refused).
- **Honest scope of the law:** every **log-derived** field (initialized, schemaVersion, projectName, rootNodeId, activeBranch, nodeCount, edgeCount, eventCount, lastEventId) must match exactly. The two **wall-clock** fields (`createdAt`/`updatedAt`) are written from `new Date()` at write time, not from the log, and are excluded by design (replay reconstructs them from the genesis/last event timestamps on `--write`). `projectName`/`rootNodeId` ride on the genesis payload since 2026-06-09; legacy logs fall back to conventions with a warning. The canon node is counted at `system_init` (init writes it without a `node_created` event), and `nodeCount` is a sequential id counter (never decremented — matching `remove-node.ts`).
- **Rigor improvement:** none outstanding for the summary-state law. A stronger, future law would replay the *full graph* (nodes/edges files) rather than the state summary — that requires events to carry complete node/edge bodies, which `node_created` currently does not (it carries id/level/kind/prompt). Recorded as future work, not claimed.

### 4.5 Validation modes (`compare`, `propose`)

- **Tier:** T4 (aspirational).
- **Code:** none — `assembleContext` rejects any mode other than `strict` (`src/forward/context/assembler.ts:16`).
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
- **Code:** none — see [`PROJECT_LEGEND.md`](design/inverse/PROJECT_LEGEND.md) §3.
- **The claim, formally.** There exists a natural transformation $\tau\colon \mathrm{intent} \Rightarrow \mathrm{prose}$ (LLM-mediated, one call per node, cached as `node.translator`) such that the triangle

  $$\mathrm{intent} \xrightarrow{F} \mathrm{code} \xrightarrow{\sigma} \mathrm{prose}$$

  factors through $\tau$ up to $\varepsilon$ — i.e., the translator of the intent and the LLM-described code are equivalent under a paragraph-similarity metric. The economic claim attached: $\tau$ is *cheaper* than $\sigma \circ F$ because the intent is shorter than the code and the translator runs once per node lifetime rather than per inspection.
- **Path to T2:** Phase δ ships `onto node inspect <id>` + the caching schema field; report measured agreement between $\tau$ and $\sigma \circ F$ on a sample of nodes.

### 4.9 Open-Prompt protocol

- **Tier:** T4 (aspirational).
- **Code:** none — see [`PROJECT_LEGEND.md`](design/inverse/PROJECT_LEGEND.md) §4.
- **The claim, formally.** Given an organisation $O$ publishing $(\mathsf{N}_O, \sigma_O(\mathsf{N}_O), \mathsf{events}_O)$ where $\sigma_O$ is a digital signature over a Merkle root of node hashes, any third party can verify
  1. Audit-chain integrity (events form a hash-prepended chain);
  2. Intent-source consistency (every emitted artefact passes `validateIntent` against $\mathsf{N}_O$);
  3. Lineage (each `compilation_run` event references a node and a runId that re-verifies under `onto runs verify`).

  The protocol gives a third party verifiable answers about what code runs *without* exposing the code itself — a trust-transparency layer between open-source and proprietary self-attestation.
- **Path to T2:** Phase ζ ships `onto sign`, `onto verify-published`, `onto replay --against`. Out of scope for Legend v1; recorded here so the formal claim is named and tier-classified.

---

## 5. Index — claims by tier

### T1 — Strictly implemented (14)

- Axiom 1: typed directed multigraph.
- Axiom 2: crash-atomic + durable append-only event log + advisory single-writer lock (`tests/fs-json.test.ts`, `tests/advisory-lock.test.ts`; promoted 2026-06-01 — code already shipped, entry was stale).
- Axiom 3 (refinement-family edges only): poset enforcement.
- Axiom 5 (restriction law only): presheaf restriction *F(S') ⊑ F(S)* on `assembleContext` (`tests/presheaf-sheaf-laws.test.ts`, pinned 2026-06-01).
- Axiom 5 (gluing, `identify-if-equal` opt-in): **sheaf on the equal-signature overlap subcategory** — gluing axiom pinned as a characterising law over an explicit cover with restriction maps (`restrictSection`, `presheaf-sheaf-laws.test.ts` Part 3: existence + restriction round-trip + well-definedness/reconstruction (section-uniqueness follows) + exhaustive sweep over all 49 ordered two-piece families (28 distinct two-piece covers) + boundary; promoted 2026-06-09, Path-to-T1 gate #2). Subcategory currently defined by the syntactic discriminator; the resolved-type refinement is a fidelity axis, not a law gap.
- Axiom 6: compiler functor — identity / morphism / composition laws pinned via the named artifact category (`tests/compiler-functoriality.test.ts`, `src/kernel/graph/artifact-category.ts`, 2026-06-01).
- Axiom 7 (traceability): `artifact → compilation_run → runId → run record → prompt hash → node`.
- §3.1: category & typed multigraph (= axiom 1).
- §3.2: compiler functor (= axiom 6).
- §3.6: monad library + `compileNode` integration (laws + integration both tested).
- §3.9 (algebra): three-valued Ω predicate algebra (truth tables, monotonicity, parity sweep).
- §3.9 (validator port): closed-world parity == Boolean oracle, exhaustive over predicate-tree × closed-world (`tests/runtime/topos/closed-world-parity.test.ts`, pinned 2026-06-01).
- §4.1: content-addressed run records.
- §4.4: replay law — `onto replay` rebuilds the state summary from the log and `replay(history(state)) === state` holds for every log-derived field, chain integrity verified in the same fold (`src/kernel/core/state/replay.ts`, `tests/replay-cli.test.ts`; promoted T3 → T1 2026-06-09).

### T2 — Operationally implemented (6)

- Axiom 4 (AST): marker-based prompt parser (no actual rewriting).
- Axiom 5 (gluing, default): separated presheaf with provider-uniqueness — **not** a sheaf (gluing axiom fails for agreeing sections; negative law pinned 2026-06-01). Restriction half promoted to T1 above.
- §3.7: representable functor / Yoneda query (sound subset; no faithfulness test).
- §3.8 (fibers): branch fibration partition + induced subgraph (no morphism-level fibration test).
- §3.10: compile adjoint — Phase ε self-ingest, cartography matrix **3/5 measured columns** (2-column at the 2026-05-26 promotion; contract filled 2026-06-09 at \$0, pass rate 0.726), pre-registered falsifiers met. Reframed 2026-06-01 as a *probabilistic/enriched* adjoint; verdict-*fold* determinism + variance-measurement core both test-pinned (`verdict-variance.ts`); only budget-gated real-LLM N-run generation remains open. Stays T2.
- §4.2: proposal system lifecycle + provenance (categorical reading is generous).

### T3 — Useful analogy (7)

- Axiom 3 (broader "constrains"): not all edges encode poset constraints.
- Axiom 4 (rewrite rule): no actual rewriting.
- Axiom 7 (shadow metaphor): rhetorical, not categorical.
- §3.4: limit / colimit framing of compile-plan and gluing (no universal-property test).
- §3.5: propose ⊣ apply (admitted as informal in the doc itself).
- §3.8 (cartesian lift): cartesian property is interpretation, not proof.
- §4.3: mock provider as identity functor (true on one task only).

### T4 — Aspirational (6)

- §3.3: natural transformation (branch-merge — future work).
- §4.5: `compare` / `propose` validation modes — schema rejects them.
- §4.6: Visual DAG Studio — no code.
- §4.7: branch-merge as natural transformation — no code.
- §4.8: inspector triangle / translator natural transformation (planned T2 after Phase δ — see body).
- §4.9: Open-Prompt protocol (sign/verify-published/replay).

### Summary

| Tier | Count |
| --- | --- |
| T1 | 14 |
| T2 | 6 |
| T3 | 7 |
| T4 | 6 |
| **Total** | **33** |

Note: the **2026-06-01** refresh ran in two passes (starting from 29: T1 8 / T2 10 / T3 7 / T4 4). Pass 1 (categorical laws): Axiom 5's single T2 entry **split** into a restriction half (→ T1) and a gluing half (separated presheaf, stays T2) — that split is the lone +1 to the grand total (29 → 30); Axiom 6 / §3.2 compiler functoriality moved T2 → T1 (no total change). End of pass 1: T1 11, T2 8. Pass 2 (load-bearing hardening, no new line items): Axiom 2 (crash-atomic durable log + advisory lock — code already shipped, the ledger entry was stale) and §3.9 validator port (closed-world parity pinned) both moved T2 → T1. End of pass 2: **T1 13, T2 6, total 30.** The **2026-06-09** refresh (i) added one new line item — Axiom 5 gluing's opt-in `identify-if-equal` sheaf-on-subcategory mode (O2), a distinct claim about new code (`+1` to the grand total → 31), and (ii) **promoted that same item T2 → T1** once its gluing axiom was pinned as a characterising law over an explicit cover (Path-to-T1 gate #2). Net for the day: **T1 13 → 14, T2 stays 6, total 31**; no other tier changed. The §3.10 promotion note from the prior refresh follows. — the 2026-05-26 refresh adds §3.10 to the T2 index — the 2026-05-13 audit had §3.10 in the body marked T4 but did not index it under T4 below, so re-counting after the promotion lands a +1 net on T2 with no T4 decrement. The original T2 label "(8)" undercounted the body by one; canonical recount is "(10)". (Recount 2026-06-09: the running totals above carried a clerical off-by-one in the T1/T3 headers since the first audit and never indexed §4.8/§4.9 under T4; the honest totals at recount time were T1 13 / T2 6 / T3 8 / T4 6 = 33, with all recorded tier *movements* unaffected.) Later the same day, §4.4 (replay) was promoted T3 → T1 once `onto replay` shipped with the law test-pinned: **T1 13 → 14, T3 8 → 7, total stays 33.**

---

## 6. Recommended near-term rigor improvements

Listed in priority order (cheapest-with-most-leverage first). Each item is a roughly day-sized PR.

1. ✅ **Atomic writes + advisory lock on `events.jsonl` and `state.json`** — done 2026-06-01 (axiom 2 promoted T2 → T1).
2. ✅ **Presheaf-restriction test on `assembleContext`** — done 2026-06-01 (axiom 5 restriction half promoted T2 → T1).
3. **Drop rhetorical claims that overstate rigor** — edit `CATEGORICAL_VISION.md` §2.4 (limit/colimit), `PROPOSAL_SYSTEM.md` §1 (rewrite-rule), and `MATHEMATICAL_MODEL.md` axiom 4 to match what the code actually delivers. Pure prose work; closes the largest credibility risk.
4. ✅ **Replace "replayable" with "auditable" / "traceable"** — resolved 2026-06-09 the other way: a real `onto replay` now exists, so "replayable" is literal for the state summary (see §4.4).
5. ✅ **Define an artifact category for the compiler functor** and add one composition-preservation test — done 2026-06-01 (axiom 6 promoted T2 → T1; `src/kernel/graph/artifact-category.ts`, `tests/compiler-functoriality.test.ts`).
6. **Cartesian-lift universal-property test** — promotes §3.8 (cartesian lift portion) from T3 to T2.
7. **`onto branch` CLI surface** (already in roadmap) — adds a real surface to the fibration library, makes T2 claims about fibration easier to defend.
8. ✅ **`onto replay` command** — done 2026-06-09 (§4.4 promoted T3 → T1; `src/kernel/core/state/replay.ts`, `tests/replay-cli.test.ts`; `--write` is the recovery primitive).

---

## 7. How to keep this document honest

- Whenever a doc adds a new mathematical claim, add an entry here in the same PR.
- Whenever a test pinning a categorical law lands, upgrade the relevant tier here.
- Whenever a feature is removed or downgraded, downgrade the tier.
- The daily review (findings tracked in `docs/ROADMAP.md`) should reference this document by section number when reporting on rigor changes (rather than restating the audit).
