# ROUNDTRIP_BILATERAL_2026-06-12 — RESULT

> **Dated record.** Executed per the pre-registration
> [`ROUNDTRIP_BILATERAL_2026-06-12_HYPOTHESIS.md`](ROUNDTRIP_BILATERAL_2026-06-12_HYPOTHESIS.md)
> (incl. Amendment A1, registered pre-data). First measurement of the
> **unit side** of the `G ⊣ F` adjunction (intent → code → intent) over
> the live 228-node graph, alongside an updated counit baseline, a
> three-arm model/architecture attribution, an altitude-legibility
> probe, and read-only simplification candidates. Cost: **$0 marginal**
> (local Ollama + cold session subagents). Sample: 48 nodes (40 main in
> 6 strata + 8 escalated overlay S7). All raw artifacts under
> `.ontology.scratch-roundtrip-2026-06-12/`.

## Headline

The unit side round-trips: on the **main strata**, when F is the local
7B compiler and G the local 3B extractor (Arm A), the contract layer
survives the loop with **median M1 = 0.80 and median `provides`
recovery = 1.0** — the strongest single number the project has on
whether a ficha reconstructs its own contract. Semantic content
survives across every arm (M2 beats the cross-pair null for 92–98% of
nodes). **19 of 48 sampled nodes qualify as structurally regenerable
(T2)** — the first dated kernel-of-equivalence map.

But the experiment's most important result is **methodological and
counterintuitive**: contract fidelity M1 *decreases* as the models get
stronger on the main strata (A 0.80 → B 0.42 → C 0.17), while on S7 it
*increases* (A 0.37 → B 0.26 → **C 0.60**). The two strata cross. The
cause is a reference-frame confound — M1 measures similarity to the
*original* ficha, and the main-strata originals are thin 3B
extractions. A stronger F+G round-trip produces a *richer* ficha than
the thin original, which a similarity metric reads as divergence. **The
binding constraint on the unit side is extraction quality / original
ficha richness, not the compiler F.** This confirms and sharpens the
ROADMAP's standing "next lever = extraction completeness" finding with
direct cross-arm evidence.

## Numbers

### Counit (Fase 1, code → intent → code over live fichas)

48/48 measured, qwen2.5-coder:7b compile-back (`--ast-grounding`),
0 unrecoverable.

- **Structural Jaccard median 0.667** (p25 0.214, p75 1.000). **H-C1
  structural half: PASS** (≥0.40).
- Verdicts: 3 ε-equivalent, 24 divergent_loc, 1 divergent_structural,
  20 divergent_both.
- **Contract axis pass-rate 0.638 (30/47)** — **below** the 0.726 May
  anchor. **H-C1 contract half: FAIL.** Live 3B-tier fichas carry
  weaker contracts than the archived May pipeline. (Signal toward
  architecture/ficha quality, not model — consistent with the unit-side
  finding below.)

### Unit (Fase 2, intent → code → intent), median M1 (contract Jaccard)

| Arm | F / G | main S1–S6 | S7 escalados |
|---|---|---|---|
| **A** | 7B / 3B (local floor) | **0.800** | 0.370 |
| **B** | frontier / 3B | 0.417 | 0.261 |
| **C** | frontier / frontier (ceiling) | 0.167 | **0.600** |

- `provides`-only recovery: Arm A main = **1.0**; Arm C S7 = **1.0**.
- **M2 (semantic cosine vs cross-pair null):** every arm strong — beats
  p95(null) for A 97.5% / B 92.5% / C 97.5% of nodes (main). **H-U2:
  PASS.** Semantic content survives regardless of arm.
- **M3 (rule survival):** **0% in every arm on the main strata, and 0%
  in arms A/B on S7 — survives only in Arm C on S7 (0.43).** Rules
  survive a round-trip only when the extractor is frontier *and* the
  original ficha was rich enough to carry rules. The most fragile
  layer.
- Echo (contract text in regen comments): mean 0.25–0.32 — below the
  0.30 circularity-concern line on main; the verbatim-export component
  is expected (compiling a contract), not laundering.

**H-U1 (unit floor, Arm A median M1 ≥ 0.5): PASS (0.80).**

**H-ARM attribution.** The pre-registered rule ΔM1 = median(B) −
median(A) = **−0.38** maps to "architecture bottleneck" (< +0.05). The
deeper, correct reading — forced by the A>B>C / S7-crossover pattern —
is the **reference-frame confound**: a more capable F+G produces a
re-extraction that *diverges from a weak original* because it is
better. The honest attribution: **the unit-side binding constraint is
the extractor G and the richness of the original ficha**, the two
things the project improves through re-extraction and the Walker
refinement loop — not the compiler.

**H-S7 (frontier-extracted fichas round-trip better): CONFIRMED,
decisively.** On the S7 nodes (whose originals were
governed-escalation frontier extractions), Arm C reaches M1 0.60,
`provides` 1.0, and is the *only* place rules survive (M3 0.43) — a
+0.43 stratum gap vs the main strata in the same arm, far exceeding the
+0.10 threshold. **Ficha quality determines round-trip fidelity**, and
it is the controllable variable. This is the quantified case for the
Walker-as-primary-editing-layer vision: every ficha you enrich enlarges
the kernel.

