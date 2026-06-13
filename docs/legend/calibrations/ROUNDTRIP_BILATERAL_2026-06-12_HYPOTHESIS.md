# ROUNDTRIP_BILATERAL_2026-06-12 — HYPOTHESIS (pre-registered)

> **Dated pre-registration. Committed BEFORE any measurement run.**
> Per house rule, this file must never be edited to match results.
> Results land in `ROUNDTRIP_BILATERAL_2026-06-12_REPORT.md`.
>
> **Declared purpose (product-first):** produce the *regenerability map* —
> the dated list of live-graph nodes whose intent already reconstructs
> their code within tolerance, plus the taxonomy of where meaning is
> lost. That map is the input for the ficha-refinement queue and the
> Walker editing loop. The `MATHEMATICAL_CLAIMS.md` §3.10 ledger gets
> updated *as a side effect*, not as the goal.

## 0. Context and frozen state

- **Date:** 2026-06-12. **Git HEAD:** `c8ba718` (main, clean tree).
- **Live graph:** 228 nodes (7 intent + 221 code), ~710 edges,
  2828 events, populated 2026-06-11
  (`SELF_INGEST_LIVE_GRAPH_2026-06-11_RESULT.md`).
- **Environment:** Node v23.6.0; Ollama local on 8 GB Mac with
  `qwen2.5-coder:7b` (rol F, `compile_local`), `qwen2.5-coder:3b`
  (rol G, `extract_local`), `nomic-embed-text` (768d). `dist/` rebuilt
  from HEAD before any run. `qwen3.5:9b` is installed but **excluded**
  (caused a machine reboot on this hardware, 2026-06-10 lesson).
- **Frontier mechanism:** cold `claude-fable-5` session subagents
  answering the *exact pipeline prompts* — the same governed-escalation
  mechanism validated in the 2026-06-11 live-graph population ($0
  marginal). Honest condition: a session subagent is not an API-pinned
  model (no temperature control, session model resolution); recorded as
  a measurement condition, not hidden.

## 1. Question

