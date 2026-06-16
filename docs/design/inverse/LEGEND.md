# LEGEND — release notes for the inverse-functor cycle

> **Historical release note (0.4.0, 2026-05-13).** Preserved as written.
> It predates the Phase ε close (2026-05-26) and Phase ζ (the workflow
> runtime). For current phase state and open work see
> [`ROADMAP.md`](../../ROADMAP.md); any "what's next" below is as-of-0.4.0.

> *Legens* — "the one who reads." A legend, on a map, is the key that
> tells you how to read the territory. This document is that key for
> Project Legend: the operational construction of the inverse of the
> compile functor, the data points that anchor it, and the protocol
> layer it unlocks.

**Version:** 0.4.0 (release candidate). **Date:** 2026-05-13.
**HEAD:** `f80163d` + cross-provider routing + advisory lock + Walker v2
proposal review pane + task-aware cost-estimate.

This release note covers γ-0 through δ-2 — Phase ε (self-ingestion
of the Ontology codebase, the publishable adjunction measurement) is
the next active stream and remains gated on API credit. An Ollama
dry-run of Phase ε is the immediate next checkpoint and lands as a
follow-up under this same release line.

---

## 1. What shipped in this release line

The forward compile functor `F : Intent → Code` and its approximate
inverse `G : Code → Intent` are both operational. Two external
empirical data points anchor the round-trip claim:

