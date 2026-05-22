# Empirical brújula validation — protocol

Companion to `HIERARCHY_BASELINE_2026-05-22.md`. The baseline established
`closedWorldContextReachableSatisfaction` as the brújula and showed via
simulation that materializing `depends_on` / `uses_token` edges moves it
from 0.519 → 1.000 on the gamma snapshot. This document is the procedure
for testing whether the **simulated** brújula movement predicts a
**real** improvement in regeneration quality.

The harness (`onto graph materialize-edges`) lands today; the LLM
dispatch (`onto verify-homeomorphism`) is the gated next step.

## 1. The setup is built

`onto graph materialize-edges <src-ontology-dir> <dst-ontology-dir>
--source-root <code-dir>` produces a self-consistent ontology copy:
verbatim nodes, original edges + the resolved inferred edges, original
events.jsonl + one `edge_created` event per applied edge, an updated
state.json with the new counts. Read-only on the source.

The dry run against gamma:

```bash
onto graph materialize-edges                              \
  .ontology.self-ingest-gamma-result /tmp/gamma-with-edges \
  --source-root src
```

→ 348 edges applied, 217 skipped (197 `from_node_missing` + 20
`to_node_missing` — drift between the gamma ingest and the current src/
tree). The same numbers `infer-edges --metrics-preview` already
predicted, now materialised on disk.

Confirmation that the brújula moved in reality (not just in
simulation):

```text
onto graph metrics --ontology-dir /tmp/gamma-with-edges
  → closedWorldContextReachableSatisfaction: 1.000
  → closedWorldGlobalSatisfaction:           1.000
  → edgeCount:                               348
  → verdict:                                 flat  (topology unchanged)
```

Readiness gate on the copy: 2/3 rules now pass. Only `topologically_flat`
still trips — the hierarchizer is the next intervention for that one,
and the baseline's roadmap demoted it to "third move" after this
validation.

## 2. The empirical question

The brújula is a structural proxy: "every closed-world require has a
provider reachable by the assembler's default walk." It does not
directly measure whether the LLM generates code that compiles. The
empirical test:

> Does the assembler, fed the new edges, build prompts that produce
> regenerated code closer to the original than what it would have built
> on the un-materialised graph?

`onto verify-homeomorphism` is the existing measurement: it
compiles-back a node and computes two distances against the original
source — LoC delta and structural Jaccard — then folds them into a
verdict (`ε-equivalent` / `divergent_loc` / `divergent_structural` /
`divergent_both` / `unrecoverable`). One LLM dispatch per node.

The two-cell A/B is:

| ontology source                          | verdict distribution |
| ---------------------------------------- | -------------------- |
| `.ontology.self-ingest-gamma-result`     | baseline             |
| `/tmp/gamma-with-edges`                  | with-edges           |

Confirmation: the with-edges cell shifts the distribution toward
`ε-equivalent` (or away from `divergent_structural`). Refutation: the
two cells are statistically indistinguishable — meaning the brújula is
not a useful predictor and the precision problem lives elsewhere
(vocabulary, prompt phrasing, directionality, or a non-default edge
type the assembler does not walk).

## 3. Cost surface

`onto verify-homeomorphism --cost-estimate --all-artifacts --provider
anthropic --model claude-sonnet-4-6` against `/tmp/gamma-with-edges`:

```text
Files:    125
Tokens:   ~241k input, ~50k output (est)
Cost:     $1.47 total (Sonnet 4.6 rate)
Per file: top 5 land at $0.03–0.05 each
```

Three feasible dispatch profiles:

| profile                                 | cost      | signal                              |
| --------------------------------------- | --------: | ----------------------------------- |
| 1-node spot check (Ollama, local)       |     $0.00 | qualitative only — local model noise dominates |
| 5–10 sample nodes (Sonnet 4.6)          |     $0.20 | small-n distribution per cell       |
| Full sweep both cells (Sonnet 4.6)      |   $2.94   | publishable comparison              |

**Recommended sample for the small-n profile**: the nodes whose
unreachable closed-world requires were the largest contributors in the
gamma baseline — `loadEdges` (consumers=7), `loadNodeById` (5),
`loadState` (4), `errorMessage` (3), `loadNodes` (3). One representative
consumer per top require is roughly 5–7 nodes, lands within the $0.20
budget, and pre-registers the targets the brújula intervention should
help most.

## 4. Procedure

Both cells must run with the same provider, model, thresholds, and
seed-equivalent settings — the contracts module passes
`closedWorldGlobalSatisfaction` = 1.0 in both, so any verdict delta
attributable to the edges is what we are measuring.

### 4.1 Pre-flight

