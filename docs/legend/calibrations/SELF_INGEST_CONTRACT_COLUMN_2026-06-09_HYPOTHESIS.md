# Contract-column fill — pre-registered hypotheses (2026-06-09)

> *Pre-registration for the first measured fill of the cartography
> matrix's CONTRACT column (checker shipped 2026-06-09, PR #136 —
> `CONTRACT_AXIS_CHECKER_SPEC.md`). Committed BEFORE the run launches,
> per the Phase ε discipline. Do not edit after the run.*

## Setup (registered)

- **Graph:** the archived Arm A workspace
  (`.ontology.self-ingest-epsilon-3a-arm-a-result/`, 2026-05-23 ingest:
  qwen2.5-coder:7b + safety-net + `--ast-grounding`, 126 code nodes +
  canon), copied to a scratch `.ontology/` — the archive itself stays
  pristine.
- **Command:** `verify-homeomorphism --all-artifacts --matrix
  --ast-grounding --contract-check --provider ollama --model
  qwen2.5-coder:7b`, reps=1, overnight on the 8 GB Mac (caffeinate).
- **Outputs:** report `SELF_INGEST_CONTRACT_COLUMN_2026-06-09.md` +
  sidecar `.ontology.contract-column-2026-06-09.json`; worked copy
  archived as `.ontology.contract-column-2026-06-09-result/`.

## Premises (verified before launch, registered)

1. **No declared signatures exist** in the May-23 graph (audited:
   0/127 nodes carry `provides[].signature` — the O1 side channel
   landed 2026-06-09). Therefore this run measures the **key-presence
   contract** only; `signature_drift` is impossible by construction
   and every comparison is presence-only.
2. **9/127 nodes have empty `provides`** → those land `unknown`
   (`no_declared_contract`), plus the canon (not code-manifestation).
3. **All 126 source files still exist** in today's tree, but the tree
   has drifted since 2026-05-23 (17 days of commits). The STRUCTURAL
   numbers of this run are therefore **not** an Arm A replication and
   must not be read as one. The CONTRACT axis is immune to source
   drift by design: it compares declared provides vs the regen, never
   vs the source.
4. The regen is a **fresh draw** (qwen at default sampling): per-node
   regens will differ from the May artifacts. The registered outcome
   is the contract column; everything else is incidental context.

## Hypotheses

- **H-C1 (presence-dominated failures).** 100% of `fail` states have
  reason `missing_keys`; zero `signature_drift`. *Falsifier:* any
  drift entry → premise 1 was wrong (the graph carried signatures) —
  abort the reading and audit the graph.
- **H-C2 (pass-rate band).** The fraction of measured nodes
  (state ∈ {pass, fail}) that `pass` lands in **[0.10, 0.55]**.
  Reasoning: Arm A's export recovery (micro 68.6%) bounds per-key
  delivery, but `pass` requires ALL declared keys present, and
  declared keys are LLM-chosen vocabulary that may not live in export
  space at all (the vocab-gap finding). *Floor falsifier:* pass < 0.10
  → the declared-provides vocabulary largely does not name exports;
  the column is then measuring G's naming discipline, not F's
  delivery — an honest finding, but it must be reported as that, and
  it makes the O1-signature re-ingest (signatures + literal keys) the
  prerequisite for a delivery-measuring contract column.
  *Ceiling falsifier:* pass > 0.80 → suspiciously high for a
  recall-bound regen; audit 10 random passes for tautology before
  believing it.
- **H-C3 (unknown fraction).** `unknown` ≤ 0.15 of code nodes
  (premise 2 predicts ~8/126 ≈ 0.06 from empty provides; parse-failed
  regens add the rest). *Falsifier:* > 0.25 → the checker's
  evaluability is too narrow for this corpus; column not honestly
  fillable with v0.
- **H-C4 (column filled).** ≥ 100 of 126 nodes land a measured state
  (pass/fail) → the matrix moves 2/5 → **3/5 measured columns**.
  *Falsifier:* < 100 measured → the column stays "partial fill";
  record what blocked it.

## Decision rules (registered)

- H-C4 holds → update ROADMAP/ledger: matrix 3/5; the §3.10 entry's
  "2-column substate" language gets a dated addendum (not a rewrite).
- H-C2 floor fires → next action is the O1 re-ingest (signatures +
  export-shaped keys) BEFORE any frontier spend on this column.
- Wall-clock and any robustness failures (timeouts, OOM) are recorded
  in the report verbatim — they are findings, not noise.
