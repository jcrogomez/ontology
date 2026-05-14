# SELF_INGEST_HYPOTHESIS_2026-05-13

> *Pre-registered hypothesis for the canonical Phase ε self-ingestion
> sweep. This file is committed before the run so the frontier taxonomy
> and success criteria cannot be retro-fitted to the results.*

**Framework:** [`docs/POSITIONING.md`](../../POSITIONING.md)
**Base HEAD before pre-registration edits:** `e52a3c1`.
**Framework commit:** the commit that lands this hypothesis file and the
matching `docs/POSITIONING.md` refactor.
**Created:** 2026-05-13.
**Run status:** not yet run.
**Primary audience:** devtools. Compliance/governance is a later
expansion frame, not the pitch for this calibration.

---

## 1. Perimeter

The canonical Phase ε sweep measures Ontology against itself. The
perimeter is intentionally narrower than the full repository but broader
than the first positioning sketch.

**Included:**

- `src/runtime/`
- `src/core/`
- `src/commands/`
- `src/schemas/`

**Excluded:**

- `tests/`
- `docs/`
- `examples/`
- `node_modules/`
- `dist/`
- `.ontology/`
- generated artifacts, caches, and local worktrees

**Language filter:** `ts,tsx`.

**Expected shape:** 117 source files in the current local checkout
(`rg --files src/runtime src/core src/commands src/schemas -g '*.ts' -g
'*.tsx' | wc -l`). The official count must be re-recorded by the
Ollama/local pilot before any paid run.

**Reason for including `src/core/`:** the core layer contains the highest
value contrast in the hypothesis: pure hashing / JSON / lock helpers
should behave differently from IO-bound filesystem and state-store
boundaries. Excluding it would weaken the faithful/resistant frontier.

---

## 2. Sequencing

Phase ε runs in two passes:

1. **Ollama/local pilot.** Zero-dollar mechanical validation:
   perimeter count, proposal schema health, edge inference, report
   shape, matrix aggregation, and frontier tagging.
2. **Anthropic publishable run.** Paid measurement after the pilot
   proves the pipeline. The paid run must record provider, model,
   task, token usage, wall-clock time, and cost per file.

No paid run starts until:

- `onto ingest <perimeter> --cost-estimate` has been recorded.
- The pilot produced parseable proposals and a report skeleton.
- The expected paid spend is accepted explicitly.

---

## 3. Measurement Matrix

The report must publish all axes below. Unknown or unmeasured states are
allowed, but they must be explicit.

| Axis | States |
|---|---|
| Contract-equivalent | `pass`, `fail`, `unknown`, `not-measured` |
| Structural-equivalent | `pass`, `fail`, `partial`, `not-measured` |
| Behavior-equivalent | `pass`, `fail`, `untested`, `not-applicable` |
| Intent-equivalent | `accepted`, `rejected`, `needs-human`, `not-reviewed` |
| Literal-required | `true`, `false`, `candidate`, `unknown` |
| Cost-per-provider | `{ provider, model, task, tokens, usd, wallClockMs }` |

**Important distinction:** `Intent-equivalent: rejected` means a human
reviewer looked and rejected equivalence. `Intent-equivalent:
not-reviewed` means no human review happened. The aggregate must keep
those separate; otherwise Phase ε measures review scheduling instead of
intent fidelity.

---

## 4. Predicted Faithful Regions

These classes are expected to round-trip cleanly more often than the
repo average, especially under Contract-equivalent, Structural-equivalent,
and Behavior-equivalent axes.

| Predicted region | Expected attributes | Rationale | Representative paths |
|---|---|---|---|
| Pure transformations | `pure-transform` | Small deterministic functions have compact intent and low operational specificity | `src/core/integrity/`, pure helpers in `src/runtime/graph/` |
| Schema-driven code | `schema-driven` | Zod/type declarations preserve structure well; intent is close to surface syntax | `src/schemas/ontology.ts` |
| Algebraic law libraries | `algebraic-lawful`, `pure-transform` | Truth tables and monad laws make behaviour explicit and testable | `src/runtime/effects/`, `src/runtime/topos/` |
| Declarative validators | `declarative-validator`, `schema-driven` | Contract evaluation has explicit predicates and local inputs | `src/runtime/context/intent-validator.ts`, `src/runtime/topos/rule-compiler.ts` |
| Static graph analysis helpers | `pure-transform`, `schema-driven` where parser APIs dominate | Imports/edges are structured enough to preserve declaration shape | selected helpers under `src/runtime/static/` |

Loose prior: Behavior-equivalent fraction in `src/runtime/` should exceed
60% if fixture coverage is sufficient. Contract-equivalent should be
higher than Behavior-equivalent wherever contracts are explicit.

---

## 5. Predicted Resistant Regions

These classes are expected to need literal preservation, human review, or
manual contract refinement more often than the repo average.

