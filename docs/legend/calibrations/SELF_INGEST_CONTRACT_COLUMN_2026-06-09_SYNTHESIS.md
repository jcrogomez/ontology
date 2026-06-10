# Contract-column fill — synthesis (2026-06-09)

> *Judgement of the pre-registered hypotheses in
> [`SELF_INGEST_CONTRACT_COLUMN_2026-06-09_HYPOTHESIS.md`](./SELF_INGEST_CONTRACT_COLUMN_2026-06-09_HYPOTHESIS.md)
> against the run record
> [`SELF_INGEST_CONTRACT_COLUMN_2026-06-09.md`](./SELF_INGEST_CONTRACT_COLUMN_2026-06-09.md)
> (sidecar `.ontology.contract-column-2026-06-09.json`). The hypothesis
> doc is untouched, per discipline.*

## Headline

**The contract column is filled: 117/125 nodes measured, pass rate
0.726, at $0 and ~5 minutes wall-clock.** The cartography matrix moves
**2/5 → 3/5 measured columns** (structural + behaviour + contract).

| `byAxis.contract` | count |
|---|---:|
| pass | **85** |
| fail | **32** |
| unknown | 8 |
| not-measured | 0 |

Fail reasons: 32/32 `missing_keys` (115 missing keys total, mean ~3.6
per failing node); **0 signature drift, 0 incomparable** — exactly the
presence-only regime the registered premise 1 predicted (the May graph
carries no O1 signatures).

## Hypothesis judgements

- **H-C1 (presence-dominated failures): ✅ HOLDS.** 100% of fails are
  `missing_keys`; zero `signature_drift` entries. Premise 1 confirmed.
- **H-C2 (pass-rate band [0.10, 0.55]): ✗ PREDICTION MISSED — HIGH.**
  Measured 0.726. Neither registered falsifier fired (floor 0.10,
  ceiling 0.80), but the band was wrong: I under-credited how
  export-shaped the γ-7 MANDATORY-EXPORTS + grounding ingest made the
  declared vocabulary. Spot audit (8 random passes, seed 20260609):
  declared keys are literal export identifiers (median 3 keys per pass
  node, max 32; 47/85 passes carry ≥ 3 keys) — not tautological. The
  honest reading: **G's declared contracts are mostly real and F
  mostly honours them**; the floor-falsifier scenario ("vocabulary
  doesn't name exports") did not materialise.
- **H-C3 (unknown ≤ 0.15): ✅ HOLDS.** 8/125 = 0.064 — exactly the 8
  empty-provides code nodes audited pre-launch. No parse-failed regens.
- **H-C4 (≥ 100 measured → column filled): ✅ HOLDS.** 117 ≥ 100.

## Premise corrections (recorded, not retrofitted)

- **Premise 4 ("the regen is a fresh draw") was WRONG — benignly.**
  The content-addressed run cache resurrected the **May 23 Arm A
  regens** (identical node prompts + model → same run ids), so no LLM
  dispatch fired and the sweep took ~5 min, not the registered 2–5 h.
  Consequence: the contract column is measured against the *actual Arm
  A regens* — zero sampling variance, direct comparability with the
  Arm A record. Better than designed, and worth registering as the
  default expectation for future $0 column fills over archived arms.
- Premise 3 (source drift): confirmed and visible — this run's
  byVerdict (ε 10 / loc 73 / structural 4 / both 38) is NOT an Arm A
  replication (fixed May regens vs 17-days-drifted sources). Recorded
  as incidental context only; the contract axis never reads the source.

## What the column actually says (first reading)

- **The axis discriminates and is not the structural axis in
  disguise:** 60 of 73 `divergent_loc` nodes still PASS contract —
  verbosity divergence does not break the declared promise. Fails
  concentrate in `divergent_both` (22/32), i.e. where the regen
  structurally collapsed, it also broke its contract — consistent with
  the recall-bound large-module finding (top missers: `node_0096`
  init.ts 13 missing, `node_0019` 11, `node_0018`/`node_0073` 10).
  One `epsilon_equivalent` node fails contract (declared key never
  exported — a pure vocab-gap case the structural axis cannot see).
- **What v0 cannot say:** nothing about signatures (none declared in
  this graph — an O1 re-ingest would upgrade the column from
  key-presence to interface-compatibility), and nothing about Python
  (n/a here).

## Decision-rule outcomes (registered → executed)

- H-C4 held → ROADMAP + `MATHEMATICAL_CLAIMS.md` §3.10 get the dated
  3/5 addendum (this commit).
- H-C2 floor did NOT fire → the O1 re-ingest is an *upgrade* path
  (presence → interface compatibility), not a prerequisite; it can
  ride on any future re-ingest rather than blocking anything.
- Robustness: zero failures, zero timeouts; the workspace swap/restore
  trap behaved (main `.ontology` restored; worked copy archived at
  `.ontology.contract-column-2026-06-09-result/`).
