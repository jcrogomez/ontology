# SELF_INGEST_LIVE_GRAPH_2026-06-11 — RESULT

> **Dated record.** First population of the repo's LIVE `.ontology/` graph
> from `src/`, executed per `docs/SELF_INGEST_RUNBOOK.md` with the
> governed-escalation strategy chosen by the owner. Extractor selected by
> `EXTRACTOR_BAKEOFF_2026-06-10` (incumbent `qwen2.5-coder:3b`).

## Numbers

- **Perimeter:** 221 ts/tsx files under `src/`.
- **Bulk extraction (local, $0):** 213/221 succeeded (96.4%). 8 failures
  (5 invalid_json, 3 schema_failed) — including `src/cli.ts`, the largest
  file.
- **Governed escalation (frontier, $0 marginal):** the 8 failures
  re-extracted via cold `claude-fable-5` session subagents answering the
  exact pipeline prompt; injected through the standard `createProposal`
  path with AST-derived O1 signatures and provenance recording the
  escalation. 8/8 succeeded. (1 of the 8 reused the bake-off's A5
  extraction for `src/schemas/workflow.ts`.)
- **Applies:** 221 node proposals in 15 batches + 710 static-import edge
  proposals in 48 batches — `onto validate` + `onto replay` green after
  EVERY batch, checkpoint copies per batch, **zero failures**.
- **Final graph:** 228 nodes (7 pre-existing ζ + 221), ~710 new edges.
  Drift re-anchored over all 221 shadows (root `117d3fa067ae6eed…`).
  Semantic index: 228 nodes embedded (ollama/nomic-embed-text, 768 dims).
- **Loop verification:** `:which` resolves source→intent across the
  perimeter (e.g. `src/core/integrity/merkle.ts → node_0015`,
  `src/cli.ts → node_0221` — an escalated node); hybrid `query --semantic`
  ranks over the full graph.

## Findings

1. **Governed escalation worked exactly as designed:** the local model's
   8 failures were precisely the complex files (cli.ts, behavior-checker,
   workflow schemas) where the frontier's +0.224 recall matters most.
2. **Embedding context ceiling found:** cli.ts's contract prompt alone
   overflowed nomic-embed-text's context; fixed by truncating embedding
   input to `EMBED_MAX_CHARS` (4000 chars) — hash covers the truncated
   text for cache consistency.
3. **Operational:** the run survived 1 machine reboot, ~7 session-cycle
   kills, and lid-close sleeps, thanks to (in order of lesson) repo-scratch
   artifact storage, per-batch markers, and full session detachment
   (nohup/setsid). Wall-clock ~6h; compute ~3h.
4. **Honest scope:** 213 of 228 node prompts are 3b-tier extraction
   (recall ~0.78 measured) — a STARTING map. Refinement happens through
   the walker loop (`:propose-update`); retrieval quality in
   `query --semantic` visibly reflects extraction quality.