The adjunction-shaped claim `G ⊣ F` (§3.10, T2) has only ever been
measured on its **counit side** (code → G → intent → F → code′:
`verify-homeomorphism`, Phase ε). The **unit side** (intent → F →
code′ → G → intent′) has never been measured — until 2026-06-11 there
was no populated intent graph to measure it on. This experiment
measures **both halves over the same pre-registered sample** of the
live graph, under three arms separating model capacity from
architecture, plus an **altitude-legibility probe** (the "ERP must be
readable at some layer" criterion) and **read-only simplification
candidates** (the compression-pressure groundwork).

**Explicitly out of scope (deferred, recorded so the report cannot
quietly claim them):** triangle-identity tolerances (εF∘Fη, Gε∘ηG),
contraction iteration (F∘G)², behavioural probes beyond the existing
fixtures corpus, and any mutation of the live graph. The kernel claim
this experiment can ground is **"estructuralmente regenerable (T2)"**
— structural + contract + text-semantic evidence, *not* behavioural
proof.

## 2. Sample (frozen)

Selector: `scripts/roundtrip-bilateral-2026-06-12-sample.mjs` —
deterministic centered-systematic sampling within strata, no RNG;
escalated nodes excluded from main strata and carried as overlay S7.
Frozen output: `.ontology.scratch-roundtrip-2026-06-12/sample.json`.

| Stratum | Universe | n | Node ids |
|---|---|---|---|
| S1 núcleo (core/schemas/cli) | 26 | 6 | 0009, 0013, 0017, 0022, 0026, 0030 |
| S2 comandos | 58 | 8 | 0036, 0043, 0051, 0058, 0065, 0072, 0080, 0087 |
| S3 runtime-F (llm/compile/context/prompt) | 30 | 6 | 0093, 0098, 0103, 0146, 0151, 0156 |
| S4 runtime-G/ζ (legend/workflow/ingest/semantic) | 25 | 6 | 0127, 0131, 0135, 0139, 0143, 0176 |
| S5 runtime-otros | 33 | 6 | 0109, 0115, 0120, 0158, 0166, 0172 |
| S6 walker | 41 | 8 | 0181, 0186, 0191, 0196, 0202, 0207, 0212, 0217 |
| S7 escalados (overlay, frontier-extracted fichas) | 8 | 8 | 0220–0227 |
| **Total** | 221 | **48** | |

Main-sample aggregates are computed over S1–S6 (n=40); S7 is analyzed
separately (its fichas come from a stronger extractor — mixing it into
the main aggregate would flatter the numbers). Per-stratum n is small;
stratum-level numbers are **descriptive**, not inferential.

## 3. Sequencing

1. `npm run build` (dist from HEAD) → isolated workspace
   `.ontology.scratch-roundtrip-2026-06-12/ws/` containing a **copy**
   of the live `.ontology/` + symlinks to `src/` and `tests/` (the CLI
   resolves everything from cwd; the live graph is never touched).
2. **Smoke test (3 nodes: node_0017, node_0202, node_0220)** through
   both directions; abort and fix harness if any pipeline step
   misbehaves. Smoke results do not count toward the experiment.
3. **Fase 1** (counit) over all 48.
4. **Fase 2 Arm A** (local) over all 48, sequential (8 GB: one model
   resident at a time).
5. **Fase 2 Arms B and C** (frontier subagents) over all 48 — may run
   concurrently with local arms (no Ollama contention for B's F-side /
   C at all).
6. **Cold-reader test** (3 subagents) + **simplification metrics**
   (read-only scripts).
7. Synthesis report + `CALIBRATION_LOG.md` entry + ROADMAP pointer.

**Partial-stop rule (pre-registered):** if total wall-clock exceeds ~8h
the run stops at the last completed stratum and reports what was
measured, labeled partial. No threshold may be adjusted after seeing
partial data.

**Failure accounting (pre-registered):** every LLM call gets up to 3
attempts on JSON-parse/schema failure. A node still failing after 3 is
recorded as `extraction_failed` and **stays in the denominator** of
pass-rates (it is evidence about the channel, not noise). Per-node
attempt counts are reported (the 7B/3B JSON flakiness ~50% from the ζ
dry-run must be visible, not laundered).

## 4. Fase 1 — counit side (code → intent → code′), updated baseline

```
node dist/cli.js verify-homeomorphism --nodes <48 ids> \
  --matrix --ast-grounding --contract-check --behavior-check \
  --provider ollama --model qwen2.5-coder:7b --reps 1 --json
```

(cwd = isolated workspace). Defaults kept: loc-threshold 0.3, jaccard
0.5, open-world. `--reps 1` is a pre-registered economy: single-draw
Jaccard variance is known (Move 3α measured it; medians over 48 nodes
aggregate it). Recorded per node: five-label verdict, Jaccard, LoC
distance, contract axis, behaviour axis where fixtures exist.

## 5. Fase 2 — unit side (intent → code′ → intent′), never measured

Per node, per arm:

- **F:** `node dist/cli.js compile run <id> --provider <arm-F> --model
  <arm-F-model> --open-world --target regen/<arm>/<id>.<ext> --force`
- **G:** `node dist/cli.js ingest regen/<arm>/<id>.<ext> --provider
  <arm-G> --model <arm-G-model> --dry-run --json` → ficha′

**Metrics (all deterministic given the two fichas):**

- **M1 — contract fidelity.** Jaccard over exact-match key sets
  (trimmed), reported per category (`provides`, `requires`, `forbids`)
  and combined over category-tagged union. Secondary: case-insensitive
  variant, reported alongside.
- **M2 — semantic fidelity.** cosine(nomic-embed-text(x.prompt.raw[:4000]),
  nomic-embed-text(ficha′.prompt[:4000])). **Null distribution:** all
  mismatched pairs within the arm (48×47 cross-cosines). A node's M2
  is interpretable only as position vs the null; pass = above the
  null's 95th percentile. Raw cosines reported but never headline.
- **M3 — rule survival.** Original rule r survives if max over ficha′
  rules r′ of token-Jaccard(r, r′) ≥ 0.5 (tokens = lowercased
  alphanumeric words). M3 = surviving fraction. Nodes with zero rules
  are excluded from M3 aggregates (reported as `no_rules`).
- **Echo / circularity guard.** Fraction of x's contract keys and rule
  substrings (≥12 chars) appearing verbatim in code′ **comments**. If
  mean echo > 0.3, M1 is partially measuring string-copying; the
  robustness sub-arm (first 10 sample ids in id order, comments
  stripped before G, Arm A only) reports ΔM1 to bound the effect.
  Export names appearing in code are *expected* (that is what compiling
  a contract means) and not counted as echo.

## 6. Arms

| Arm | F (intent→code) | G (code→intent) | Question |
|---|---|---|---|
| **A** | qwen2.5-coder:7b (local) | qwen2.5-coder:3b (local) | The deployable floor today |
| **B** | frontier subagent (exact compile prompt) | qwen2.5-coder:3b (local) | Does a frontier F close the gap? |
| **C** | frontier subagent | frontier subagent (exact ingest prompt) | The $0-marginal ceiling |

Arms B/C use the *real* prompt assemblers (the prompts `compile run` /
`ingest` would send), so only the model varies — architecture held
constant. Full 48-node sample for every arm.

## 7. Cold-reader test (altitude legibility)

3 cold subagents receive ONLY the intent layer — for each of the 228
nodes: id, label, `prompt.raw`, contract keys, grouped by source
directory; **no code, no docs, no README** — and answer: (Q1) what is
this system? (Q2) its principal capabilities? (Q3) what breaks if the
`src/walker/` subgraph is deleted?

**Pre-registered rubric — 4 capability families:**
1. intent-graph kernel (typed nodes/edges, events/audit, proposals)
2. compiler intent→code via LLM (F)
3. code→intent lift + round-trip verification (G / Legend)
4. workflow runtime verify-refine (ζ) and/or interactive TUI walker

A reader passes if it names ≥3/4 families in Q1+Q2; the **layer
passes** if ≥2/3 readers pass. Q3 is scored loosely (names walker UI
functions lost, kernel intact) and reported qualitatively. Verbatim
reader quotes recorded in the report.

## 8. Hypotheses, thresholds, falsifiers

Anchored to the strongest current controls (per the H1-recalibration
lesson): Move 3α Arm A grounding mean Jaccard ≈ 0.56; contract column
pass-rate 0.726 (2026-06-09, archived May regens).

- **H-C1 (counit on live fichas):** median structural Jaccard ≥ 0.40
  and contract pass-rate ≥ 0.726 (live fichas carry O1 signatures; they
  should not measure *worse* than the May archive).
  *Falsifier:* median Jaccard < 0.25 → live 3b-tier fichas are weaker
  than the archived pipeline → ficha quality is the binding gap.
- **H-U1 (unit floor, Arm A):** median combined M1 ≥ 0.5 (contracts are
  explicit in fichas; they should survive the loop better than code
  structure survives the counit loop).
  *Falsifier:* median M1 < 0.3 → today's fichas do not survive their
  own loop → ficha refinement outranks all compiler work in the queue.
- **H-U2 (semantic):** ≥ 70% of Arm A nodes beat p95(null) on M2.
- **H-ARM (attribution decision rule):** ΔM1 = median(B) − median(A):
  ≥ +0.15 → **model bottleneck** (espera/escala el modelo);
  < +0.05 → **architecture bottleneck** (invierte en fichas/contexto);
  in between → mixed; C−B isolates G's share of the gap.
- **H-S7 (frontier-ficha advantage):** median M1(S7) ≥ median M1(S1–S6)
  + 0.10 — frontier-extracted fichas round-trip better (proxy for the
  "human/frontier-refined fichas enlarge the kernel" hypothesis).
- **H-COLD:** the layer passes the rubric. *Falsifier:* ≤1/3 readers
  pass → the intent layer does not carry altitude meaning → hierarchy/
  ficha narration refinement outranks regeneration work.

**Kernel membership (per node, graded T2):** Arm A M1 ≥ 0.6 AND
M3 ≥ 0.5 (or `no_rules`) AND M2 > p95(null) AND Fase 1 verdict ∈
{ε-equivalent, divergent_loc}. The report lists members as
**"estructuralmente regenerable (T2)"** — explicitly NOT behavioural
proof. The altitude condition (H-COLD) applies at layer level and is
reported as a separate column, not folded into the per-node bit.

## 9. Simplification candidates (read-only, measure-before-construct)

- **Merge candidates:** embedding near-duplicates (cosine > 0.95 over
  the existing `.ontology/embeddings/index.json`) + provides-key
  overlaps. Honest note: co-change history is nearly useless on a
  1-day-old graph populated in batches; recorded, not interpreted.
- **Split candidates:** ficha length (prompt chars) distribution vs
  Fase 1/2 fidelity — the hypothesis that oversized fichas hide
  multiple intentions is *generated* here, tested in a future run.
- Output: candidate tables for human review in the Walker. **No
  mutation, no proposals, no auto-merge.**

## 10. Cost & wall-clock budget

$0 marginal (local Ollama + session subagents). Estimates: Fase 1
~1.5–2.5h; Fase 2 Arm A ~2–3h; Arms B/C ~1–2h (parallel); cold-reader
+ simplification < 30 min. Sequential local total expected ~4–6h,
within the 8h partial-stop rule.

---

## AMENDMENT A1 — 2026-06-12, pre-data

> Registered during harness smoke, **before any Fase 1/2 metric was
> computed**. Changes the F mechanism, nothing else.

Two architectural facts surfaced while building the harness:

1. `compile run` walks the full `depends_on` topological plan: upstream
   steps compile first, but `depends_on` artifacts are **not** threaded
   into the focal prompt (only `refines` parents are — and the live
   graph has zero `refines` edges; see `compile-plan-runner.ts`
   comment, "Other edge types … are NOT threaded into system today").
   Upstream compiles are therefore pure wall-clock cost with no effect
   on the focal artifact. Empirically: 37/48 sample nodes have
   multi-step plans; the smoke capture caught upstream prompts, not
   focal ones.
2. The F actually calibrated in every Phase ε measurement is
   `verify-homeomorphism`'s **compile-back** (single dispatch per node,
   `--ast-grounding`). H-U1's anchor (Move 3α Δ = +0.355) presupposes
   that F, not the plan-walking `compile run`.

**Protocol change (Fase 2 F, all arms):** F = the verify-homeomorphism
compile-back (with grounding), not `compile run §5`. Consequences:
(a) Fase 1's regen artifact **is** Fase 2's code′ — unit and counit
are measured over the same F application, which is the coherent
reading (both triangle distances share F(ficha));
(b) arms B/C capture/replay the compile-back prompt via the wire shim
(`OLLAMA_HOST` pointed at it), real pipeline otherwise unmodified;
(c) supplementary bonus beyond the pre-registration: B/C replay also
yields a *frontier counit* reading (verify verdicts under frontier F),
reported as supplementary — it does not substitute H-C1's local arm.

No thresholds, metrics, sample, hypotheses, or falsifiers change. The
superseded `compile run` captures are archived in
`capture-F-superseded-compile-run/` for audit.
