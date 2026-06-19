# Design docs — grouped by role in `F : Intent → Code`, `G : Code → Intent`

> This is the index for the component design docs. They are grouped not by
> *when* they were built (the old flat / by-phase layout) but by *what role
> they play in the mathematics* the whole system implements: the category
> of intent **C**, the forward functor **F**, the inverse functor **G**, the
> laws that make `F∘G ≈ id` auditable, the live runtime, and the surfaces a
> user touches. Point at any folder and you can say which part of the
> diagram it designs.
>
> For the *why* read [`../VISION.md`](../VISION.md); for open work read
> [`../ROADMAP.md`](../ROADMAP.md); for honest claim tiers read
> [`../MATHEMATICAL_CLAIMS.md`](../MATHEMATICAL_CLAIMS.md). For the concrete
> module map of `src/`, read [`ARCHITECTURE.md`](ARCHITECTURE.md).

## `kernel/` — the category **C** of intent

The objects (typed nodes) and morphisms (edges) F and G act on, plus the
append-only event log, proposals, run persistence, and the semantic index.

- [`kernel/ONTOLOGY_CANON.md`](kernel/ONTOLOGY_CANON.md) — node/edge canon.
- [`kernel/PROPOSAL_SYSTEM.md`](kernel/PROPOSAL_SYSTEM.md) — proposal/draft model.
- [`kernel/RUN_PERSISTENCE.md`](kernel/RUN_PERSISTENCE.md) — run + hash-chain persistence.
- [`kernel/SEMANTIC_INDEX.md`](kernel/SEMANTIC_INDEX.md) — the semantic index.

## `forward/` — **F : Intent → Code** (the compiler)

Walks the graph in topological order and emits artifacts, plus the context
it consumes and the prompt generators it drives.

- [`forward/COMPILER.md`](forward/COMPILER.md) — the forward functor F.
- [`forward/CONTEXT_ASSEMBLER.md`](forward/CONTEXT_ASSEMBLER.md) — presheaf context assembly.
- [`forward/MODEL_RUNTIME.md`](forward/MODEL_RUNTIME.md) — LLM dispatch / model runtime.

## `inverse/` — **G : Code → Intent** (Project Legend / extraction)

Lifts existing code back into intention: contract extraction, intent
narration, behaviour oracles, drift detection.

- [`inverse/PROJECT_LEGEND.md`](inverse/PROJECT_LEGEND.md) — the Project Legend design (G).
- [`inverse/LEGEND.md`](inverse/LEGEND.md) — Legend overview.
- [`inverse/DRIFT.md`](inverse/DRIFT.md) — drift detection.
- [`inverse/INTENT_NARRATION_SPEC.md`](inverse/INTENT_NARRATION_SPEC.md) — the WHY-as-prompt lift.
- [`inverse/CONTRACT_AXIS_CHECKER_SPEC.md`](inverse/CONTRACT_AXIS_CHECKER_SPEC.md) — contract axis.
- [`inverse/BEHAVIOUR_AXIS_CHECKER_SPEC.md`](inverse/BEHAVIOUR_AXIS_CHECKER_SPEC.md) — behaviour axis.

## `laws/` — **F∘G ≈ id** + the categorical extensions

The verified structure: the round-trip measured (lens laws, kernel of
equivalence), plus the topos / fibration / monad / representable extensions.

- [`laws/MATHEMATICAL_MODEL.md`](laws/MATHEMATICAL_MODEL.md) — the formal model.
- [`laws/CATEGORICAL_VISION.md`](laws/CATEGORICAL_VISION.md) — categorical reading.
- [`laws/CONTEXT_GLUING_REGIMES.md`](laws/CONTEXT_GLUING_REGIMES.md) — sheaf/gluing regimes.
- [`laws/RULES_TOPOS.md`](laws/RULES_TOPOS.md) — rules as a topos.
- [`laws/BRANCH_FIBRATION.md`](laws/BRANCH_FIBRATION.md) — branches as a fibration.
- [`laws/EFFECT_MONAD.md`](laws/EFFECT_MONAD.md) — effects as a monad.
- [`laws/QUERY_REPRESENTABLE.md`](laws/QUERY_REPRESENTABLE.md) — queries as representable functors.

## `runtime/` — the live engines (Phase ζ + the sync loop)

The workflow state machine and the governed intent→code loop.

- [`runtime/WORKFLOW_RUNTIME_SPEC.md`](runtime/WORKFLOW_RUNTIME_SPEC.md) — the ζ verify-refine runtime.
- [`runtime/EXECUTOR_SPEC.md`](runtime/EXECUTOR_SPEC.md) — the governed dynamic-agent loop (`onto execute`): decision policy, premise capability ladder, topological runner, child-process isolation, order-ideal sync readiness.
- [`runtime/SYNC_LOOP.md`](runtime/SYNC_LOOP.md) — the governed loop, how-to.
- [`runtime/SYNC_LOOP_SPEC.md`](runtime/SYNC_LOOP_SPEC.md) — the loop's contract + acceptance.

## `surfaces/` — what a user / agent touches

- [`surfaces/WALKER_INTERFACE.md`](surfaces/WALKER_INTERFACE.md) — the Walker TUI.

## `proposals/` — not yet built (forward-looking specs)

Design for features that do **not** ship yet — isolated here so the role
folders above describe only the current, built system. Each carries its own
status banner; check `src/` before building against any of them.

- [`proposals/OPEN_PROMPT.md`](proposals/OPEN_PROMPT.md) — signed-intent + audit-replay protocol (spec-only; the `onto mcp` read surface is its first slice).
- [`proposals/PROMPT_GENERATORS.md`](proposals/PROMPT_GENERATORS.md) — versioned prompt generators (RFC; not implemented).
- [`proposals/WAKEUP_SCANNERS.md`](proposals/WAKEUP_SCANNERS.md) — proactive scanners that open proposals (RFC; not implemented).
- [`proposals/BRANCH_MODEL.md`](proposals/BRANCH_MODEL.md) — branch materialization semantics (design note; awaiting confirmation).

---

*Dated records (calibrations, hypotheses, results, release notes) are **not**
here — they live under [`../legend/calibrations/`](../legend/calibrations)
and [`../archive/`](../archive) and are historical / immutable per the
project convention. This index covers only the living design docs.*
