# MVP — the human-gated spec-repair regeneration loop

Status: **proposal / MVP definition (2026-07-23), not built.** Decisions in §2
were made explicitly by the project owner; do not silently revisit them.
Companions: [`FORK_AND_DIFF.md`](FORK_AND_DIFF.md) (the counterfactual
mechanism this consumes), [`LADDER_ECONOMICS.md`](LADDER_ECONOMICS.md) (the
economics instrumentation),
[`../runtime/EXECUTOR_SPEC.md`](../runtime/EXECUTOR_SPEC.md) (the governed
loop), [`../../legend/calibrations/EXTRACTION_CAPACITY_CLASSIFIER_PREREG_2026-07-21.md`](../../legend/calibrations/EXTRACTION_CAPACITY_CLASSIFIER_PREREG_2026-07-21.md)
(E3 — shares corpus and currency).

## 0. What the MVP is, in one paragraph

A **closed, human-gated, self-optimizing loop** that iteratively regenerates
software by improving *specifications*, not by throwing bigger models at fixed
ones: `onto execute` routes each node — capacity-ceiling nodes escalate up a
frontier ladder under a spend governor; extraction-gap nodes trigger an
LLM-driven **ficha-repair** proposal whose effect is measured by fork-and-diff
at a FIXED rung; every promotion is approved by the human **in the Walker**,
which is also where the residue that resists both levers surfaces as a named
frontier. The MVP is *not* "frontier regenerates the code": E1 established
that better models do NOT close bespoke extraction-gaps (`query-string`
flipped FAIL→PASS on a fixed 120b only after the ficha was enriched). The MVP
is the machine that does that enrichment on a loop, honestly measured.

### Why this is a *self-optimizing* loop (precise sense)

Each promoted ficha makes the intent graph carry more recovered intent, which
improves the inputs to every later repair and regeneration. The loop optimizes
a measurable quantity — regeneration fidelity (flip counts behind gates) — not
an abstract "code quality". Three guards keep it real rather than degenerate:

1. **Measured objective**: wrong→right vs right→wrong flips per behavior case,
   parent-vs-fork ([`FORK_AND_DIFF.md`](FORK_AND_DIFF.md) slice 1).
2. **Anti-overfit instrument**: the held-out CONFIRM split (slice 2) runs as
   an *instrument shown to the human*, even though promotion is human-gated in
   the MVP (the gate informs; it does not yet replace the human — §5).
3. **A stopping condition that IS the product**: a gap the repairer cannot
   close after N attempts is a *genuine frontier* — surfaced in the Walker,
   owned by the human, never faked. The resistant residue is the MVP's honest
   output, not its failure.

## 1. The loop

```
onto ingest <repo>          G lifts foreign code into an intent graph
        │
        ▼
onto execute (ladder: local → gpt-oss:120b-cloud → frontier; spend governor)
        │
        ├─ capacity-ceiling ──▶ escalate rung ──▶ gates green? ──▶ closed
        │
        ├─ extraction-gap ───▶ ficha-repair operator (R_strict / R_perm, §3)
        │                        │  proposes enriched ficha
        │                        ▼
        │                     fork at FIXED rung, prefix ~$0 from run-cache
        │                     flip-diff vs parent + held-out CONFIRM readout
        │                        │
        │                        ▼
        │                     Walker: human sees diff + flips + CONFIRM,
        │                     approves / edits / rejects the promotion
        │                        │ approved → precedent refreshed, next node
        │
        └─ gray-zone / resists N repairs ──▶ Walker frontier view (semantic-
                                             split ranked): human edits ficha
                                             or accepts node as resistant
```

The human never writes generated code; they steer intent from the Walker and
re-fire (`execute` / `regenerate`) without leaving the cockpit. That is the
Walker-as-primary-editing-layer vision made operational.

## 2. Locked decisions (project owner, 2026-07-23)

| Decision | Choice | Rationale |
|---|---|---|
| Autonomy line | **Human-gated in Walker.** Every ficha promotion is approved by the human; the loop proposes, measures, and queues. | Proves mechanics + cockpit UX first. The autonomy ladder to auto-promotion is §5, not MVP scope. |
| Corpus | **Foreign repos (the E3 corpus).** | Cleanest for an honest number (author-independent ground truth); the MVP run *is* usable E3 evidence — one corpus, two deliverables. Self-graph dogfood and Semillas come after, as separate exercises. |
| Repairer information access | **Both operators, as distinct pre-registered studies** (§3). | The strict/permissive *gap* is itself the measurement — deliberately chosen over picking one. |

## 3. The two repair operators (the owner's dual-study design)

