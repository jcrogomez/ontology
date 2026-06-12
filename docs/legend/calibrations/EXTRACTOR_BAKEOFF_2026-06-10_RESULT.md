# EXTRACTOR_BAKEOFF_2026-06-10 — RESULT

> **Dated record (runs executed 2026-06-10 → 2026-06-11).** Companion to
> `EXTRACTOR_BAKEOFF_2026-06-10_HYPOTHESIS.md` (pre-registered, with two
> dated pre-unblinding amendments: A4, A5). Decision applied exactly as
> registered; no metrics were added or reweighed after unblinding.

## Results

8-file fixed sample; M1 = extraction validity, M2 = mean contract recall vs
the deterministic AST ground truth, M3 = p50 wall-clock per file.

| Arm | Model | M1 | M2 | M3 p50 | Resolution |
|---|---|---|---|---|---|
| A0 (control) | `qwen2.5-coder:3b` | **8/8** | 0.776 | **34s** | **WINNER — local extractor role** |
| A1 | `qwen3.5:4b` | 6/8 | 0.734 | 359s | Loses on M1; thinking mode makes it ~10× slower |
| A2 | `lfm2.5` | — | — | — | NOT RUN: requires Ollama > 0.23.4 (HTTP 412) |
| A3 | `gemma4:e4b` | 7/8 | 0.875 | 229s | Best local recall, but fails the M1 floor and is ~7× slower |
| A4 | `qwen3.5:9b` | — | — | — | NOT DEPLOYABLE: exhausted the 8 GB machine twice; second attempt froze the system into an overnight reboot |
| A5 (informational) | `claude-fable-5` (cold session subagents) | **8/8** | **1.000** | 35s* | Frontier gap measured — perfect recall on RAW output (no AST-rescue pass), zero marginal API cost |

\* A5's M3 is subagent wall-clock; not load-comparable with local arms (does
not occupy the machine), reported for completeness.

## Decision (per the pre-registered rule)

**`qwen2.5-coder:3b` keeps the local extractor job.** Highest M1; no
challenger met the floor (M1 ≥ control AND ≥ 6/8 — A3's 7/8 < control's
8/8). `registry.ts` semantic_parse routing is unchanged. The catalog-fresh
models did not beat the calibrated incumbent under the registered rule —
exactly the outcome pre-registration exists to protect against narrative.

## Findings beyond the decision

1. **The frontier gap is now a number:** 0.776 → 1.000 mean contract recall
   (+0.224), at equal validity, via the owner's zero-marginal-API-cost
   mechanism (cold session subagents answering the exact pipeline prompt).
   Conservative: A5 was scored RAW while local arms get the AST-rescue
   post-pass.
2. **Deployability dominates catalog quality at 8 GB:** qwen3.5's thinking
   mode costs ~10× wall-clock at 4b and crashes the machine at 9b; gemma4
   e4b runs (9.6 GB weights) but at 7× the incumbent's latency.
3. **Governed escalation is the practical synthesis:** local incumbent for
   the bulk, frontier subagents for the files the local extractor gets
   wrong/rejected. Measured basis for the pattern now exists.

## Operational incidents (part of the record)

- The qwen3.5:9b arm froze/crashed the 8 GB machine; the overnight reboot
  wiped /tmp, losing the first complete A0/A1/A3 runs (~1.5h local compute,
  re-run 2026-06-11 from repo-scratch storage). Lesson codified: run
  artifacts live in `.ontology.scratch-*/`, never /tmp.
- lfm2.5 remains the ζ-verifier candidate pending an Ollama runtime
  upgrade (do not upgrade mid-pipeline).
