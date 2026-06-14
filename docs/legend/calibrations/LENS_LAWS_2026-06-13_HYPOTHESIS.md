# LENS_LAWS_2026-06-13 — HYPOTHESIS (pre-registered)

> **Dated pre-registration. Committed BEFORE any run.** Never edit to
> match results; results land in `LENS_LAWS_2026-06-13_REPORT.md`.
>
> **Declared purpose.** The bilateral round-trip
> ([`ROUNDTRIP_BILATERAL_2026-06-12`](ROUNDTRIP_BILATERAL_2026-06-12_REPORT.md))
> measured the lens laws **at the identity point** — unedited values
> round-tripping. This experiment measures them **under edits**, the
> operationally meaningful regime: "I edit one side, does the other
> adapt — and does my edit survive the round-trip?" It is the empirical
> test of the project's core bidirectional claim, using the now-shipped
> `onto regenerate` (put) and `onto ingest` (get).

## 0. The lens mapping (frozen)

Asymmetric lens with **S = code** (the larger structure), **V = intent**
(its projection):

- **get : code → intent** = `onto ingest` (the functor G).
- **put : intent → code** = `onto regenerate` (the functor F; our F
  ignores the old-source argument — it compiles fresh from intent).
- **GetPut** (stability): `put(get(s)) = s` — ingest code → intent,
  regenerate → code′, expect code′ = s. *This is the counit* (verify-
  homeomorphism); identity-point value already measured: structural
  Jaccard median **0.667**.
- **PutGet** (correctness): `get(put(v)) = v` — regenerate code from
  intent v, ingest → intent′, expect intent′ = v. *This is the unit*;
  identity-point value already measured: contract M1 **0.80**.

**What is new here.** The classic laws quantify over *all* v / s,
including **edited** ones. We only ever tested v = the original
(unedited) ficha. Testing the laws under a deliberate edit is strictly
stronger and is exactly what "edit intent, code adapts faithfully"
requires. A lens can round-trip unchanged values yet still fail to
propagate an edit.

## 1. Frozen context

- **Date:** 2026-06-13. **Git HEAD:** main @ `af15e7d` (PR #148 merged —
  regenerate/probe/consensus shipped).
- **Sample (6 behaviourally-lifted kernel nodes, pure functions with
  fixtures):** node_0017 (`node-id.ts`), node_0022 (`paths.ts`),
  node_0131 (`frontier-tagger.ts`), node_0176 (`graph-load.ts`),
  node_0223 (`ensemble.ts`), node_0225 (`reps-aggregator.ts`).
- **Environment:** local Ollama (qwen2.5-coder:7b put / 3b get), frontier
  via cold session subagents (the proven $0 replay path). `dist/` from
  HEAD. Work in an isolated `.ontology.scratch-lens-laws-2026-06-13/`
  graph copy — the live graph is never mutated.

## 2. Edits (deterministic, marker-based)

Marker edits **isolate lens propagation from model capability**: they ask
only "does a *declared* change flow through and round-trip?", not "can
the model implement a hard feature?". Per node `node_XXXX`:

- **E1 — contract edit (PutGet primary).** Append to the ficha prompt:
  `MUST also export a const named LENS_MARKER_XXXX with the exact string
  value "lens_XXXX".` and add `LENS_MARKER_XXXX` to `context.provides`.
  → regenerate (put) → code′ → ingest (get) → intent′.
  **Survives iff** `LENS_MARKER_XXXX` appears in code′ as an export
  **and** in intent′.provides.
- **E2 — rule edit (PutGet secondary).** Append a rule to the ficha:
  `REQUIRE: <mainExport> is a pure function with no side effects.`
  **Survives iff** intent′.rules contains a rule with token-Jaccard
  ≥ 0.5 to the injected rule. (Prior M3 = 0 predicts failure.)
