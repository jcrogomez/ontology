# Pre-registration — Foreign-corpus extraction-gap vs capacity classifier study

**Status: PRE-REGISTERED, NOT YET RUN (2026-07-21). Do not edit hypotheses or
the decision rule after the first run — append results below the line.**

Goal: turn the n=3 foreign-repo pilot (E1/E2/P3, memory
`project_e1_foreign_repo_dequal`) into a measured result — a confusion matrix of
the disagreement router's extraction-gap vs capacity-ceiling call against an
INDEPENDENT ground truth, over a systematically-sampled corpus of code the
author did not write, with an ablation isolating the 2026-07-21 `semanticSplit`
signal's contribution.

The publishable claim under test (deliberately NOT categorical — T-honest):
*For bespoke intent, the binding constraint on LLM code regeneration is
specification (ficha) quality, not model capability; for canonical intent model
priors substitute; and a cheap draw-disagreement instrument separates the two.*

## 1. Independent variable: the bespoke↔canonical axis

8 small OSS repos (TS/JS, single-purpose, testable), spanning the axis. JS is
accepted (single-file `onto ingest` handled it in E1/E2; static-edge inference
is TS-only but irrelevant to single-node analysis — recorded as a scope note).

| # | repo | pole (a priori) | why |
|---|------|-----------------|-----|
| 1 | `lukeed/dequal` | canonical | deep-equal is textbook; strong model priors |
| 2 | `lukeed/klona` | canonical | deep-clone, canonical |
| 3 | `lukeed/dset` | bespoke | deep-set path-creation semantics are library-specific |
| 4 | `lukeed/clsx` | bespoke | classnames coercion rules are idiosyncratic |
| 5 | `sindresorhus/query-string` | bespoke | arrayFormat conventions (E2 anchor) |
| 6 | `sindresorhus/slugify` | mid | custom replacements/separators |
| 7 | `vercel/ms` | bespoke | time-string parse/format conventions |
| 8 | `npm/node-semver` (compare+ranges subset) | mid | precedence semi-canonical |

Target N ≈ 30–50 nodes. `dequal`/`query-string` are re-used from the pilot.

## 2. Sampling (anti-selection-bias, pre-registered)

Per repo: enumerate exported top-level symbols via the AST scanner. Keep a node
iff (a) `onto probe` builds a **≥3-case** source-validated fixture for it, and
(b) source + a trivial regen both LOAD. Take ALL qualifying nodes if ≤8/repo,
else a fixed pseudo-random 8 (seed = repo name, recorded). **Every dropout is
logged with reason** (no-fixture / no-load / <3 cases / trivial). The denominator
is reported honestly: the pipeline speaks only about testable nodes — a stated
external-validity limit, not hidden.

## 3. Models (the ladder)

- Weak `W` = `qwen2.5-coder:7b` (local). The instrument's operating point and
  the capacity floor. 8 GB local throughput is the binding compute cost.
