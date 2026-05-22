# Hierarchy baseline — 2026-05-22

Pre-hierarchizer measurement, captured with `onto graph metrics` (read-only,
no LLM, no mutation). Purpose: fix the brújula before any structural change
to the network topology. Each subsequent step (hierarchizer, edge
materialization, A→B typed maps) must be evaluated against the signals
recorded here.

## Snapshots analysed

| label        | path                                                 |
| ------------ | ---------------------------------------------------- |
| `active`     | `.ontology`                                          |
| `beta`       | `.ontology.self-ingest-beta-result`                  |
| `beta_prime` | `.ontology.self-ingest-beta-prime-result`            |
| `gamma`      | `.ontology.self-ingest-gamma-result`                 |
| `delta`      | `.ontology.self-ingest-delta-result`                 |

`active` is the bootstrap network (six hand-authored nodes). It is included
for context but is not a self-ingest experiment — comparisons across the
four archived snapshots are the interesting axis.

## 1. Topological shape

| snapshot     | nodes | edges | maxDepth | avgDepth | directChildrenOfRoot | directRatio | isolatedRatio | verdict   |
| ------------ | ----: | ----: | -------: | -------: | -------------------: | ----------: | ------------: | --------- |
| `active`     |     6 |     3 |        2 |    1.500 |                    1 |       0.200 |         0.667 | healthy   |
| `beta`       |   126 |     0 |        1 |    0.992 |                  125 |       1.000 |         1.000 | flat      |
| `beta_prime` |   128 |     0 |        1 |    0.992 |                  127 |       1.000 |         1.000 | flat      |
| `gamma`      |   127 |     0 |        1 |    0.992 |                  126 |       1.000 |         1.000 | flat      |
| `delta`      |   127 |     0 |        1 |    0.992 |                  126 |       1.000 |         1.000 | flat      |

The four archived snapshots have the **same** topology to three decimals:
~127 nodes, `maxDepth = 1`, every non-root node a direct child of canon,
every node isolated in the typed-edge fabric. The verdict reports `flat`
because the topological-flatness rule fires first; the underlying
`edge_starved` symptom is also true in every archived snapshot
(`edgeCount = 0` against hundreds of contract tokens). Per the verdict
ordering caveat: when interpreting these rows, treat them as `flat` AND
`edge_starved` simultaneously.

## 2. Contract satisfaction — global vs. context-reachable

| snapshot     | requires | provides | forbids | globalSat | reachSat |    gap | nodesWithRequires |
| ------------ | -------: | -------: | ------: | --------: | -------: | -----: | ----------------: |
| `active`     |        0 |        2 |       0 |     n/a   |    n/a   |  n/a   |                 0 |
| `beta`       |      160 |      466 |     136 |     0.478 |    0.000 |  0.478 |              ~22  |
| `beta_prime` |      126 |      559 |     119 |     0.508 |    0.000 |  0.508 |              ~22  |
| `gamma`      |      164 |      565 |     114 |     0.787 |    0.409 |  0.378 |                22 |
| `delta`      |      204 |      512 |      11 |     0.750 |    0.328 |  0.422 |              ~22  |

Two findings the gap surfaces:

1. **`beta` and `beta_prime` reach exactly zero** under the reachable
   definition. With no edges and `maxDepth = 1`, the only ancestor of any
   consumer is canon — and canon does not provide the symbols consumers
   declare. Every contract token that *would* satisfy a requires is sitting
   in a sibling whose only path to the consumer goes through the canon's
   `provides`-less hub.
2. **`gamma` and `delta` claw back some reachable satisfaction** despite
   the identical topology. This is self-provision: a node that both
   `requires` and `provides` the same key (typical of a file that re-exports
   one of its own imports). The reachable satisfaction in these snapshots is
   *not* evidence of routing — it is evidence that some nodes happen to be
   self-loops. Gamma's better score reflects more self-references, not
   better extraction.

The collapse to `reachSat = 0` in `beta` / `beta_prime` is the cleanest
formulation of the failure mode: the information is in the graph
(`globalSat ≈ 0.5`), but the topology guarantees none of it reaches the
prompt.

## 3. Top path fibers per snapshot

Every snapshot agrees on which directories the file ingest discovered.
Buckets are stable across runs even though the network topology around
them is not.

### `beta` (top 8)