- **E3 — code edit (GetPut, the other direction).** Append to the
  SOURCE file: `export const LENS_CODE_MARKER_XXXX = "code_XXXX";`
  → ingest (get) → intent′ → regenerate (put) → code″.
  **Survives iff** intent′.provides contains the marker **and** code″
  re-emits the export.

All edits are produced by `scripts/lens-laws-2026-06-13-edits.mjs`
(deterministic, no RNG) into a frozen edit-set, mirroring the bilateral
sample selector.

## 3. Arms

| Arm | put (F) | get (G) |
|---|---|---|
| **L** local | regenerate `qwen2.5-coder:7b` `--draws 3` (consensus) | ingest `qwen2.5-coder:3b` |
| **F** frontier | cold subagent (exact compile-back prompt) | cold subagent (exact ingest prompt) |

`--draws 3` on the local put arm so a marker dropped by a single unstable
draw is not scored as a propagation failure when the majority carries it
(consensus = the write candidate's behaviour).

## 4. Metrics

- **Edit-survival rate** per axis (E1/E2/E3) per arm: fraction of the 6
  nodes where the marker/rule survives the full round-trip. Primary
  number.
- **Half-survival breakdown** (where it dies): present-in-code′-but-not-
  intent′ (get drops it) vs absent-from-code′ (put drops it). Localizes
  the failing functor.
- **Least-change (secondary, with noise baseline).** Structural Jaccard
  between regen-from-edited-intent and regen-from-original-intent,
  compared against the draw-variance baseline (two regens of the
  *unedited* intent). A well-behaved lens: edit-induced change is small
  and localized to the marker (Jaccard near the baseline, plus the new
  export). If edit Jaccard ≪ baseline, the edit triggers a non-local
  rewrite — recorded as a least-change failure.

## 5. Hypotheses, thresholds, falsifiers

Anchored to the identity-point results (contract M1 0.80 strong; rules
M3 0%).

- **H-PG1 (contract-edit propagation):** E1 survival ≥ 4/6 on the local
  arm, ≥ 5/6 on frontier. *Falsifier:* frontier E1 < 3/6 → declared
  contract changes do not propagate through the lens → intent-first
  editing of contracts is unreliable even at the ceiling, a blocker for
  the Walker-edits vision.
- **H-PG2 (rule-edit propagation):** E2 survival ≤ 2/6 on both arms
  (rules don't survive — predicted by M3=0). *Falsifier of the broader
  "rules are lost" claim:* E2 ≥ 4/6 → rules DO round-trip under explicit
  edits; revisit the M3 finding.
- **H-GP1 (code-edit propagation):** E3 survival ≥ 4/6 on local
  (a clear exported const is the easiest thing for get to capture and
  put to re-emit). *Falsifier:* E3 < 3/6 → even an unambiguous code edit
  does not survive → the "edit code, intent tracks it" half is weak.
- **H-ARM (attribution):** frontier − local survival on E1: ≥ +2 nodes →
  propagation is model-bound (escalate); ≤ +1 → architecture/ficha-bound.
- **H-LC (least-change):** report only — no threshold pre-set (F's draw
  variance makes a fair threshold unknown a priori; the noise baseline is
  the honest reference).

**Decision the experiment informs:** whether "edit the ficha's contract
in the Walker and regenerate" is a reliable daily workflow on the local
$0 stack (H-PG1 local passes), needs the frontier (only frontier passes),
or is blocked (both fail). And whether rule-level intent is propagable at
all today (H-PG2).

## 6. Out of scope (deferred, named so the report cannot claim them)

Behaviour-value edits (interact with the pinned fixtures — a separate
design); PutPut / edit-composition (`put(v', put(v)) = put(v')`); the
formal triangle identities; multi-node / glued edits. The laws stay
**T2** — we measure empirical edit-survival tolerance, not a theorem.

## 7. Cost

$0 marginal (local Ollama + cold subagents). ~6 nodes × 3 edits × 2 arms;
estimate one local session (~1–2h with `--draws 3`) + one subagent fleet.