| Predicted region | Expected attributes | Rationale | Representative paths |
|---|---|---|---|
| CLI parsing and command orchestration | `cli-parsing`, `operational-glue` | Correctness lives in flags, stdout/stderr shape, exit codes, and user-facing edge cases | `src/commands/` |
| IO and filesystem boundaries | `io-bound`, `operational-glue` | Behaviour depends on disk, locks, atomic writes, env, or process boundaries | `src/core/fs/`, `src/core/state/`, `src/runtime/compile/artifact-writer.ts` |
| LLM/provider adapters | `adapter-boundary`, `io-bound`, `operational-glue` | External APIs, retry semantics, model routing, and cost metadata are brittle | `src/runtime/llm/anthropic/adapter.ts`, `src/runtime/llm/ollama/adapter.ts` |
| Prompt/template-heavy code | `prompt-sensitive`, `literal-required` candidate | Semantics often live in exact wording, not only declared structure | context assembly prompts, ingest/extractor prompts |
| Walker/TUI rendering | `tui-rendering`, `operational-glue` | Layout and interaction correctness are difficult to infer from intent alone | `src/walker/` is excluded from this run, but remains a predicted resistant class for a later sweep |
| Locking/retry/cache invalidation | `operational-glue`, `io-bound` | Small timing and concurrency details matter; plausible rewrites can be wrong | `src/core/fs/lock.ts`, retry code in adapters |

Loose prior: Behavior-equivalent fraction in `src/commands/` should fall
below 50% unless tests cover the regenerated command surfaces deeply.
Structural-equivalent may still pass for commands that preserve exported
functions but alter output details.

---

## 6. Frontier Taxonomy

The frontier is multi-label. Each file receives a set of attributes, not
a single category. Reports must aggregate both individual attributes and
intersections.

Initial tag vocabulary:

- `pure-transform`
- `schema-driven`
- `algebraic-lawful`
- `declarative-validator`
- `cli-parsing`
- `io-bound`
- `adapter-boundary`
- `prompt-sensitive`
- `literal-required`
- `operational-glue`
- `tui-rendering`
- `human-authored`
- `contract-missing`
- `structural-drift`
- `behavior-drift`
- `not-reviewed`

Required intersection aggregates:

- `io-bound ∧ structural-drift`
- `io-bound ∧ behavior-drift`
- `literal-required ∧ prompt-sensitive`
- `cli-parsing ∧ behavior-drift`
- `schema-driven ∧ contract-equivalent`
- `pure-transform ∧ behavior-equivalent`
- `contract-missing ∧ not-reviewed`

The report may add intersections discovered during the run, but the
required intersections above must appear even when their count is zero.

---

## 7. Success Criteria

The run succeeds if it produces a defensible map, not if the global
faithful percentage is high.

**Validation outcomes:**

- Faithful predictions outperform resistant predictions on at least two
  measured axes.
- Cost-per-provider is present for every paid LLM call.
- The matrix keeps `rejected` separate from `not-reviewed`.
- The resistant frontier is represented as multi-label attributes with
  intersection counts.

**Discovery outcomes:**

- A predicted resistant class proves faithful.
- A predicted faithful class proves resistant.
- Cost changes the recommended provider/model choice for a class.
- Human intent review disagrees with structural or behavior metrics.

Any of those discoveries is publishable if recorded explicitly. The only
failed outcome is an ambiguous report that cannot distinguish pipeline
failure, model failure, missing review, and real intent resistance.

---

## 8. Fixture Plan

After the first Phase ε report, create `examples/legend-fixture/` as a
1:1 sanity check against this hypothesis. It should contain:

- 2 pure transformation files.
- 1 schema-driven file.
- 1 CLI parser/command file.
- 1 IO adapter/boundary file.
- 1 literal-required prompt or config file.

The deterministic fixture test should assert:

```text
ingest -> apply -> infer edges -> verify-homeomorphism -> expected matrix
```

Each fixture file must land in its predicted bucket. If one does not, the
matrix, the hypothesis, or the fixture is wrong. That failure is the path
from empirical Phase ε evidence toward a stricter reproducible claim.

---

## 9. Claim Discipline

If this run succeeds, update
[`MATHEMATICAL_CLAIMS.md`](../../MATHEMATICAL_CLAIMS.md) §3.10 only with
the limited measured claim:

> In perimeter P, at commit H, under provider/model configuration R and
> matrix M, Ontology identifies axis-relative faithful subcategories and a
> multi-label intent-resistant complement.

Do not claim a universal adjunction. Do not claim source equivalence.
Do not collapse the matrix into one score. The rigorous upgrade is from
T4 to a bounded T2 claim over the measured perimeter.

---

*Frozen before Phase ε. Results belong in
`SELF_INGEST_2026-05-XX.md`, not in this hypothesis file.*