```bash
# Both cells share the source root.
SRC_ROOT="$(pwd)/src"

# Cell A — gamma baseline (read-only).
GAMMA_BASE=".ontology.self-ingest-gamma-result"

# Cell B — gamma + materialized edges.
GAMMA_EDGES="/tmp/gamma-with-edges"
onto graph materialize-edges "$GAMMA_BASE" "$GAMMA_EDGES" \
  --source-root "$SRC_ROOT"

# Confirm the brújula actually moved in cell B.
onto graph metrics --ontology-dir "$GAMMA_EDGES" --json \
  | jq '.metrics.contracts.closedWorldContextReachableSatisfaction.ratio'
# expected: 1.0
```

### 4.2 Dispatch (per cell)

Each cell needs its own working project. The simplest layout is a
sibling temp dir with a symlinked `.ontology` and `src/`:

```bash
mkdir -p /tmp/cell-a /tmp/cell-b
ln -s "$(realpath "$GAMMA_BASE")"  /tmp/cell-a/.ontology
ln -s "$(realpath "$GAMMA_EDGES")" /tmp/cell-b/.ontology
ln -s "$(realpath "$SRC_ROOT")"    /tmp/cell-a/src
ln -s "$(realpath "$SRC_ROOT")"    /tmp/cell-b/src

# Pick the sample (one consumer per top unreachable require).
SAMPLE_NODES="node_0001,node_0042,node_0070,…"   # fill in from
                                                 # topClosedWorldUnreachableRequires

# Cell A dispatch.
( cd /tmp/cell-a && \
  onto verify-homeomorphism                            \
    --nodes "$SAMPLE_NODES"                            \
    --provider anthropic --model claude-sonnet-4-6     \
    --report verify-a.md --json > verify-a.json )

# Cell B dispatch.
( cd /tmp/cell-b && \
  onto verify-homeomorphism                            \
    --nodes "$SAMPLE_NODES"                            \
    --provider anthropic --model claude-sonnet-4-6     \
    --report verify-b.md --json > verify-b.json )
```

### 4.3 Compare

Diff the per-node verdicts. The expected signal is a shift toward
`ε-equivalent` on cell B for nodes whose requires were closed-world
unreachable in gamma. Folds well into a 2×K contingency table
(verdict × cell, K = sample size) with a Fisher-exact / chi-squared
for the small-n profile, or a per-verdict count delta for the full
sweep.

## 5. What confirmation looks like

- **Strong**: on the sample, ≥ 60 % of nodes that were
  `divergent_structural` in cell A flip to `ε-equivalent` or
  `divergent_loc` in cell B; no nodes regress in the opposite
  direction.
- **Weak**: a smaller shift, but with the direction consistent with
  the hypothesis (more `ε-equivalent` in B than in A). Indicates the
  brújula is a useful but partial predictor; vocabulary or
  directionality is the rest of the gap.
- **Refutation**: cell B's verdict distribution is statistically
  indistinguishable from cell A's. The brújula's structural movement
  is real but not a predictor of regeneration quality, and the
  project's theory of failure needs a different lever.

## 6. Honest caveats (carried over from §9.3)

- The 1.000 brújula on gamma-with-edges is partly backward-fit: the
  static analyser sees the same import graph the gamma extractor saw.
  A fresh repo on which both ingest and infer-edges run for the first
  time would be the cleaner test. The protocol above measures
  *additivity-vs-no-additivity* on a single known graph, not
  *generalisation*.
- `verify-homeomorphism` measures static structural distance, not
  runtime behavior. A code-equivalent regeneration can still fail
  runtime tests for reasons the metric does not see. Pair with the
  compile + test pass once the comparison shape is established.
- The sample selection biases toward nodes the brújula intervention
  should help. That is intentional — it gives the strongest signal for
  the smallest dispatch budget — and must be acknowledged in any
  report drawn from the data. A full sweep removes the bias at the
  cost of $2.94.

## 7. Local Ollama dry run — actual findings (2026-05-22)

Ran the protocol against `node_0025` (src/runtime/graph/edges.ts —
consumer of `loadEdges` and `OntologyEdge`, both top closed-world
unreachables in the gamma baseline) with `qwen2.5-coder:7b`. Two
architectural blockers surfaced during prep; the result inverts the
hypothesis.

### 7.1 Blocker 1 — closed-world gluing on ingest-derived contracts

`validateIntent` (`src/runtime/context/intent-validator.ts`)
unconditionally failed the `gluing_ok` rule whenever any
`missing_requirement` conflict appeared. Ingest-derived contracts
always carry external imports (`fs`, `crypto`, `zod`, …) that no
ontology node provides — closed-world is structurally incompatible.

**Fix landed**: extended the existing `openWorld` flag (default true
on `verify-homeomorphism`) so it also tolerates `missing_requirement`
conflicts, downgrading them from violations to warnings. Other
conflict types (`duplicate_provider`, `unsatisfiable`, etc.) still
fail strictly. The change preserves closed-world semantics when the
caller asks for them.

