# Calibration log — index of `docs/legend/calibrations/`

> *Hand-rolled index of every calibration artifact under this directory.
> Add a line here when you land a new calibration; one-liner first,
> link second. If you're new to the project, start with §0.*

**Maintained:** 2026-05-28 (retired the dated milestone-review section — daily review findings now roll into `docs/ROADMAP.md`, the single source of truth for open work; the dated snapshots live in git history).
**Why this exists:** the calibration corpus grew past 30 files and a
newcomer was forced to `grep -r SELF_INGEST` to reconstruct the
narrative. Flagged in `MILESTONE_REVIEW_2026-05-24.md` §6 as a Baja
priority but increasing-value item.

---

## 0. Start here

If you are catching up cold, read in this order:

1. **[`SELF_INGEST_HYPOTHESIS_2026-05-13.md`](./SELF_INGEST_HYPOTHESIS_2026-05-13.md)** — the canonical Phase ε pre-registration. Frames the whole self-ingest program: what the round-trip `F ∘ G` is, what the matrix axes are, what "honest failure" looks like.
2. **[`SELF_INGEST_EPSILON_3A_TODO.md`](./SELF_INGEST_EPSILON_3A_TODO.md)** — the running Move 3α document. The current entry point for resuming work; always reflects the latest state of the multi-arm bake-off.
3. **[`../../ROADMAP.md`](../../ROADMAP.md)** — current state, open work, and the highest-value validation gaps. Daily review findings roll in here.

Then read the most recent self-ingest run's **HYPOTHESIS → main report → SYNTHESIS** triplet for the most current data point (today: Move 3α Arm A / B / C-local + synthesis).

---

## 1. Phase ε self-ingestion runs

Each run measures the round-trip `F ∘ G` against a fixed perimeter
(`src/runtime src/core src/commands src/schemas`, ~125 files), then
reads the matrix as a falsification exercise against a pre-registered
hypothesis. **All ε runs follow the triplet convention** — see §6.

### β (2026-05-16) — first end-to-end self-ingest

Single-model baseline (qwen2.5-coder:3b for both extraction and
compile-back). First measurement of the matrix at scale.

- [`SELF_INGEST_BETA_2026-05-16_HYPOTHESIS.md`](./SELF_INGEST_BETA_2026-05-16_HYPOTHESIS.md) — pre-registered.
- [`SELF_INGEST_BETA_2026-05-16.md`](./SELF_INGEST_BETA_2026-05-16.md) — raw matrix.
- [`SELF_INGEST_BETA_2026-05-16_SYNTHESIS.md`](./SELF_INGEST_BETA_2026-05-16_SYNTHESIS.md) — hypothesis vs reality.

### β′ (2026-05-16) — drop the verify model override

Same run minus the `--model qwen2.5-coder:3b` override on
`verify-homeomorphism`, so the registry's per-task routing actually
runs. Also lands Move 1 (export-vocabulary preservation in
`static_summary`).

- [`SELF_INGEST_BETA_PRIME_2026-05-16_HYPOTHESIS.md`](./SELF_INGEST_BETA_PRIME_2026-05-16_HYPOTHESIS.md) — pre-registered.
- [`SELF_INGEST_BETA_PRIME_2026-05-16.md`](./SELF_INGEST_BETA_PRIME_2026-05-16.md) — raw matrix.
- [`SELF_INGEST_BETA_PRIME_2026-05-16_SYNTHESIS.md`](./SELF_INGEST_BETA_PRIME_2026-05-16_SYNTHESIS.md) — surfaced a routing-architecture bug mid-flight + first Jaccard 1.0 file (Move 1 mechanism works in isolation).

### γ (2026-05-18) — Move 1b vocabulary-domain fix

β′ proved Move 1 worked in isolation but aggregate regressed because
`static_summary` emitted module specifiers into `requires` while
gluing demanded symbol names. Move 1b (commit `9eb9211`) flatmaps
`i.symbols` instead.

- [`SELF_INGEST_GAMMA_2026-05-18_HYPOTHESIS.md`](./SELF_INGEST_GAMMA_2026-05-18_HYPOTHESIS.md) — pre-registered.
- [`SELF_INGEST_GAMMA_2026-05-18.md`](./SELF_INGEST_GAMMA_2026-05-18.md) — raw matrix.
- [`SELF_INGEST_GAMMA_2026-05-18_SYNTHESIS.md`](./SELF_INGEST_GAMMA_2026-05-18_SYNTHESIS.md) — Move 1b recovered 13 unrecoverable nodes (32→19) but mean Jaccard stayed at 0.003. Diagnosis points at the extraction prompt.