| bucket                     | nodes |
| -------------------------- | ----: |
| `src/runtime/legend`       |    10 |
| `src/commands/node`        |     7 |
| `src/runtime/context`      |     7 |
| `src/commands`             |     6 |
| `src/commands/proposal`    |     6 |
| `src/runtime/llm`          |     6 |
| `src/runtime/compile`      |     5 |
| `src/runtime/effects`      |     5 |

### `beta_prime` (top 8)

| bucket                     | nodes |
| -------------------------- | ----: |
| `src/runtime/legend`       |    11 |
| `src/commands/node`        |     7 |
| `src/runtime/context`      |     7 |
| `src/runtime/llm`          |     7 |
| `src/commands`             |     6 |
| `src/commands/proposal`    |     6 |
| `src/runtime/compile`      |     5 |
| `src/runtime/effects`      |     5 |

### `gamma` (top 8)

| bucket                     | nodes |
| -------------------------- | ----: |
| `src/runtime/legend`       |    11 |
| `src/commands/node`        |     7 |
| `src/runtime/context`      |     7 |
| `src/runtime/llm`          |     7 |
| `src/commands`             |     6 |
| `src/commands/proposal`    |     6 |
| `src/runtime/compile`      |     5 |
| `src/runtime/effects`      |     5 |

### `delta` (top 8)

| bucket                     | nodes |
| -------------------------- | ----: |
| `src/runtime/legend`       |    11 |
| `src/runtime/context`      |     7 |
| `src/commands`             |     6 |
| `src/commands/node`        |     6 |
| `src/commands/proposal`    |     6 |
| `src/runtime/llm`          |     6 |
| `src/runtime/compile`      |     5 |
| `src/commands/graph`       |     4 |

Bucket counts agree to ±1 across `beta`, `beta_prime`, `gamma`, `delta`
(44, 44, 44, 45 distinct directories). The file structure that the ingest
extracted is rich and consistent — what is missing is the network
structure that should reflect it.

## 4. Top unsatisfied requires under context-reachable

The roll-up that points at the next hierarchizer target. Two categories
matter:

- **Open-world tokens** — stdlib / 3rd-party modules (`fs`, `path`,
  `crypto`, `zod`). These will never be provided by an ontology node; the
  fix is open-world reasoning (an existing escape hatch at
  `src/runtime/context/intent-validator.ts`), not hierarchy or edges.
- **Closed-world tokens** — project-internal symbols (`loadEdges`,
  `loadNodeById`, `OntologyEdge`, `OntologyNode`, `getOntologyPaths`,
  `errorMessage`, `createProposal`, `EdgeTypeSchema`, …). Each one has at
  least one ontology-node provider somewhere in the graph; the hierarchizer
  is the layer that should make them reachable.

### `beta`

| source                                    | consumers | category |
| ----------------------------------------- | --------: | -------- |
| `fs`                                      |         7 | open     |
| `loadNodeById`                            |         5 | closed   |
| `path`                                    |         5 | open     |
| `../../core/errors.js`                    |         3 | closed   |
| `../../core/project/load.js`              |         3 | closed   |
| `../../core/runs/persist.js`              |         3 | closed   |
| `../../schemas/ontology.js`               |         3 | closed   |
| `assertOntologyProject`                   |         3 | closed   |

### `beta_prime`

| source                                    | consumers | category |
| ----------------------------------------- | --------: | -------- |
| `loadEdges`                               |         6 | closed   |
| `crypto`                                  |         5 | open     |
| `fs`                                      |         5 | open     |
| `../../schemas/ontology.js`               |         4 | closed   |
| `OntologyEdge`                            |         4 | closed   |
| `zod`                                     |         4 | open     |
| `../../core/project/load.js`              |         3 | closed   |
| `getOntologyPaths`                        |         3 | closed   |

### `gamma`

| source                                    | consumers | category |
| ----------------------------------------- | --------: | -------- |
| `loadEdges`                               |         7 | closed   |
| `loadNodeById`                            |         5 | closed   |
| `fs`                                      |         4 | open     |
| `loadState`                               |         4 | closed   |
| `createProposal`                          |         3 | closed   |
| `errorMessage`                            |         3 | closed   |
| `loadNodes`                               |         3 | closed   |
| `OntologyEdge`                            |         3 | closed   |
| `OntologyNode`                            |         3 | closed   |
| `path`                                    |         3 | open     |

### `delta`