### 7.2 Blocker 2 — compile-plan transitive cascade

With `depends_on` / `uses_token` edges materialised, the compile plan
(`computeCompilePlan` in `src/runtime/graph/compile-plan.ts`) extends
the focal step to its full transitive closure across
`HARD_DEPENDENCY_EDGE_TYPES`. Each transitive step compiles
independently and must pass its own validation. For gamma this
expanded `node_0025` (one node) into `node_0025 + node_0071 +
node_0126 + …`, and the deeper steps hit `duplicate_provider`
(two source files both providing `failWith`) and `forbidden_match`
conflicts that `openWorld` does not relax.

A short-lived attempt to bring edge neighbours into the focal's
gluing (`includeEdges: true` at `compile-node.ts:627`) made the
problem worse by enlarging the per-step conflict surface. Reverted.

### 7.3 What the LLM dispatch actually saw

The smoke test ran the dispatch in both cells from a warm
content-addressed cache (`promptTokens: 56`, `completionTokens: 883`,
`cached: true`). The LLM input is built by `buildPreludeE` from
`upstream` (refinement parents' compiled outputs) plus the focal's
own prompt. **Edges of type `depends_on` / `uses_token` are not
threaded into the prompt at all** — they affect the compile plan
(`HARD_DEPENDENCY_EDGE_TYPES`) and, with the validator-side fix,
the post-dispatch validation, but they never reach the model.

Cell A (gamma baseline, no edges) and Cell B (gamma + 348 edges)
therefore produced **identical** verdicts:

| metric                | Cell A                | Cell B                |
| --------------------- | --------------------- | --------------------- |
| verdict               | divergent_structural  | divergent_structural  |
| locDistance           | 0.138                 | 0.138                 |
| structuralJaccard     | 0.000                 | 0.000                 |
| originalDeclarations  | 4 (getEdgesByType, …) | 4 (getEdgesByType, …) |
| regenDeclarations     | 0                     | 0                     |
| dispatch              | ollama qwen2.5-coder:7b cached | (same cache hit) |

The local model emitted 50 lines of output with zero top-level
declarations — the loc threshold passed, the structural jaccard
failed. Same input, same cache, same output. The empirical question
"do materialised edges improve regeneration quality" gets a clean
**no, with the current compile architecture**.

### 7.4 What this means for the brújula

The brújula
(`closedWorldContextReachableSatisfaction`) measures whether the
assembler *could* route a require to a provider, given
`includeEdges: true`. The compile pipeline never asks the assembler
for that walk; the LLM prompt is built from `upstream` only. So the
metric was tracking a capability the production path does not
exercise.

This does not refute the metric — it refutes the *interpretation*
that brújula movement automatically translates to regeneration
quality. The right reading: brújula is a **prerequisite** signal
(the network has the routes the assembler could walk *if* the
compile pipeline were to use them). It is not a predictor on its
own.

### 7.5 What would actually move regeneration quality

Three candidates, in increasing scope:

1. **Thread edge-neighbour artefacts into `upstream`.** The
   `collectUpstream` helper in `compile-plan-runner.ts` only walks
   `refines` edges. Extending it to include `depends_on` / `uses_token`
   targets' compiled responses (when available) would put the
   neighbour's text into the system prompt for the focal step. Cost
   surface: ~50 lines plus tests; behavioural change because every
   focal step would suddenly see more system-prompt context.

2. **Replace the upstream-only prompt with `assembleContext.prompt`.**
   The assembler already builds a full edge-aware prompt (canon →
   ancestors → contract → focal). The compile dispatch could use that
   text directly instead of building its own upstream system prompt.
   Cleaner integration; bigger refactor (cache invalidation, prompt
   length budget management).

3. **Both — plus open-world dispatch defaults.** The above changes
   would land naturally with the validator-side `openWorld` relaxation
   from §7.1, so ingest-derived contracts compile end-to-end without
   tripping the gluing's closed-world strict rules.

None of (1)–(3) is in scope for this protocol; documenting them so
the next planning pass can size each.

### 7.6 Hypothesis to refute / confirm

The lesson is the same shape as the §1 / §2 finding, just one layer
deeper:

> The brújula measures *what the network makes reachable*. Moving it
> is necessary but not sufficient. The sufficient question — *what
> the prompt actually contains* — has its own measurement, and the
> current production path does not exercise it.

The next baseline pass should add that measurement: per-compile,
report what fraction of the focal's closed-world requires appear as
named symbols in the dispatched prompt. Today that fraction is zero
across the board; any of the three candidates above would move it.

## 8. Next decision the operator owns

Pull the trigger or pre-register the sample list and wait. This doc is
the $0 prework; the $0.20–$2.94 spend is intentionally not folded
into a CLI flag — and given §7.7 (the dispatch does not see edges),
spending money on a full A/B before changing the prompt construction
would just buy 250 identical dispatches.
