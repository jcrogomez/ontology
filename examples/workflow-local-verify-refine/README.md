# workflow-local-verify-refine — the ζ live pass, sized for local models

A verify-refine graph deliberately sized so a **local 7B coder on an
8 GB Mac** can complete it: one generator, one verifier, one corrector,
accept after 2 consecutive passes, reject after 8 pass-less
verifications. Prompts are short on purpose (local models are
prefill-bound — the 2026-05-29 attempt died on 6.5 KB verify prompts).

It declares an **O4 output contract** (`provides: slugify` with a
written signature + `artefactLanguage: typescript`), so an accepted run
with `--as-proposal` exercises the full execution→intent chain against
a real LLM:

```
real dispatches → accept → wfrun_* run record persisted
  → node proposal born with workflow_run source + measured contract
  → onto proposal apply --check-providers --strict
```

## Registered success criteria (what counts as the "clean pass")

1. `verdict: accept` within `--max-steps 30`.
2. A `wfrun_*` record exists under `.ontology/runs/` and self-certifies.
3. The proposal's `source.kind` is `workflow_run` and its payload carries
   the measured `provides` (+ signature when the model wrote it exactly).
4. `onto proposal apply <id> --check-providers --strict` exits 0 and the
   node exists.

A reject or a step-budget exhaustion is a recorded finding, not a
failure of the runtime — re-run once (sampling variance) before
concluding anything.

## Run it

```bash
# 0. sanity: Ollama up, model present
ollama list | grep qwen2.5-coder

# 1. validate the graph shape ($0, no dispatch)
npm run dev -- workflow run examples/workflow-local-verify-refine/graph.json \
  --input examples/workflow-local-verify-refine/input.txt --dry-run

# 2. THE LIVE RUN (local, $0; expect ~5–20 min on an 8 GB Mac)
npm run dev -- workflow run examples/workflow-local-verify-refine/graph.json \
  --input examples/workflow-local-verify-refine/input.txt \
  --provider ollama --model qwen2.5-coder:7b \
  --max-steps 30 \
  --as-proposal --proposal-level workflow --proposal-kind action \
  --proposal-label "slugify (zeta live, local)" \
  --trace .ontology.zeta-live-trace.json

# 3. inspect the provenance chain (ids printed by step 2)
npm run dev -- proposal show proposal_XXXX
cat .ontology/runs/wfrun_XXXXXXXX.json

# 4. close the loop with the full gate
npm run dev -- proposal apply proposal_XXXX --check-providers --strict
```

Scope note: this demonstrates the runtime live on a task a 7B can pass.
The frontier-quality pass on a real editorial checklist (Semillas §14)
remains a separate, budget-gated item — see `docs/ROADMAP.md`.