| source                                    | consumers | category |
| ----------------------------------------- | --------: | -------- |
| `loadNodeById`                            |         6 | closed   |
| `OntologyEdge`                            |         6 | closed   |
| `errorMessage`                            |         5 | closed   |
| `fs`                                      |         5 | open     |
| `loadEdges`                               |         5 | closed   |
| `appendJsonl`                             |         4 | closed   |
| `assertOntologyProject`                   |         4 | closed   |
| `EdgeTypeSchema`                          |         4 | closed   |
| `getOntologyPaths`                        |         4 | closed   |
| `OntologyNode`                            |         4 | closed   |

A handful of closed-world symbols recur across snapshots:
`loadEdges`, `loadNodeById`, `loadState`, `loadNodes`, `getOntologyPaths`,
`OntologyEdge`, `OntologyNode`, `EdgeTypeSchema`, `errorMessage`,
`createProposal`. These are the project's load/schema spine — the symbols
every command consumer ultimately depends on. Their providers are nodes
sitting *somewhere* in the flat hub; the hierarchizer's job is to bring
them within walk-distance of the consumers that name them.

## 5. Diagnostic: what exists but does not reach the prompt

Combining sections 2 and 4:

- **The fact**: in `beta` and `beta_prime`, **none** of the 160–126
  consumer-side requires has a path to the matching provider under the
  assembler's default rules. In `gamma` and `delta`, only self-loops
  produce reachable hits.
- **The cause**: every non-root node is a direct child of canon and there
  are zero typed edges. The assembler walks `parentId → canon` and adds
  one-hop neighbours via `depends_on / validates_against / uses_token /
  documents / tests`. Both inputs are empty: the parent of any consumer is
  canon (which provides nothing relevant), and the neighbour set is empty
  because no edges exist.
- **The shape of the missing layer**: `pathProjection` already recovers
  44–45 distinct directory buckets per snapshot, agreeing on the same top
  buckets (`src/runtime/legend`, `src/runtime/context`,
  `src/commands/node`, …). The hierarchy that the network refused to
  encode is sitting in `outputs.files[0]`, waiting to be promoted to
  intermediate nodes.
- **What is *not* missing**: extraction. The ingest pipeline is collecting
  the right contracts — globalSat reaches 0.787 on `gamma`. The
  information is in the graph. It just has no route from where it lives
  to where it is needed.

## 6. Recommendation for the hierarchizer

A single signal should be the brújula: **closed-world
`contextReachableSatisfaction`**. The current zero/near-zero score is the
floor; every hierarchizer iteration must move it.

Concretely:

1. **Use `pathProjection` buckets as the intermediate layer**. The
   directory tree is already extracted; promoting `src/runtime`,
   `src/runtime/context`, `src/runtime/legend`, `src/commands/proposal`,
   … to intermediate nodes turns each one into a reachable ancestor for
   every file it contains. Same-directory siblings then share an ancestor
   that can absorb the directory-wide provides (re-exports, constants,
   schema modules).

2. **Materialise edges in the same cycle**. `onto graph infer-edges
   --create-proposals` already exists at
   `src/commands/graph/infer-edges.ts` and produced zero applied edges in
   every archived snapshot. The hierarchizer should be paired with an
   edge-materialisation pass so the next baseline run shows both a
   non-trivial `maxDepth` *and* a non-zero `edgeCount`. Either signal alone
   would only patch half the failure mode.

3. **Split the satisfaction metric into open-world / closed-world**. The
   stdlib/3rd-party tail (`fs`, `path`, `crypto`, `zod`, …) will never be
   satisfied by an ontology provider and should not weigh on the
   hierarchizer's score. The closed-world subset (`loadEdges`,
   `OntologyEdge`, `getOntologyPaths`, …) is the only meaningful target.
   The `intent-validator.ts` open-world flag is the obvious mechanism to
   borrow.

4. **Watch the wrong gap to close**. If only `maxDepth` rises without
   `reachSat` moving, the hierarchizer is producing structure that the
   assembler does not walk — likely an indication that the intermediate
   layer is being placed *between* canon and consumers rather than
   *between* consumers and their dependency providers, or that providers
   are not on the same parent path. A two-snapshot delta (before vs. after)
   on the same source repo is the cheapest way to detect this.

5. **Verdict caveat to revisit**. Once the network starts gaining depth
   and edges, the current verdict heuristic — which fires `flat` before
   `edge_starved` — may shadow the more informative signal. Worth
   reviewing when the next baseline lands; not worth changing now.

## 7. Closed-world vs open-world (schema 1.1 follow-up)