### Altitude legibility (cold-reader test)

**H-COLD: PASS, 3/3 readers, 4/4 capability families each.** Three cold
subagents given ONLY the 228-node intent layer (no code, no docs) each
independently identified all four families — intent-graph kernel,
LLM compiler F, code→intent lift + round-trip verification G, and the
ζ workflow runtime / TUI walker — with correct node citations, and
converged on Q3 (deleting `src/walker/` costs the cockpit, not the
substrate; `onto walk`/`onto open` would dangle). The intent layer
**carries meaning at altitude**: "what this system is" is readable from
intent alone. (Lower bound — a dump bug blanked all `requires` keys, so
readers passed without the dependency layer.)

### Kernel-of-equivalence map (the deliverable)

**19/48 nodes structurally regenerable (T2)** — best-arm M1 ≥ 0.6 AND
M2 > p95(null) AND Fase-1 verdict ∈ {ε-equivalent, divergent_loc}:

```
node_0009 0017 0022 0026 0058 0146 0156 0131 0176 0109
          0181 0186 0196 0202 0217 0221 0223 0225 0227
```

By stratum: S1-núcleo 4/6, S6-walker 5/8, S7-escalados 4/8, S3-runtime-F
2/6, S4-runtime-G/ζ 2/6, S5-runtime 1/6, **S2-comandos 1/8** (the CLI
command wrappers round-trip worst — argument-parsing + side-effecting
glue, the predicted resistant region). Best-arm among kernel members:
15 via Arm A, 3 via C, 1 via B — most of the kernel is reachable with
the **local $0 stack today**.

**Grading is explicit:** kernel = *structurally* regenerable. M1/M2 are
contract + text-semantics; behavioural equivalence beyond the existing
fixtures corpus was out of scope (pre-registration §1). The label is
"estructuralmente regenerable (T2)", not behavioural proof. §3.10 stays
**T2** — this is the first measurement of the unit triangle's tolerance,
not a theorem.

## Taxonomy of loss (where meaning evaporates)

1. **Rules (cross-cutting invariants / acceptance criteria): ~total
   loss.** 0% survival everywhere except frontier-G-on-rich-fichas.
   Rules are not export signatures, so they do not manifest in code as
   anything a generic extractor recovers (e.g. node_0098's "Axiom 8:
   contradictions must become validation failures" → `rules: []`). The
   biggest single gap; argues for a rules-aware extraction channel.
2. **CLI command glue (S2): worst stratum, 1/8 kernel.** Argument
   parsing, side effects, and IO boundaries round-trip poorly — the
   pre-registered "resistant region", confirmed.
3. **Contract reference-frame poverty.** Thin original fichas cap the
   *measured* round-trip even when the actual regeneration is good —
   the confound above. The fix is upstream: richer fichas (re-ingest
   with O1 signatures / frontier extraction / human Walker refinement).
4. **Hardest files (S7 source: cli.ts, workflow schemas,
   behavior-checker).** Even frontier extraction had 2 residual
   parse/schema failures here (node_0221, node_0227 in arm B). Large
   multi-export modules remain the recall frontier.
5. **Honest failure accounting:** Arm A 1 extraction failure
   (node_0224, 3 attempts, stays in denominator); cross-arm JSON-retry
   counts low (0–4 total). Two frontier regens emitted literal NUL
   bytes (` ` as sort-key separators) — repaired to the 6-char
   escape, pre-NUL-guard.

## Simplification candidates (read-only, measure-before-construct)

- **15 embedding near-duplicate pairs** (cos > 0.95) and **160 shared
  `provides` keys across nodes** — real SSoT compression pressure, the
  raw material for governed merge proposals in the Walker.
- Co-change: **no-data** (graph is 2 days old, batch-populated) —
  recorded, not interpreted; re-measure after weeks of Walker edits.
- Longest ficha: `cli.ts` (node_0221, 6.4 KB) — a split candidate by
  the length heuristic. **No mutation performed; candidate tables only.**

## What this closes and what remains

**Closes:** the unit side of `G ⊣ F` is now measured (was never
measured pre-2026-06-11); §3.10 carries a first empirical unit-triangle
tolerance band; the kernel map exists and is dated; the binding
constraint is identified (extraction/ficha quality) with clean
cross-arm attribution; altitude legibility is demonstrated.

**Remains (deferred, per pre-registration):** triangle-identity
tolerances and contraction iteration (F∘G)² were out of scope;
behavioural-probe generation from contracts (to upgrade kernel nodes
from structural→behavioural T2); multi-node composition (gluing's
contribution to F); `onto regenerate <node>` as the governed lever that
turns the map into daily practice. The reference-frame confound means a
future run should measure M1 against a *frontier-extracted reference
ficha*, not the live 3B original.
