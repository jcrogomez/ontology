# EXTRACTOR_BAKEOFF_2026-06-10 — HYPOTHESIS (pre-registered)

> **Dated record. Written BEFORE the runs.** Selection bake-off for the
> self-ingest extractor (`semantic_parse`), prompted by the owner's request
> to use the newly published Ollama models for the 2026-06-10 self-ingest.
> Companion result file: `EXTRACTOR_BAKEOFF_2026-06-10_RESULT.md` (written
> after).

## Context

The live-graph self-ingest (docs/SELF_INGEST_RUNBOOK.md) needs an extractor.
The incumbent is `qwen2.5-coder:3b` (Phase ε arm A lineage). Three newly
published models are credible alternatives on the 8 GB machine. Per the
"don't anchor mediocre defaults" discipline, each gets an arm with this
shared pre-registered protocol instead of trusting catalog blurbs.

## Arms

| Arm | Model | Why |
|---|---|---|
| A0 (control) | `qwen2.5-coder:3b` | Incumbent; ε-calibrated lineage |
| A1 | `qwen3.5:4b` | Successor family of the incumbent |
| A2 | `lfm2.5` (8B-A1B) | Built for reliable structured output on consumer hardware; ~1B active params |
| A3 | `gemma4:e4b` | Diverse-family edge model, frontier-per-size claim |
| A4 | `qwen3.5:9b` | **Amendment 2026-06-10, added BEFORE any arm's results were read** (A0/A1 in flight, unscored): the owner flagged the 9b tag's existence; same deployable class as the 7b compile workhorse. Same metrics, same decision rule. |
| A5 | `claude-fable-5` (cold session subagents) | **Amendment 2026-06-11, added pre-unblinding** (A0/A1/A3 dispatched, scorer NOT yet run): owner's idea — frontier dispatches answered by the session's model via COLD subagents (no repo context beyond the exact pipeline prompt + file), zero marginal API cost. INFORMATIONAL arm: it does not compete for the local-extractor role (different deployment class); it measures the frontier gap and enables the governed-escalation pattern (local bulk, frontier for rejects). Caveats recorded: sampling params uncontrolled; model is fable-5 (not the pre-registered Opus ceiling); A5 output is RAW (no AST-rescue post-pass the local arms get) — recall comparisons are conservative against A5. |

> Out of local scope, recorded for honesty: `qwen3.6` (min tag 27b) exceeds
> the 8 GB machine — it is a future cloud/rented-GPU arm, not a local one.
> Separately, `qwen3.5:9b` is also the pre-registered CANDIDATE for the
> compile role (F/code_sketch vs `qwen2.5-coder:7b`) — that comparison is a
> different task and gets its own hypothesis file when run; this bake-off
> only decides extraction.

## Sample (fixed before any run)

8 files, chosen to span the perimeter's shapes — pure module, command,
runtime, schema, adapter, parser, walker state:

1. `src/core/integrity/hash.ts`
2. `src/core/errors.ts`
3. `src/commands/drift.ts`
4. `src/runtime/context/gluing.ts`
5. `src/runtime/llm/ollama/adapter.ts`
6. `src/schemas/workflow.ts`
7. `src/runtime/workflow/predicate-parser.ts`
8. `src/walker/state/shadow-status.ts`

Single rep per (arm, file), `onto ingest <file> --provider ollama
--model <arm> --dry-run --json` (no proposals written). Arms run grouped
(one model load each) to keep wall-clock honest on 8 GB.

## Metrics (in decision order)

- **M1 — extraction validity rate**: dry-run returns a parseable extraction
  with non-empty `label` AND non-empty `prompt`. Rate over 8.
- **M2 — contract recall**: |extracted provides ∩ actual exported names| /
  |actual exported names|, ground truth from `parseTypeScriptFile` (the
  deterministic AST scanner). Mean over files with ≥1 export.
- **M3 — wall-clock p50 per file** (dispatch time).

## Decision rule (pre-registered)

Winner = highest M1; ties broken by M2, then by lowest M3.
**Floor:** the winner must score M1 ≥ A0's M1 AND M1 ≥ 6/8 — otherwise the
incumbent keeps the job and the new models are recorded as not-ready for
this task. No post-hoc metric additions.

## Honest scope

n=8, single rep, dry-run — this is a SELECTION heuristic, not a fidelity
calibration. The full 221-file ingest report (and later the matrix) is the
real record of whatever model wins. Catalog claims about these models were
not assumed; only these measurements count.