The first cut mixed three failure modes under a single
`contextReachableSatisfaction` number. After splitting each consumer-side
`requires.source` into one of four classes — `internal_symbol`,
`internal_path_vocab_mismatch`, `open_world`, `unknown` — the underlying
signal sharpens considerably.

### 7.1 Classification breakdown

Per-(consumer, source) pair counts. The classification sum differs from
`totalRequires` only when a single node literally declares the same
require twice (e.g. `beta` has one duplicate); the classifier dedupes
per consumer, the totals don't.

| snapshot     | totalReq | closed | path | open | unknown |
| ------------ | -------: | -----: | ---: | ---: | ------: |
| `active`     |        0 |      0 |    0 |    0 |       0 |
| `beta`       |      160 |     76 |   51 |   24 |       8 |
| `beta_prime` |      126 |     64 |   30 |   21 |      11 |
| `gamma`      |      164 |    129 |    0 |   13 |      22 |
| `delta`      |      204 |    153 |    0 |   14 |      37 |

Two observations:

- **`beta` and `beta_prime` carry the vocab-extraction bug**: 51 / 30
  `internal_path_vocab_mismatch` requires are project paths stored
  verbatim instead of being collapsed into the providing node's symbol
  vocabulary. Examples that resolve cleanly: `../../core/errors.js →
  node_0060` (`beta`), `../../schemas/ontology.js → node_0127`
  (`beta_prime`). The provider exists, the extractor just didn't normalise
  the import to its symbol.
- **`gamma` and `delta` show zero path-mismatch entries** — the ingest
  pipeline learned to extract symbol names. Their unknown counts grow
  instead (22 / 37) because PascalCase types without a provider (the
  ingest now lists `OntologyEdge`-style symbols literally, but they don't
  always have a matching `provides` entry) get filed into `unknown`
  rather than mis-classed.

### 7.2 Closed-world satisfaction (the real signal)

| snapshot     | closedReq | closedGlobalSat | closedReachSat |    gap |
| ------------ | --------: | --------------: | -------------: | -----: |
| `active`     |         0 |             n/a |            n/a |    n/a |
| `beta`       |        76 |           1.000 |          0.000 |  1.000 |
| `beta_prime` |        64 |           1.000 |          0.000 |  1.000 |
| `gamma`      |       129 |           1.000 |          0.519 |  0.481 |
| `delta`      |       153 |           1.000 |          0.438 |  0.562 |

`closedGlobalSat = 1.000` everywhere by construction — `internal_symbol`
*is* the subset whose providers exist. The honest hierarchizer score is
`closedReachSat`:

- `beta` and `beta_prime`: **zero reachable closed-world**. 76 / 64 real
  routes the assembler should walk, none of them walkable. This is the
  pure "info exists but cannot reach the prompt" failure mode.
- `gamma` / `delta`: ~50% reachable closed-world, but only via
  self-provision (no edges, no parent path between consumer and provider).
  The remaining ~50% are the real targets for the hierarchizer.

The mixed `contextReachableSatisfaction` reported earlier
(`gamma: 0.409`, `delta: 0.328`) was depressed by the
`unknown`/`open_world` tail — symbols that will never be satisfied no
matter what the hierarchizer does. The closed-world score is the ratio
the hierarchizer can actually move.

### 7.3 Top closed-world unreachable per snapshot (the hierarchizer's queue)

Each entry is a real symbol with a real provider in the graph; the
hierarchizer's only job is to make the path between them walkable.

#### `beta`

| source                       | consumers |
| ---------------------------- | --------: |
| `loadNodeById`               |         5 |
| `assertOntologyProject`      |         3 |
| `bold`                       |         3 |
| `byStatus`                   |         3 |
| `dim`                        |         3 |
| `errorMessage`               |         3 |
| `loadEdges`                  |         3 |

#### `beta_prime`

| source                       | consumers |
| ---------------------------- | --------: |
| `loadEdges`                  |         6 |
| `getOntologyPaths`           |         3 |
| `hashObject`                 |         3 |
| `loadNodeById`               |         3 |
| `OntologyEventSchema`        |         3 |

#### `gamma`

| source                       | consumers |
| ---------------------------- | --------: |
| `loadEdges`                  |         7 |
| `loadNodeById`               |         5 |
| `loadState`                  |         4 |
| `errorMessage`               |         3 |
| `loadNodes`                  |         3 |

#### `delta`