| Data point | Corpus | Setup | Result | Cost |
|---|---|---|---:|---:|
| γ-2 | `src/kernel/core/integrity/hash.ts` (one file) | Claude Opus 4.7 end-to-end | **5 / 5 functions ε-equivalent** under F ∘ G | ~$0.08 |
| γ-7 | [Julius-Woo/Vibe-Reasoning](https://github.com/Julius-Woo/Vibe-Reasoning) (24 Python files) | Two-pass `onto verify-homeomorphism` with γ-7 prompt invariants | **36% → 65% ε-equivalent** (+29 pp); `divergent_both` fully eliminated (4 → 0) | ~$2.28 |

Full reports: [`HASH_TS_2026-05-12.md`](../../legend/calibrations/HASH_TS_2026-05-12.md)
and [`VIBE_REASONING_GAMMA_7_2026-05-12.md`](../../legend/calibrations/VIBE_REASONING_GAMMA_7_2026-05-12.md).

### Surfaces that landed

| Phase | Surface | Commits |
|---|---|---|
| α (plasticity) | `node update / remove`, `edge update / remove`, validator-gated `compile run`, `--requires/--provides/--forbids/--rules` on `node create` | `dfbefa9`, `e847417`, `1a8a4c3`, … |
| β-1 | `onto compile run-batch`, `compile run --target / --force` | `a09e1d7`, `157d367`, `2cbaa32` |
| β-2 | `node.literal` escape hatch | `04f730c` |
| β-3 | `computeFiberBy(input, projection)` + `pathProjection` | `881506a` |
| γ-0 | Anthropic adapter with prompt caching (Opus 4.7 default) | `aad0fed` |
| γ-1 | `onto ingest <file>` v0+ with `--dry-run` | `b670ca3` |
| γ-2 | `hash.ts` calibration — first empirical data point | `ac0a45f` |
| γ-3 | Rich `node_create` proposal payload (manifestation, language, requires, provides, forbids, rules, literal, sourceFiles) | `7d50c91` |
| γ-4 | TypeScript static-edge inference via the TS compiler API; Python via regex | `62d8c86`, `bad6840` |
| γ-5 | `onto ingest <directory>` multi-file with `--include` | `a25ade9`, `bc350ce` |
| γ-6 | `onto graph infer-edges --create-proposals` | `9c16b9d` |
| γ-7 | MANDATORY EXPORTS block in `assembleContext`; comprehensive `provides` capture in the ingest extractor | `2e8853e` |
| γ-7 measurement | Vibe-Reasoning external calibration | `7abd73e` |
| δ-1 | `onto node inspect` (Inspector / Lupa) with `translator` cached on the node | `8779acc` |
| δ-2 | `onto verify-homeomorphism` with dual distances (LoC + structural Jaccard) and a five-label verdict | `29b330c` |
| post-γ-7 tooling | 5 tooling-gap fixes + 5 reviewer fixes | `6ea7e94`, `b035ce7` |
| post-γ-7 routing | Cross-provider per-task routing (Anthropic / Ollama with their own per-task tables) | `f80163d` |
| post-γ-7 hardening | Task-aware cost estimate; `.ontology/.lock` advisory lock; Walker v2 PR-1 proposal review pane | `e43b2cc`, `b2193bf`, this commit |

Pre-foundation work (Bootstrap 0.1–0.9: kernel, context assembler,
proposal system, walker v0/v1, categorical extensions, validator
port onto the topos algebra) lives in [`RELEASE_NOTES.md`](../../RELEASE_NOTES.md).

---

## 2. What you can do now

For a brownfield codebase (the canonical Phase ε target):

```sh
# 1. Initialise an Ontology project alongside (or inside) your source.
onto init

# 2. Pre-flight cost — zero API call. Honest per-task pricing as of
#    the cross-provider routing fix.
onto ingest /path/to/your/src --include ts --provider anthropic --cost-estimate

# 3. Ingest. Per-task routing picks Sonnet 4.6 for semantic_parse
#    automatically; no --model flag needed.
onto ingest /path/to/your/src --include ts --provider anthropic --json > ingest.json

# 4. Apply the proposals (or review them in the walker).
onto walk node_0000_canon   # then :proposals + a/r/d/Esc
# or
for p in $(onto proposal list --json | jq -r '.proposals[] | select(.status=="pending") | .id'); do
  onto proposal apply "$p"
done

# 5. Infer static-edge proposals, apply.
onto graph infer-edges /path/to/your/src --include ts --create-proposals
# (apply loop again)

# 6. Inspector — read each node's intent in 30 seconds with a cached
#    one-LLM-call-per-node summary.
onto node inspect node_0042

# 7. Measure the round-trip on every code node.
onto verify-homeomorphism --all-artifacts \
  --provider anthropic --max-tokens 16384 \
  --report docs/legend/calibrations/MY_SWEEP_$(date +%F).md \
  --json > sweep.json
```

The `--report` flag writes a markdown summary alongside the JSON
output — the same shape used to author the γ-2 and γ-7 reports.

For a greenfield codebase: the forward functor (`onto compile run`)
has been operational since Bootstrap 0.8; Project Legend adds the
inverse direction and the tooling around it.

---

## 3. Mathematical claims, tiered

[`MATHEMATICAL_CLAIMS.md`](../../MATHEMATICAL_CLAIMS.md) classifies every
formal claim in the project into four tiers:

- **T1** strictly implemented and tested against a law (e.g. monad
  laws on `Effect<T, E>`, partition property on `computeBranchFiber`).
- **T2** operationally implemented with explicit semantics (e.g.
  `assembleContext` as a presheaf section, the topos predicate
  algebra over node rules).
- **T3** useful analogy without a formal correspondence (e.g.
  "compile is functorial" — the object map is functorial; the
  morphism map is an axiom of the codebase, not a proven theorem).
- **T4** aspirational — the claim is in the design documents but
  not yet operational at the scale required (e.g. §3.10 adjoint
  pair).

§3.10 — the headline adjoint claim `F ⊣ G ≈ id_Code` — stays **T4**
in this release. The two data points (γ-2, γ-7) are supporting
evidence, **not** a measured subcategory of the Ontology codebase
itself. Phase ε is the canonical measurement; the tier upgrades to
T2 the moment a Phase ε run lands `docs/legend/calibrations/SELF_INGEST_<date>.md`
with a non-trivial ε-faithful fraction over a meaningful n.

### Phase ε framework

The framework for any Phase ε run lives in
[`docs/POSITIONING.md`](../../meta/POSITIONING.md): the devtools-first positioning,
the six-axis measurement matrix
($\mathcal{C}_{\text{faithful}}^{(\text{axis})}$ for contract,
structural, behavior, intent, literal-required, and cost-per-provider),
the multi-label frontier taxonomy, the pre-registration template, and
the human-authorship boundary statement. Concrete run hypotheses live
in dated `docs/legend/calibrations/SELF_INGEST_HYPOTHESIS_<date>.md`
files; each one is committed before its run so `git log` proves the
prediction predates the result. The first one,
[`SELF_INGEST_HYPOTHESIS_2026-05-13.md`](../../legend/calibrations/SELF_INGEST_HYPOTHESIS_2026-05-13.md),
targets `src/runtime + src/core + src/commands + src/schemas` (~117
TS/TSX files) and pre-registers the faithful/resistant frontier
prediction. The $0 tooling that makes the matrix output meaningful is
spec'd in
[`docs/legend/PREWORK_2026-05-13.md`](../../archive/PREWORK_2026-05-13.md) and
ships under `src/runtime/legend/{frontier-tagger,matrix,matrix-intersections}.ts`,
exposed through `onto ingest <paths…>` (multi-positional) and `onto
verify-homeomorphism --matrix`.

---

## 4. Two things this release is NOT

**Not a benchmark paper.** Two external corpora are not a
distribution. A reviewer who reads §3.10 as anything stronger than
"the pipeline works end-to-end on these corpora" is reading more
into it than the data supports.

**Not Phase ζ.** The Open-Prompt protocol (sign / verify-published
/ replay) is specified in [`OPEN_PROMPT.md`](../proposals/OPEN_PROMPT.md) but is
not implemented in this release. The protocol design is stable
enough to publish as a seed; the v1 implementation lands in the
0.5.0 line after Phase ε ships the data the spec presumes.

---

## 5. Known limitations carried into 0.4.0

- **Phase ε publishable measurement is not in this release.** It
  depends on Anthropic API credit and is gated by the operator.
  An Ollama dry-run lands first as `SELF_INGEST_PILOT_<date>.md`
  for mechanical validation at zero cost.
- **Cross-host advisory lock breaking is disabled.** The lock
  refuses to break a file from another host because liveness can't
  be probed remotely. Manual `rm .ontology/.lock` is the explicit
  opt-in, after the operator confirms the remote process is gone.
- **Cost-estimate is an upper bound.** The tokenizer heuristic
  (~3.5 chars/token) and the fixed 400-token-per-file output
  estimate over-quote for highly compressible code and
  under-quote when extractor outputs run long. Treat the reported
  number as ±30% of reality.
- **Open-world validation is a degradation, not a fix.** When
  ingest-derived contracts reference external dependencies, the
  validator can drop the failure to a warning under `--open-world`.
  This is the safe default for verify-homeomorphism but it means
  some intent-faithful violations are silent. Closed-world is
  available with `--no-open-world`.
- **The Anthropic adapter retries 429 / 408 / 5xx with jittered
  backoff (up to 3 attempts).** Other 4xx errors (auth, balance,
  malformed request) are surfaced immediately — that's correct
  default, but worth knowing if a sweep stops on a 400.
- **`onto sign`, `onto verify-published`, `onto replay` (Phase ζ)
  are spec-only** — see OPEN_PROMPT.md for the contract; no code
  ships in this release.

---

## 6. What to read next

If you want to **understand the math** before the code:
- [`MATHEMATICAL_MODEL.md`](../laws/MATHEMATICAL_MODEL.md) — the seven
  axioms made formal.
- [`CATEGORICAL_VISION.md`](../laws/CATEGORICAL_VISION.md) — the four
  categorical extensions (Yoneda search, effect monad, Grothendieck
  fibration, topos predicate algebra) and where each lives in code.
- [`MATHEMATICAL_CLAIMS.md`](../../MATHEMATICAL_CLAIMS.md) — the honest
  tier ledger.

If you want to **start using the system**:
- [`README.md`](../../../README.md) — quickstart.
- [`GETTING_STARTED.md`](../../GETTING_STARTED.md) — walkthrough.
- [`CLI_COMMANDS.md`](../../CLI_COMMANDS.md) — every command, every flag.

If you want to **read Project Legend specifically**:
- [`PROJECT_LEGEND.md`](PROJECT_LEGEND.md) — the design document.
- [`OPEN_PROMPT.md`](../proposals/OPEN_PROMPT.md) — the Phase ζ protocol spec.
- [`legend/calibrations/`](../../legend/calibrations) — the two empirical
  data points (γ-2 + γ-7) and the Vibe-Reasoning runbook.

If you want to **contribute**:
- [`ROADMAP.md`](../../ROADMAP.md) — the open follow-ups.
- [`POST_GAMMA_PLAN.md`](../../archive/POST_GAMMA_PLAN_2026-05-13.md) — the detailed plan
  for Phase ε / ζ / Hardening / Walker v2.
- [`reviews/`](../../reviews) — the daily milestone audits.

---

## 7. Acknowledgements

The Cowork sandbox review agent has been the second reader on
nearly every commit in this release line. The five reviewer fixes
landed in `b035ce7` (async-def regex, event emission for δ-1 / δ-2,
jittered retry backoff, translator hash includes literal, Option C
confirmation) came from that channel.

The two external corpora — `hash.ts` (internal calibration) and
Julius-Woo/Vibe-Reasoning (real-world Python from an IMO P6 LLM
session) — are the load-bearing data behind every empirical claim
in this document.

---

*This release note is generated from the git history and the
calibration reports; if it disagrees with what's actually on `main`,
the commits win. Re-run `git log` against the cited hashes if
anything looks off.*
