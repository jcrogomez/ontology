# SEMANTIC_INDEX — `onto semantic` agent card

A local embedding index over the INTENT TEXT of each node — label +
`prompt.raw` + rules + `provides` key/description pairs
(`embeddingSourceText`) — NOT over code. The graph is the durable
artifact; the index is a disposable, derived accelerator.

## Module map

| Module | Role |
|---|---|
| `src/runtime/semantic/embedding-index.ts` | Build/load the index, `cosineSimilarity`, `rankBySimilarity`, `suggestSemanticPairs` (same-branch, unlinked-in-either-direction pairs above a threshold), `staleIndexNodeIds`. |
| `src/runtime/llm/mock.ts` | `embed()`: deterministic bag-of-words feature hashing, 64-dim, L2-normalised — texts sharing vocabulary get high cosine, so the whole pipeline is testable at $0. |
| `src/runtime/llm/ollama/adapter.ts` | `embed()`: defaults to `nomic-embed-text` (768-dim) via the local Ollama host. |
| `src/commands/semantic/index.ts` | `onto semantic index` / `onto semantic links`. |
| `src/commands/query/run-query.ts` | `onto query --semantic <text>` consumer. |

## Index location and shape

`.ontology/embeddings/index.json` — `{version: 1, provider, model, dim,
createdAt, entries: [{nodeId, sourceHash, vector}]}`. Content-addressed
per node: `sourceHash = sha256(provider + model + intent text)`, so a
rebuild re-embeds only changed nodes (incremental; unchanged vectors are
reused). Deleting the file loses nothing of record.

Providers: `mock` (default) and `ollama`. A provider/model switch
invalidates every cached vector (the hash includes both).

## Consumers

- **`onto semantic links`** — ranks high-similarity UNLINKED node pairs
  (default threshold 0.7, top 10). With `--propose`, each pair becomes a
  governed `edge_create` PROPOSAL through the standard gate; `--type
  <edgeType>` is REQUIRED (similarity is symmetric and has no opinion on
  edge semantics — the human picks type and direction). Direction is
  validated against the abstraction poset; invalid pairs are skipped
  with a reason.
- **`onto query --semantic "<text>"`** — hybrid retrieval: embeds the
  query and re-ranks the nodes that ALREADY matched the structural shape
  filter. Similarity never overrides a structural constraint; it only
  orders what matched. `--top` / `--min-score` tune the cut.

## Honest limits

- Brute-force cosine over all entries — exact and instant at a few
  hundred vectors; no ANN/vector DB by design.
- Similarity is HYPOTHESIS generation, never truth: nothing in this
  layer mutates the graph; proposals carry a rationale flagging the
  score and "verify before apply".
- Staleness is detected, not auto-fixed: consumers warn with the stale
  node ids (`staleIndexNodeIds`); refresh is one `onto semantic index`
  away.

## Tests

- `tests/embedding-index.test.ts` — mock embedding determinism, source
  text/hash, ranking and pair suggestion.
- `tests/semantic-cli.test.ts` — index → links → propose → hybrid query,
  end-to-end on the mock provider ($0).