| source                       | consumers |
| ---------------------------- | --------: |
| `loadNodeById`               |         6 |
| `errorMessage`               |         5 |
| `loadEdges`                  |         5 |
| `appendJsonl`                |         4 |
| `assertOntologyProject`      |         4 |
| `getOntologyPaths`           |         4 |
| `readState`                  |         4 |
| `writeState`                 |         4 |

The cross-snapshot constant is the load/persist spine: `loadEdges`,
`loadNodeById`, `loadState`, `loadNodes`, `getOntologyPaths`,
`errorMessage`, `appendJsonl`. The providers for these live in
`src/core/project/load.ts` and `src/core/errors.ts`; every command
consumer ultimately points at them. The first hierarchizer pass should
guarantee those two files become reachable ancestors (or one-hop edge
neighbours) for every consumer node.

### 7.4 Open-world tail (confirmed noise)

| snapshot     | top open-world sources                                           |
| ------------ | ---------------------------------------------------------------- |
| `beta`       | `fs`, `path`, `crypto`, `zod`, `@anthropic-ai/sdk`               |
| `beta_prime` | `crypto`, `fs`, `zod`, `path`, `jsonl`                           |
| `gamma`      | `fs`, `path`, `crypto`, `zod`, `node:fs`                         |
| `delta`      | `fs`, `crypto`, `z`, `os`, `path`                                |

These look right. `node:fs` (gamma) is the same module under the explicit
prefix; both shapes route to `open_world`. `z` (delta) is a default
import alias for `zod` — open-world too. None of these will ever be
provided by an ontology node; they are correctly off the hierarchizer's
score.

### 7.5 Internal path vocab mismatches (legacy bug)

`gamma` and `delta` show zero rows. `beta` and `beta_prime` show clean
resolutions back to the providing node, which means the bug is
*recoverable*: an offline cleanup pass over those archived snapshots
could rewrite the path-shaped requires to the resolved node's symbol
without a re-run. We will not do that here — the snapshots are immutable
baselines — but it confirms that the failure is a vocabulary issue, not
a missing-information issue.

Top mismatches (`beta`):

| source                              | consumers | resolved   |
| ----------------------------------- | --------: | ---------- |
| `../../core/errors.js`              |         3 | `node_0060` |
| `../../core/project/load.js`        |         3 | `node_0068` |
| `../../core/runs/persist.js`        |         3 | `node_0074` |
| `../../schemas/ontology.js`         |         3 | `node_0125` |
| `../../core/render/style.js`        |         2 | `node_0072` |

`.js → .ts` aliasing is what makes these resolve: every file lives as a
`.ts` source under the providing node's `outputs.files[0]`.

## 8. Confirmed brújula for the hierarchizer

After classification, the metric to optimise is unambiguous:

```text
closedWorldContextReachableSatisfaction.ratio   (the only real route gap)
```

Floor across archived snapshots:

| snapshot     | floor |
| ------------ | ----: |
| `beta`       | 0.000 |
| `beta_prime` | 0.000 |
| `gamma`      | 0.519 |
| `delta`      | 0.438 |

A working hierarchizer should land the next snapshot well above the
gamma/delta floor (target: `> 0.7` on a self-ingest of comparable size)
while `closedWorldGlobalSatisfaction` stays at 1.0. The supporting
signals the report watches at the same time:

- `topology.maxDepth > 1` — the network now has at least the directory
  layer that `pathProjection` already extracts.
- `topology.edgeCount > 0` — `infer-edges --create-proposals` was run as
  part of the cycle.
- `flatness.nonRootDirectChildrenOfRootRatio` drops well below 1.0 — the
  canon stops being the universal parent.
- `internalPathMismatchRequireCount = 0` stays at zero — the vocab
  extractor does not regress.

## Reproducibility

```bash
onto graph metrics --json                                                    \
  > active.json
onto graph metrics --ontology-dir .ontology.self-ingest-beta-result --json   \
  > beta.json
onto graph metrics --ontology-dir .ontology.self-ingest-beta-prime-result --json \
  > beta_prime.json
onto graph metrics --ontology-dir .ontology.self-ingest-gamma-result --json  \
  > gamma.json
onto graph metrics --ontology-dir .ontology.self-ingest-delta-result --json  \
  > delta.json
```

Module: `src/runtime/graph/hierarchy-metrics.ts` (pure, deterministic).
CLI: `src/commands/graph/metrics.ts`. Schema version reported as
`metrics.schemaVersion` in the JSON output — bump it if the report shape
ever changes so historical baselines stay diff-able.
