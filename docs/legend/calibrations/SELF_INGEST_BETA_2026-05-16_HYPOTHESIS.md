# Phase ε self-ingestion run β — pre-registered hypothesis

> *Pre-registered BEFORE the run starts (no peeking at the result).
> Filed for falsifiability: if the matrix below disagrees with these
> bounds, Phase ε surfaces a real boundary, not a polished number.*

**Run date (planned):** 2026-05-16
**Pipeline:** `onto ingest --static-classifier enabled` → `onto proposal apply` × 128 → `onto verify-homeomorphism --all-artifacts --matrix`
**Perimeter:** `src/runtime src/core src/commands src/schemas` (130 files; 7 static_summary deflections + 123 LLM-extracted)
**Models:** `qwen2.5-coder:3b` for both ingest AND compile-back (consistency over capability — `:14b` doesn't fit in VRAM)
**Provider:** ollama (local, $0)

## Pre-registered predictions

### Axis 1 — structural Jaccard by ingest route

| Route | Predicted mean Jaccard | Predicted range | Rationale |
|---|---:|---|---|
| `static_summary` (n=7) | **≥ 0.95** | [0.85, 1.00] | Static summaries encode structural facts (re-export count, type-only) deterministically. Compile-back from those facts should reproduce the structural shape almost exactly. A miss here means compile-back is corrupting the deterministic input. |
| `semantic_parse` (n=123) | **0.55** | [0.30, 0.75] | qwen2.5-coder:3b at code_sketch is below its calibration band (bake-off measured it for structured_extraction only). Expect ~30-40% of files to land below the Jaccard threshold (0.5 default). |

### Axis 2 — structural Jaccard by classifier shape (within semantic_parse)

| Shape | Predicted mean Jaccard | Why |
|---|---:|---|
| `executable_module` (n=59) | 0.55 | The bulk; should anchor the mean. |
| `cli_module` (n=47) | 0.60 | Boilerplate-heavy (commander wiring), pattern-matchable, should round-trip slightly better than pure runtime. |
| `schema_module` (n=10) | **highly variable; 0.30 ↔ 0.85** | The overfit class. True Zod schemas should round-trip well; zod-validator files (e.g. ingest/index.ts) will not. |
| `adapter_module` (n=6) | 0.50 | Adapters have API-specific shapes that 3b may not synthesize precisely. |
| `component_module` (n=1) | 0.40 | JSX generation is hard for 3b. |

### Axis 3 — LoC distance

| Metric | Predicted value |
|---|---|
| Mean LoC distance | 0.40 (i.e., regen is ~40% different in line count from source) |
| Files with LoC distance ≥ 0.7 (severe drift) | ~15% |
| Files with LoC distance ≤ 0.3 (small — threshold default) | ~35% |

### Axis 4 — Verdict folder counts

| Verdict | Predicted count | % |
|---|---:|---:|
| `homeomorphic` (LoC small + Jaccard similar) | ~30 | ~24% |
| `structurally_similar` (Jaccard similar, LoC large) | ~25 | ~20% |
| `loc_similar_only` (LoC small, Jaccard low) | ~15 | ~12% |
| `divergent` | ~58 | ~44% |

### Axis 5 — Cost (orthogonal, deterministic)

| Metric | Predicted value |
|---|---|
| Total compile-back tokens | ~400,000 (3000/file × 128 verify dispatches, similar to ingest) |
| Total compile-back wall-clock | ~60 min on qwen2.5-coder:3b |
| Total combined pipeline wall-clock | ~2 hr (43 min ingest + 2 min apply + ~60 min verify) |
| Spend | $0.00 |

### Axis 6 — Cartography signal (the real load-bearing prediction)

The matrix should reveal **at least one** of the following structural patterns, NOT a single percentage:

1. **Route matters more than shape.** static_summary files outperform every semantic_parse shape by Jaccard. If TRUE → confirms PR3's deflection has real fidelity value, not just cost savings.
2. **Shape matters within semantic_parse.** schema_module variance is bimodal (true-schemas vs zod-validators), distinguishable from executable_module's tighter distribution. If TRUE → motivates the schema_module predicate tightening (Plan A).
3. **Both matter; cost and fidelity are not collinear.** static_summary saves cost AND wins fidelity. semantic_parse: cli_module pays similar cost to executable_module but earns higher fidelity. If TRUE → multi-objective Pareto frontier is real.

## Falsification conditions

The hypothesis FAILS if:
- Mean semantic_parse Jaccard > 0.80 → 3b is far stronger than calibrated; verify our methodology.
- Mean semantic_parse Jaccard < 0.20 → 3b is unusable for compile-back; need to re-justify the calibration.
- static_summary Jaccard < semantic_parse Jaccard → deflection HURTS fidelity, PR3 should be reverted, not extended.
- LoC variance is flat across shapes → the classification axes carry no fidelity signal, taxonomy needs rework.

## What gets committed regardless of outcome

- This hypothesis doc (already committed).
- The resulting `SELF_INGEST_BETA_2026-05-16.md` matrix report.
- The archived `.ontology.archive-pre-self-ingest-2026-05-16/` is NOT committed (gitignored), but the current main-branch graph state is preserved that way.

## What this run is NOT measuring

- Anthropic-tier fidelity (separate run with Sonnet 4.6 to follow).
- Full Phase ε success — this is ONE provider, ONE model, ONE perimeter. The cartography matrix is more useful than the single percentage, but it's still a single cell in a higher-dim grid.
- Round-trip stability under repeated ingest-apply-verify cycles (would need a 2nd iteration).
