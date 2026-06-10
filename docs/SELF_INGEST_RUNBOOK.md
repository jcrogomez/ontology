# SELF_INGEST_RUNBOOK — populating the live graph from `src/`, safely

> **Status:** executable protocol, first executed 2026-06-10 (this run's
> records live in the `self-ingest/2026-06-10` branch history). Future
> re-ingests follow the same steps. Primary readers: AI agents executing or
> auditing a self-ingest. Every step is a real command; nothing here is
> aspirational.

## Why a runbook

Self-ingest turns the repo's own `.ontology/` into the real map of the
codebase (~200+ nodes). The risk is not data loss — it is **meaning loss**:
a flood of unreviewed nodes/edges burying the curated graph. The protocol
makes every step reversible and every checkpoint auditable. Decided with the
project owner 2026-06-10: *"self-ingest sí, con las versiones que nos
permitan que no truene todo."*

## Invariants that make this safe (verify, don't trust)

1. **Ingest writes proposals only.** Nothing mutates nodes/edges until
   `onto proposal apply` — a bad extraction is a `reject`, not a rollback.
2. **Source code is unreachable.** Compile's default writes to
   `.ontology/artifacts/generated/`; an explicit `--target` on an existing
   file is default-deny without `--force` (pinned by
   `tests/compile-cli-target-safety.test.ts`). The walker exposes no target
   path at all.
3. **The state is reconstructible.** `onto replay` (T1, §4.4) rebuilds the
   summary from the event log and verifies chain integrity — run it after
   every batch.
4. **Git is the outer undo.** Everything happens on a dedicated branch with
   a pre-ingest tag; every applied batch is a commit. Worst case = reset to
   the previous checkpoint. `main` never sees an unreviewed graph.

## Protocol

```bash
# 0. Preconditions: clean tree, tests green, Ollama up with the calibrated
#    extractor (qwen2.5-coder:3b — registry default for semantic_parse).
git status --short          # must be clean
git tag pre-self-ingest-<date>
git checkout -b self-ingest/<date>

# 1. Anchor the drift baseline BEFORE anything moves.
onto drift --update

# 2. Pre-flight the cost (zero for local, but the report goes in the log).
onto ingest src --provider ollama --static-classifier enabled --cost-estimate

# 3. The long step — extraction. Proposals only; interruptible; re-runnable.
#    --static-classifier enabled: barrels/declaration-only files bypass the
#      LLM and get deterministic static summaries ($0, exact).
#    --resolved-signatures: one ts.Program pass attaches RESOLVED-tier
#      signatures to provides — better identify-if-equal gluing later.
onto ingest src --provider ollama --static-classifier enabled \
  --resolved-signatures --json > ingest-report.json

# 4. Batched apply — NEVER all at once. ~12-15 per batch, checks after each:
for id in <next ~12 proposal ids, oldest first>; do
  onto proposal apply "$id" --json
done
onto validate          # schema + integrity of the whole network
onto replay --json     # the §4.4 law must hold after every batch
onto drift --json      # informational: shadows join the tracked set as
                       # nodes land (they enter the anchor at step 6)
git add .ontology && git commit -m "self-ingest batch N: nodes X..Y"

#    Anything dubious in a batch: `onto proposal reject <id>` with a reason.
#    Rejection is the success of the gate, not a failure of the run.

# 5. Edges — after ALL node batches: static import edges as proposals,
#    then apply them in batches with the same checks.
onto graph infer-edges src --create-proposals --json
# ... batched applies + validate/replay + checkpoint commits, as in step 4.

# 6. Re-anchor and index — the graph now owns its shadows.
onto drift --update    # new baseline: every src file referenced by a node
onto semantic index --provider ollama   # embeddings over the intent text

# 7. Verify the loop closes, then PR the branch for review.
onto walk node_0000_canon   # :which src/<any-file>.ts must jump to its node
```

## Abort / rollback

- **Mid-batch failure** (validate or replay fails): `git checkout .ontology`
  to drop the partial batch, inspect the offending proposal, reject it,
  re-apply the rest. The previous checkpoint commit is intact.
- **Abandon the run entirely:** `git checkout <base-branch> && git branch -D
  self-ingest/<date>`. The tag marks where the world was before anything.
- **Bad extraction quality overall** (e.g. wrong model answered): reject the
  pending proposals wholesale — `.ontology/proposals/` holds only `pending`
  files until applied — and re-run step 3 with the corrected recipe.

## Honest scope

- Extraction quality is the calibrated 3b-local tier (Phase ε arm A
  lineage): structural Jaccard ≈ 0.2 baseline + grounding. The graph that
  lands is a STARTING map for intent-first editing, not a finished one —
  refinement happens through the normal walker loop (`:propose-update`).
- `--ensemble high-confidence` (3× llama3.2:3b voting) is available when
  coverage matters more than wall-clock; the first run used single-pass.
- Re-ingesting after large code changes re-proposes; dedupe/refresh of
  EXISTING nodes is manual today (reject duplicates, `:propose-update` the
  survivors). A smarter re-ingest is future work.
