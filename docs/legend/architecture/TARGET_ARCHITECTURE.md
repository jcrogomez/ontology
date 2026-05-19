# Ontology — Target Architecture (blueprint)

> ***Destination, not route.** This document describes what the system
> looks like at the end of Phase ε ζ, IF the 3α-3γ data warrants
> building it. It is intentionally NOT executable code, NOT default
> configuration, and NOT a list of which models to pull. It is the
> reference for what shape the production pipeline could converge to,
> so each iteration of 3α → 3γ → 3δ → 3ε is judged against the same
> destination instead of drifting into ad-hoc decisions.*

## The mother rule

```
Symbols come from deterministic tools.
Models interpret, critique, and reconstruct.
The verifier decides.
Frontier models escalate, on exception.
```

Concretely:
- `ts-morph` / the TypeScript compiler API knows what exports a file
  declares. Asking an LLM for that is asking the microscope to also
  identify the specimen.
- The LLM's job is **judgement** (what the symbols mean, what they
  refine, what they regenerate), not **enumeration**.
- The verifier (compile-back + gluing + homeomorphism distance)
  decides whether the chain produced something faithful.
- The frontier model (Opus 4.7 — see [[feedback_sota_ceiling_use_opus]])
  enters only when local + critic + repair cannot resolve, or when
  the verifier flags a high-stakes node (canon, architecture, core
  invariants).

## The role-based pipeline

```
source file
   │
   ├──► 0. AST symbol scanner                    (deterministic, ts-morph)
   │       outputs: mandatoryExports[], reExports[]
   │
   ├──► 1. semantic_parse / contract extraction  (small structured-output LLM)
   │       outputs: ExtractionResult { provides, requires, prompt, rules, ... }
   │       safety-net: if provides=[], fallback to mandatoryExports
   │
   ├──► 2. contract critic                       (reasoning-tuned LLM, on failure)
   │       outputs: critique { missing_provides, hallucinated, missing_rules }
   │
   ├──► 3. contract reducer / merger             (DETERMINISTIC, no LLM)
   │       outputs: ReducedContract { acceptedProvides, repairInstructions }
   │       set algebra over (AST_exports, LLM_provides, LLM_prompt_mentions)
   │
   ├──► 4. code_sketch / compile-back            (coding-specialized LLM)
   │       inputs: ReducedContract + system { upstream context + AST grounding }
   │       outputs: regenerated source file
   │
   ├──► 5. repair loop                           (small fast LLM, surgical)
   │       inputs: verifier diagnostic + chunk
   │       outputs: minimal edit only
   │
   ├──► 6. verify-homeomorphism                  (deterministic + LLM judges)
   │       outputs: verdict, metrics, failure modes
   │
   └──► 7. escalation                            (frontier LLM, on exception)
           triggers: local + critic disagree, verifier rejects N times,
                     node tagged canon / architecture, human-review flag
```

Each role exists because the failure modes are different. A model that
is excellent at JSON extraction may produce mediocre code. A model
that's excellent at code may not obey contract constraints. A
reducer that's deterministic catches what every model gets wrong in
the same way.

## Model-by-role candidates

These are **candidates** to evaluate, not defaults to commit. Defaults
are earned via measured wins in 3γ, not assertions in this document.

| Role | Candidate models | Why this role suits them |
|---|---|---|
| AST scanner | (no model — `ts-morph`) | Symbols are syntactic facts, not interpretive. |
| Extraction (JSON) | `granite4.1:3b` / `:8b`, `qwen3-next`, `ministral-3` | Structured-output tuning, JSON discipline, low cost. |
| Critic (reasoning) | `nemotron-cascade-2:30b`, `laguna-xs.2`, `glm-4.7-flash` | MoE with reasoning-tuned active params; catches contradictions. |
| Deterministic reducer | (no model — set algebra) | Set algebra > poetry. |
| Code sketch | `devstral-small-2:24b`, `qwen2.5-coder:7b`/`:14b`, MLX coding variants | Coding-specialised; regeneration is their habitat. |
| Repair | `granite4.1:3b`, small fast variants | Surgical edit, low cost, no creativity. |
| Frontier ceiling | **Opus 4.7** (never Sonnet — see [[feedback_sota_ceiling_use_opus]]) | The only meaningful upper-bound for capacity questions. |

## Routing in production

Production runs are NOT "one model for everything." They are NOT
"difficulty-based routing" (easy/medium/hard) either — `difficulty`
is a 1D abstraction that hides the real signal. Production routes by
**failure mode**: the type of error the file's category historically
exhibits with the candidate model.

```
                ┌─────────────────────┐
                │  AST scanner +      │
                │  structural-        │   (file kind: barrel / schema /
                │  classifier         │    executable / orchestrator / ...)
                └──────────┬──────────┘
                           │
                           ▼
                ┌─────────────────────┐
                │  failure-mode       │   (informed by 3γ-derived
                │  router             │    model × file_kind × failure_mode
                │  (deterministic)    │    tensor, refreshed by shadow runs)
                └──────────┬──────────┘
                           │
                           ▼
                ┌─────────────────────┐
                │  selected pipeline  │   (extractor + coder + repair
                │                     │    chosen for this kind's
                │                     │    failure-mode profile)
                └──────────┬──────────┘
                           │
                           ▼
                ┌─────────────────────┐
                │  verifier           │
                └──────────┬──────────┘
                           │
                           ▼
                ┌─────────────────────┐
                │  escalation         │   (frontier, only on
                │  (exception only)   │    measurable risk)
                └─────────────────────┘
```