Define two ficha-repair operators, **ordered by information access**:

- **R_strict** — the repairer sees only spec-side signal: failing behavior
  cases + oracle critique, the contract, the divergent draft's diff, the
  current ficha. It NEVER reads the reference source. Measures how much
  intent is recoverable from the specification surface alone. This is the
  **honest floor**, and the only mode whose closures feed the headline
  fidelity number (no code-laundering risk: F∘G≈id cannot be made trivially
  true by copying implementation into the ficha).
- **R_perm** — the repairer may additionally read the reference source.
  Measures the **ceiling** of recoverable intent. Its closures are reported
  separately and never mixed into the strict fidelity number.

The load-bearing quantity is the **gap**:

> `closure(R_perm) − closure(R_strict)` = the share of intent that lives
> *only in the code* — extraction-gap depth as a measured quantity per node
> and per corpus pole (bespoke vs canonical), not a label.

Predictions to pre-register before the first run (drafted here, to be frozen
in a dated calibration file with thresholds — per the pre-registration
convention, hypotheses are committed before runs):

- H-MVP-1: on bespoke-pole nodes, R_strict closes a nonzero share the base
  levers (refine/decompose/escalate) cannot (the E1 flip, automated).
- H-MVP-2: the strict↔perm gap is *larger* on the bespoke pole than the
  canonical pole (canonical intent is in the priors; bespoke intent hides in
  code). This links directly to E3's bespoke↔canonical axis.
- H-MVP-3: repair effects survive the rung-FIXED discipline (flips attribute
  to the ficha, not to ladder position).

Model roles are asymmetric by design, answering "do better models fix the
spec bottleneck?": as *generator* (F) with a fixed ficha — no (E1). As
*repairer* (a G-side reasoning task: reading fixtures/oracles and writing
intent) — plausibly yes, so the repairer runs on the strongest allowed rung
while the generator stays rung-FIXED during evaluation.

## 4. The three build pieces (scope cut)

1. **Frontier enablement + spend governor** (ROADMAP B1/B2). Provider
   failover, quota-aware retry, and a per-run spend budget that
   `onto execute` respects (`DEFAULT_PREMISE` still forbids paid by default;
   the MVP runs with an explicit budget flag). Report spend in the run
   verdict. Small and scoped.
2. **The ficha-repair lever** (ROADMAP A1 — the piece with substance). An
   executor lever that invokes R_strict or R_perm (explicit per run, never
   mixed), producing a proposed ficha as a **proposal** (the existing
   proposal system is the natural carrier), evaluated via
   [`FORK_AND_DIFF.md`](FORK_AND_DIFF.md) slice 1 (fixed-rung fork,
   prefix-from-cache, flip diff) with the slice-2 CONFIRM readout attached.
   Repair prompts live under version control (`legend/prompts/`).
3. **Walker wiring**. From a node in the frontier/gray-zone view: fire
   `execute`, watch verdict + flip diff + CONFIRM readout, approve/edit/
   reject the ficha proposal, re-fire. Walker v2 already ships the
   primitives (single-key fire, async probe, `:next`, procs); this is
   wiring, not new framework.

Explicitly **not** in the MVP: auto-promotion (§5), overnight unattended
runs, Semillas/self-graph corpora, cross-node failure clustering, workflow
runtime integration, any UI beyond the Walker TUI.

## 5. The autonomy ladder (after the MVP)

- **v1 (this MVP)**: human approves every promotion in the Walker. CONFIRM
  is an instrument.
- **v2**: auto-promote when CONFIRM passes; human owns only the gray-zone
  and the resistant residue. Requires v1 evidence that CONFIRM-pass ≈
  human-approve (measure their agreement during v1 — that agreement rate is
  the promotion-safety number that justifies v2).
- **v3**: overnight unattended closure runs with the spend governor +
  failover hardened. Reported next morning as a Walker frontier diff.

## 6. Acceptance (numbers the MVP must produce, all pre-registerable)

1. On a 2–3 repo E3 shake-out subset: **closure rate** under base levers vs
   base+R_strict vs base+R_perm, per corpus pole.
2. The **strict↔perm gap** per pole (H-MVP-2 direction at minimum).
3. **Cost per closed node** and per flip (rung mix, cache-hit rate, spend) —
   the napkin number, via the LADDER_ECONOMICS instrumentation.
4. **Human cost**: approvals per hour in the Walker, and the
   human-approve↔CONFIRM agreement rate (the v2 gate).
5. A **frontier report**: which nodes resisted both operators after N
   attempts — named, ranked, owned. If that list is empty on a bespoke pole,
   suspect the harness (too-easy corpus or laundering leak) before
   celebrating.