### δ / δ′ (2026-05-18) — EXTRACTION_SYSTEM_PROMPT rewrite

Same schema and models as γ; only EXTRACTION_SYSTEM_PROMPT changed,
from descriptive ("describe the SHAPE") to constructive
("MUST export/return …"). This is the prompt-rewrite run.

- [`SELF_INGEST_DELTA_2026-05-18_HYPOTHESIS.md`](./SELF_INGEST_DELTA_2026-05-18_HYPOTHESIS.md) — pre-registered.
- [`SELF_INGEST_DELTA_2026-05-18.md`](./SELF_INGEST_DELTA_2026-05-18.md) — raw matrix.
- [`SELF_INGEST_DELTA_2026-05-18_SYNTHESIS.md`](./SELF_INGEST_DELTA_2026-05-18_SYNTHESIS.md) — mean Jaccard 7× off γ but vocab gap only −12% (488 missing exports across 115 of 125 nodes). Sets up Move 3α as the compile-back-side intervention.

### ε Move 3α (2026-05-19 … current) — AST grounding at compile-back

The current multi-arm bake-off. Intervention: AST-extracted
`MANDATORY EXPORTS` block injected into the compile-back system
prompt. Arms vary model only (qwen / granite / starcoder local;
devstral cloud deferred).

- [`SELF_INGEST_EPSILON_3A_2026-05-19_HYPOTHESIS.md`](./SELF_INGEST_EPSILON_3A_2026-05-19_HYPOTHESIS.md) — pre-registered hypotheses H1–H6, decision tree, Candados. **Carries a 2026-05-24 addendum** that recalibrates H1 → H1' (against Arm A0's 0.226 measured baseline) and H3 → H3' (against Arm A's 0.581 grounded incumbent) for any new arm launched from 2026-05-24 onward (notably Arm C-cloud). Original H1–H5 stays as the original pre-registration; recalibrated H1'/H3' carries the data-grounded floors and an updated post-Arm-C decision tree.
- [`SELF_INGEST_EPSILON_3A_TODO.md`](./SELF_INGEST_EPSILON_3A_TODO.md) — **running document**; canonical resume point. Updated continuously.
- [`SELF_INGEST_EPSILON_3A_2026-05-19_ARM_A.md`](./SELF_INGEST_EPSILON_3A_2026-05-19_ARM_A.md) — `qwen2.5-coder:7b`. 125 nodes, mean Jaccard 0.581, structural honesty 0.496, 0 unrecoverable. Carries a 2026-05-24 post-publication addendum documenting the silent 125/126 perimeter under-count (node_0094) and the structural fixes that closed it.
- [`SELF_INGEST_EPSILON_3A_2026-05-19_ARM_B.md`](./SELF_INGEST_EPSILON_3A_2026-05-19_ARM_B.md) — `granite4.1:8b`. Hardware-vetoed (124/125 unrecoverable, `fetch failed`); a proper Arm B comparison still requires cloud / ≥16 GB RAM.
- [`SELF_INGEST_EPSILON_3A_2026-05-19_ARM_C_LOCAL.md`](./SELF_INGEST_EPSILON_3A_2026-05-19_ARM_C_LOCAL.md) — `starcoder2:7b` (substitute for the deferred devstral-small-2:24b cloud arm). 54% unrecoverable; coding-base-at-7B does not satisfy the MANDATORY EXPORTS contract.
- [`SELF_INGEST_EPSILON_3A_2026-05-19_ARM_A0_CONTROL.md`](./SELF_INGEST_EPSILON_3A_2026-05-19_ARM_A0_CONTROL.md) — Arm A0 control (landed 2026-05-24): `qwen2.5-coder:7b` + safety-net **without** `--ast-grounding`, identical perimeter to Arm A. Mean Jaccard 0.226, structural honesty 0.332, exportRecovery 25.6%, 0 unrecoverable. Decomposes Arm A's 28× margin over the δ' floor into ~0.205 baseline-qwen-7b + ~0.355 grounding-intervention lift; resolves the §3.1 circularity worry as "real lift, not artefact".
- [`SELF_INGEST_EPSILON_3A_2026-05-19_SYNTHESIS.md`](./SELF_INGEST_EPSILON_3A_2026-05-19_SYNTHESIS.md) — cross-arm bake-off synthesis over 4 arms (driver `scripts/run-3a-bakeoff-synthesis.ts`). H1 anyPass=true, allPass=false (A and A0 both clear 0.1 floor; B and C-local don't). Per-mode failure deltas decompose the grounding contribution exactly.

### Contract-column fill (2026-06-09) — matrix 2/5 → 3/5, $0

First measured fill of the CONTRACT column (checker shipped same day,
PR #136). Run over the archived Arm A graph (copy), local qwen via
the content-addressed run cache — the May regens were resurrected, so
the sweep cost $0 and ~5 min, with zero sampling variance vs Arm A.

- [`SELF_INGEST_CONTRACT_COLUMN_2026-06-09_HYPOTHESIS.md`](./SELF_INGEST_CONTRACT_COLUMN_2026-06-09_HYPOTHESIS.md) — pre-registered H-C1..H-C4 + audited premises (committed before launch, PR #137).
- [`SELF_INGEST_CONTRACT_COLUMN_2026-06-09.md`](./SELF_INGEST_CONTRACT_COLUMN_2026-06-09.md) — raw report (sidecar `.ontology.contract-column-2026-06-09.json`).
- [`SELF_INGEST_CONTRACT_COLUMN_2026-06-09_SYNTHESIS.md`](./SELF_INGEST_CONTRACT_COLUMN_2026-06-09_SYNTHESIS.md) — **117/125 measured, pass 85 / fail 32 / unknown 8; pass rate 0.726.** H-C1/H-C3/H-C4 hold; H-C2's band [0.10, 0.55] missed HIGH (no falsifier fired; spot-audited non-tautological). All fails are `missing_keys` (presence-only regime — the May graph predates O1 signatures); fails concentrate in `divergent_both` (22/32) while 60/73 `divergent_loc` nodes PASS — the axis discriminates. Premise-4 correction recorded: run-cache resurrection, benign.

### Bilateral round-trip (2026-06-12) — first unit-side measurement, $0

First measurement of the **unit side** of `G ⊣ F` (intent → code →
intent) over the live 228-node graph — never measurable before the
2026-06-11 graph population. Three arms (local floor / frontier-F /
frontier-both, the frontier arms via cold session subagents replaying
the *exact* pipeline prompts through a wire shim — $0 marginal), plus
an updated counit baseline, a cold-reader altitude-legibility probe,
and read-only simplification candidates. Sample 48 (40 main + 8
escalated S7 overlay).

- [`ROUNDTRIP_BILATERAL_2026-06-12_HYPOTHESIS.md`](./ROUNDTRIP_BILATERAL_2026-06-12_HYPOTHESIS.md) — pre-registered (M1/M2/M3 + null + echo guard, H-C1/H-U1/H-U2/H-ARM/H-S7/H-COLD, kernel-membership rule); **Amendment A1** (F = verify compile-back, registered pre-data).
- [`ROUNDTRIP_BILATERAL_2026-06-12_REPORT.md`](./ROUNDTRIP_BILATERAL_2026-06-12_REPORT.md) — **unit side round-trips: Arm A median M1 0.80, `provides` recovery 1.0 (H-U1 PASS); M2 beats null 92–98% all arms (H-U2 PASS); rules ~total loss (M3 0% except frontier-G-on-rich-fichas 0.43). Kernel = 19/48 structurally regenerable (T2), 15 reachable on the local $0 stack.** Counit: structural Jaccard median 0.667 (H-C1 structural PASS), contract 0.638 (below 0.726 anchor, H-C1 contract FAIL). **Key methodological finding: M1 falls A→B→C on main strata but *rises* on S7 (frontier-extracted originals), peaking at C 0.60 — a reference-frame confound proving the binding constraint is extraction/ficha quality, not the compiler F (H-S7 CONFIRMED, sharpens the ROADMAP "extraction completeness" lever).** Cold-reader H-COLD PASS 3/3, 4/4 families. Sidecars: `.ontology.scratch-roundtrip-2026-06-12/` (fase1-verify, metrics-arm{A,B,C}, synthesis-data, simplification-candidates).

### Lens laws under edits (2026-06-13) — bidirectional transformation, $0

First measurement of the `G ⊣ F` lens laws **under deliberate edits**
(the bilateral experiment measured only the identity point). Mapping
S=code/V=intent, get=`onto ingest`/put=`onto regenerate`. Marker edits
isolate lens propagation from model capability; 6 kernel nodes, local +
frontier-GET arms.

- [`LENS_LAWS_2026-06-13_HYPOTHESIS.md`](./LENS_LAWS_2026-06-13_HYPOTHESIS.md) — pre-registered (E1 contract / E2 rule / E3 code edits; H-PG1/H-PG2/H-GP1/H-ARM; committed before runs).
- [`LENS_LAWS_2026-06-13_REPORT.md`](./LENS_LAWS_2026-06-13_REPORT.md) — **PUT (F) propagates a declared contract edit 6/6; GET (extraction) is the binding constraint and decisively model-bound — local 3B recovers the edit 4/6 (E1) / 2/6 (E3), frontier 6/6 / 6/6 through the same pipeline.** Rules don't round-trip (E2 0/6) — a representational gap (code doesn't carry rules), not capacity. H-PG1 PASS, H-PG2 confirmed, H-GP1 fails-on-local-recovers-at-frontier, H-ARM model-bound (+2/+4). Product upshot: "edit a contract in the Walker and regenerate" is sound (F reliable); the legible-intent round-trip is gated by extractor quality; rule-level intent needs a rules-aware channel. Laws stay T2.

---

## 2. Pre-Phase-ε calibrations

Small-scale measurements that preceded the canonical self-ingest
program. Useful for grounding individual claims in the synthesis docs.

- [`HASH_TS_2026-05-12.md`](./HASH_TS_2026-05-12.md) — first end-to-end measurement of the `F ∘ G` round-trip (Project Legend §2.1). Single file (`src/core/integrity/hash.ts`), `claude-opus-4-7` via Anthropic, n=1. Baseline against the prior β-2 qwen run.
- [`VIBE_REASONING_GAMMA_7_2026-05-12.md`](./VIBE_REASONING_GAMMA_7_2026-05-12.md) — γ-7 signature-invariants check on the Vibe-Reasoning Python corpus (24 files, IMO 2025 P6 case study). Tests `MANDATORY EXPORTS` block + δ-2 `onto verify-homeomorphism` end-to-end outside the Ontology codebase.
- [`VIBE_REASONING_PROCEDURE.md`](./VIBE_REASONING_PROCEDURE.md) — the procedure that drives the above. Documents why this external repo was chosen, what's skipped (γ-4 static-edge inference, since it's Python), and the step-by-step.
- [`BAKEOFF_3B_FAMILY_2026-05-15.md`](./BAKEOFF_3B_FAMILY_2026-05-15.md) — Phase ε E6 deliverable: cross-model variance and ensemble effectiveness on a curated 20-file subset. Establishes per-model variance (not just point estimates) to falsify/strengthen the pilot's "82.3% → 95.97% recovery" headline.
- [`SMOKE_PR3_ENABLED_2026-05-15.md`](./SMOKE_PR3_ENABLED_2026-05-15.md) — Phase ε prework C: end-to-end smoke of `onto ingest --static-classifier enabled` against the Ontology core perimeter. Falsifies/confirms the deflection distribution predicted by the report-only smoke before PR3 shipped.
- [`SELF_INGEST_HYPOTHESIS_2026-05-13.md`](./SELF_INGEST_HYPOTHESIS_2026-05-13.md) — the canonical Phase ε pre-registration. Frames the success matrix, the frontier taxonomy, and the falsifiers for everything that follows.
- [`PREWORK_2026-05-13.md`](../../archive/PREWORK_2026-05-13.md) (now `docs/archive/PREWORK_2026-05-13.md`) — pre-pilot $0 tooling plan; all five items A–E shipped 2026-05-16 (`373eb8a`).
- `bakeoff-2026-05-15-raw/` — raw bake-off CSV/log data referenced by `BAKEOFF_3B_FAMILY_2026-05-15.md`.

---

## 3. Hierarchizer prework

Pre-structural-change measurements to fix the brújula before the
network topology mutates.

- [`HIERARCHY_BASELINE_2026-05-22.md`](./HIERARCHY_BASELINE_2026-05-22.md) — pre-hierarchizer measurement via `onto graph metrics` (read-only). Establishes `closedWorldContextReachableSatisfaction` as the brújula; simulation shows materializing `depends_on` / `uses_token` edges moves it from 0.519 → 1.000 on the γ snapshot.
- [`EMPIRICAL_VALIDATION_PROTOCOL_2026-05-22.md`](./EMPIRICAL_VALIDATION_PROTOCOL_2026-05-22.md) — companion procedure: tests whether the *simulated* brújula movement predicts a *real* improvement in regeneration quality, using `onto graph materialize-edges`.

---

## 4. Milestone reviews — retired as dated snapshots (2026-05-28)

The scheduled daily-ontology-review task used to land a dated
`MILESTONE_REVIEW_<date>.md` here. Those snapshots accumulated faster
than they earned their keep (10 files, ~2,400 LoC, mostly re-flagging
the same open items on low-activity days). The convention is retired:
**daily review findings now roll into [`../../ROADMAP.md`](../../ROADMAP.md)**,
which is the single source of truth for open work. The historical
snapshots (05-19 … 05-28) remain in git history if a specific day's
read is ever needed.

---

## 5. Conventions

### Triplet structure

Every self-ingest run lands as three files:

| File | Written when | Purpose |
|---|---|---|
| `SELF_INGEST_<RUN>_<DATE>_HYPOTHESIS.md` | **Before** the run | Pre-registered falsifiers + decision tree. Committed before any data is collected so success criteria cannot be retro-fitted. |
| `SELF_INGEST_<RUN>_<DATE>.md` | **During** the run | Raw matrix written by `verify-homeomorphism --report`. No commentary. |
| `SELF_INGEST_<RUN>_<DATE>_SYNTHESIS.md` | **After** the run | Hypothesis vs reality reading. Names which falsifiers fired, which surprises emerged, what the next move is. |

Multi-arm runs (Move 3α) additionally land per-arm reports (`_ARM_<X>.md`), a cross-arm `_SYNTHESIS.md`, and a running `_TODO.md`.

### Naming

- `SELF_INGEST_<GREEK>_<YYYY-MM-DD>[_<SUFFIX>].md` for canonical Phase ε runs (β, β′, γ, δ, δ′, ε).
- Pre-ε calibrations carry topic-prefixed names (`HASH_TS_*`, `VIBE_REASONING_*`, `BAKEOFF_*`, `SMOKE_*`, `HIERARCHY_*`, `EMPIRICAL_*`).
- Daily automated reviews are no longer dated files — findings roll into `docs/ROADMAP.md` (see §4).

### Sidecar JSONs

`verify-homeomorphism --json > .ontology.self-ingest-<run>.json` writes
the raw `AggregateReport`. Move 3α sidecars (Arm A/B/C-local +
synthesis) live at the repo root and are **versioned in git** (they
are the pre-registered output and audit-replay anchors). In-flight
sidecars and `.stderr.log` files are gitignored — see `.gitignore`.

### When to add an entry

When you land a calibration artifact in this directory:

1. Drop the file in place using the naming convention above.
2. Add a one-line entry to the appropriate section here (`§1` for ε runs, `§2` for pre-ε, `§3` for hierarchizer). Daily reviews go to `docs/ROADMAP.md`, not here.
3. Cross-link the triplet siblings if applicable.
4. Bump the "Maintained:" date at the top.
- [EXTRACTOR_BAKEOFF_2026-06-10_HYPOTHESIS](EXTRACTOR_BAKEOFF_2026-06-10_HYPOTHESIS.md) + [RESULT](EXTRACTOR_BAKEOFF_2026-06-10_RESULT.md) — extractor selection for the live-graph self-ingest: incumbent qwen2.5-coder:3b wins per pre-registered rule (M1 8/8); frontier gap measured at +0.224 recall via cold claude-fable-5 subagents ($0 marginal); qwen3.5:9b not deployable on 8 GB (machine crash).
- [SELF_INGEST_LIVE_GRAPH_2026-06-11_RESULT](SELF_INGEST_LIVE_GRAPH_2026-06-11_RESULT.md) — first live-graph population: 221 files → 228 nodes + 710 edges, governed escalation (213 local + 8 frontier subagents), 63 verified batches with zero failures; :which loop closed.
- [REGEN_INTENT_CONSUMPTION_2026-06-17](REGEN_INTENT_CONSUMPTION_2026-06-17.md) — **exploratory** (not pre-registered): the F∘G neck is *intent under-consumption*, not a model wall. Pure code round-trips ε-equivalent; glue diverges because the determining invariants are absent from the extracted intent AND the regenerator only grounds export *names*, never signatures/oracle. Landed signature-grounding in compile-back; next is a rich re-ingest. $0, local 7B.
