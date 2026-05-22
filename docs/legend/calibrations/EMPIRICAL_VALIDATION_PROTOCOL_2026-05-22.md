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

## 7. Next decision the operator owns

Pull the trigger or pre-register the sample list and wait. This doc is
the $0 prework; the $0.20–$2.94 spend is intentionally not folded
into a CLI flag.