- Strong `S` = `gpt-oss:120b-cloud` ($0 free tier; `qwen3-coder:480b` RETIRED by
  Ollama 2026-07-15 — the pilot's cloud rung is dead).
- The probe/oracle-ficha generator = `S` (a fixed capable model, not hand-authored
  — removes the "author wrote the spec after seeing the code" confound from the
  LABEL procedure; see §4).

## 4. Ground truth — a 2×2 intervention per node (INDEPENDENT of the instrument)

Two ficha conditions × two models. The behaviour oracle is ONE fixture per node,
built once from source (`onto probe`, source-vs-source validated), fixed across
all cells. "Pass" = behaviour PASS on that fixture (best-of-K draws).

- **Extracted ficha `E`** = normal `onto ingest` output (the G we ship).
- **Oracle ficha `O`** = `S` given the FULL source, prompted for a complete
  generative spec (uniform procedure — reproducible, source-informed, blind to
  the instrument). Using privileged info is legitimate for a LABEL.

Cells (K=5 for the baseline so it doubles as the instrument input; K=3 elsewhere):
- C1 = regen(E, W) — baseline (the 5-draw run; also feeds the instrument, §5).
- C2 = regen(O, W) — does a COMPLETE SPEC fix it at the weak model?
- C3 = regen(E, S) — does a STRONGER MODEL fix it from the thin spec?
- C4 = regen(O, S) — ceiling / validity check on the oracle ficha.

**Pre-registered label rule** (fixed; do not amend):
- Include only nodes where **C1 fails** (best-of-5). C1-pass nodes are recorded
  as `closes-at-baseline` and excluded from the matrix.
- If **C4 fails** → `hard/unresolved` (ground truth unestablishable at this
  ladder or the oracle ficha is inadequate) → excluded from the primary matrix,
  reported separately.
- Given C4 passes:
  - C2 passes → **extraction-gap** (a complete spec closes it at W; spec was binding).
  - C2 fails ∧ C3 passes → **capacity-ceiling** (spec didn't help W; a stronger
    model closed it from the thin spec — capability/priors were binding).
  - C2 fails ∧ C3 fails → **both** (needs better spec AND better model).
- **Canonicality flag** = C3 passes from the THIN extracted ficha (the model's
  priors substitute for the spec — the dequal confound). Recorded per node.

## 5. Instrument prediction (the SHIPPED router, unchanged)

From C1's 5-draw `--behavior-check` run, take the gray-zone fold and run the
actual `classifyPlateauWithEvidence` → prediction ∈ {extraction-gap,
capacity-ceiling} with evidence ∈ {behaviour-split, semantic-split,
draw-disagreement, clean-lint, draw-agreement, dirty-or-unknown-lint}. No
privileged info — only what a live `onto execute` sees.

## 6. Analyses & pre-registered hypotheses

Primary matrix: instrument prediction × ground-truth {extraction-gap,
capacity-ceiling}. Report precision/recall/F1 for **extraction-gap detection**.
Secondary matrix folds `both` into extraction-positive.

- **H1 (usefulness):** extraction-gap F1 > **0.60**. Falsifier: F1 ≤ 0.60 ⇒ the
  router is not a useful classifier at scale; report it.
- **H2 (the contribution — ablation, THE money result):** classify the SAME C1
  data twice — router WITH `semanticSplit` vs router WITHOUT it (declKey +
  behaviorSplit only, i.e. the pre-2026-07-21 logic). Pre-registered prediction:
  semanticSplit raises extraction-gap **recall**, and the gain concentrates in
  the **bespoke stratum** (structure agrees, all draws fail differently).
  Falsifier: ΔRecall ≤ 0 ⇒ the signal I built does not matter at scale.
- **H3 (the confound):** on canonical-flagged nodes the two levers are
  confounded (both C2 and C3 tend to pass); the instrument's disagreement is
  expected LOW (unanimous) there. Pre-registered: analyse canonical nodes
  SEPARATELY; do not score instrument "errors" against an ambiguous label.
- **Causal-flip replication:** count nodes with C1-fail → C2-pass (spec closes
  it, model held fixed). This scales the pilot's n=1 query-string flip to n=many
  — the paper's core existence-claim, now with a rate.

## 7. Validity checks (address the pilot's soft spots)

- **Oracle strength (mutation scoring):** on a random 20% of fixtures, inject k
  known mutations into the source and report the fixture's kill rate. Low kill
  rate ⇒ "PASS" is weak evidence ⇒ caveat. Pins weakness #3 from the pilot.
- **Load-rate / evaluatedDraws:** report per node how many of 5 draws ran cases;
  the `semanticSplit` floor needs ≥3. Nodes below the floor are a known blind
  spot — reported, not hidden.
- **Variance:** the baseline is best-of-5 to defang single-draw 7B variance;
  record per-draw outcomes so the matrix can be recomputed at other K.

## 8. Harness (deterministic CLI pipeline; not a multi-agent workflow)

A driver script iterates repos → nodes and, per node, emits ONE JSON record:
`{repo, nodeId, sourceRel, dropped?, fixtureCases, evaluatedDraws,
cells:{C1,C2,C3,C4:{passed, perDraw[], grayZone}}, canonical, gtLabel,
instrument:{withSemantic, withoutSemantic, evidence}}`. Each cell is an
`onto regenerate ... --draws K --behavior-check --json` call (isolated kernel per
repo, deps npm-installed so oracles load — the E1/E2 recipe). An aggregator reads
the records → confusion matrices + P/R/F1 + the H2 ablation delta + the
canonicality stratification + the mutation-kill rate. All records are the dated,
immutable evidence; the aggregator is pure and re-runnable.

## 9. Compute budget (honest)

≈17 model calls/node (1 ingest + 1 oracle-ficha + 1 probe + 5 + 3 + 3 + 3). At
N=40: ~680 calls. The 8 weak-model draws/node (320 local 7B draws @ ~2–3 min) are
the bottleneck ⇒ ~10–16 h local, spread over nights; cloud cells are $0 but
rate-limited (the B1 quota issue — budget a failover/backoff). No paid tier.

---

*Results appended below this line only. Hypotheses and the §4 label rule are
frozen as of 2026-07-21.*