Routing rules read like:

```
if failure_mode(file_kind, current_model) ⊇ {missing_exports}:
    use AST-grounding-more-aggressively branch
if failure_mode(file_kind, current_model) ⊇ {hallucinated_exports}:
    swap to extractor with stronger JSON discipline (Granite-class)
if failure_mode(file_kind, current_model) ⊇ {incomplete_code}:
    swap to coder with stronger codegen (Devstral-class)
if failure_mode(file_kind, current_model) ⊇ {contract_violation}:
    invoke critic + repair loop before retrying
```

Not `if difficulty == hard`. The category 'hard' encodes nothing the
router can act on; the category 'tends to drop exports' encodes a
specific intervention.

## Shadow runs (telemetry that doesn't self-confirm)

A router that learns only from its own decisions is a router that
confirms its biases. The blueprint includes **shadow runs**:

```
production decision:
  router selects model M for file F (based on current data)

shadow runs (sampled, e.g. 5-10% of files):
  also run model M' (next-best candidate) for the same F
  AND model M'' (a stretch candidate) for the same F
  these do not affect the production artifact for F,
  but their failure-mode tags feed the router's calibration tensor

effect:
  the router's tensor gets data from BOTH the chosen path AND the
  not-chosen paths, so a quietly-improving alternative model gets
  surfaced instead of staying invisible behind the current choice.

without shadow runs:
  if model M was the right pick last year and is mediocre this year
  but M' has improved, the router never finds out because M' is
  never run on real files. The system inherits last year's bias.
```

This is non-negotiable for any router that claims to be "self-
calibrating." Skip it and the calibration is a fiction.

## What this blueprint is NOT

It is not:
- a list of models to install today,
- a `ontology-config.ts` to merge today,
- a routing algorithm to implement today,
- a critique of Sonnet (Sonnet has its uses; just not as a
  capacity-ceiling test — that's Opus 4.7's job),
- a commitment to any specific failure-mode taxonomy beyond the
  v0 set in `src/runtime/legend/failure-mode-tagger.ts`. The v0
  set is grounding-focused; 3γ extends it as code-sketch-specific
  modes (typecheck_failed, invariant_loss, …) earn their place.

## What gets built in production (the bridge from blueprint to code)

In order, each step gated by the prior step's data:

```
✅ Move 1c safety net               (ingest — provides=[] fallback to AST)
✅ AST grounding at code_sketch     (compile-back — system prompt + cache)
✅ ExportRecoveryRate metric        (verify — pure set comparison)
✅ Failure-mode tagger v0           (verify — labelling pass)

🟡 3α (multi-arm, 3 models)         ← in progress
🔜 3γ (full bake-off, file-kind × model × failure-mode tensor)
🔜 3δ (ensemble with reducer)        only if 3γ rama B fires
🔜 3ε (repair loop)                  only if quirurgical errors remain
🔜 Move 4 (Opus 4.7 ceiling)
🔜 modelRouter v0 (deterministic)    sourced from the tensor
🔜 shadow-runs telemetry             enables the router's self-calibration
🔜 escalation module                  Opus-on-exception for critical files
```

Each step's data informs whether the next step earns the build cost.
A 3γ result that shows AST grounding alone solves the perimeter would
make 3δ unnecessary. A 3γ that shows the router would have to switch
models per file in a way the data doesn't support would defer the
router until more calibration runs accumulate.

## Cross-references

- [[../calibrations/SELF_INGEST_DELTA_2026-05-18_SYNTHESIS]] —
  established that prompt-side intervention is necessary but not
  sufficient at the qwen tier.
- [[../calibrations/SELF_INGEST_EPSILON_3A_2026-05-19_HYPOTHESIS]] —
  the pre-registered prediction for the 3α multi-arm run.
- Memory: `feedback_sota_ceiling_use_opus` — frontier ceiling is
  Opus 4.7, never Sonnet.
- Memory: `feedback_self_ingestion_order` — Ollama dry-run first,
  Anthropic second; only after $0 tooling pre-work ships.
- Memory: `feedback_dont_anchor_mediocre_defaults` — experiments
  with the incumbent model run with at least one credible
  alternative arm.
- Memory: `feedback_provider_catalog_trust` — official catalog
  pages are source of truth for existence; do not pile redundant
  verification.

## Closing — the architectural metaphor

A semantic customs office with lanes:

```
bicycles in the fast lane
trucks through inspection
radioactive cargo with escort
```

Ontology does not need a bigger hammer. It needs to know when to
use the needle, the chisel, the scalpel, or the orbital beam — and
to route every artifact through the right lane based on its observed
failure mode, not its perceived size.
