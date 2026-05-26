# verify-refine-math

Replication harness for the verification-and-refinement pipeline from
Huang & Yang, *"Winning Gold at IMO 2025 with a Model-Agnostic
Verification-and-Refinement Pipeline"* ([arXiv:2507.15855v4][paper];
public code at [github.com/lyang36/IMO25][upstream]).

The paper's claim: a prompt-engineered pipeline lifts frontier LLMs
from a single-pass-best-of-32 accuracy of **21–38 %** to **~85.7 %**
(5 / 6) on IMO 2025 problems. Independent validation by MathArena on
IMC 2025 reproduced a comparable lift (57.7 % → 94.5 %, rank #92 → #3
of 434 humans).

This experiment tests whether the same pipeline — solver and verifier
prompts byte-identical to upstream `code/agent.py` — reproduces a
lift on a post-cutoff math cohort (USAMO 2026, March 21-22 2026).
Two backends are supported:

- **Ollama (default, $0)** — local 7B models on the project's 8 GB
  Mac, primarily `qwen2.5-coder:7b`. Tests whether the loop shape
  lifts a *weaker* base model than the paper used; this is the
  more interesting question because the paper's pipeline ran on
  frontier models where a 21 → 86 % lift was visible but partly
  ceiling-bound.
- **Anthropic (opt-in, paid)** — Sonnet 4.6 / Opus 4.7 as the
  comparable hosted tier to the paper's Gemini 2.5 Pro / GPT-5.

This experiment is **inside the ontology repo** (at
`experiments/verify-refine-math/`) because (a) ontology already has
the Ollama infrastructure from the Move 3α work and (b) replication
findings feed directly into the cartography-matrix design.

## Status

- [x] Pipeline (solver, verifier, 6-step loop with critical/gap
      classification + 5-consecutive-pass accept). Prompts
      byte-identical to upstream `agent.py`.
- [x] Ollama backend (qwen2.5-coder:7b default; aliases for the
      other 7B-or-under models on disk).
- [x] Anthropic backend (Sonnet/Opus/Haiku aliases).
- [x] USAMO 2026 cohort (6 problems), Evan Chen verbatim, MathArena
      cross-check for P2.
- [x] One plumbing problem (IMO 2025 P1) — contamination=high,
      explicitly disclaimed as non-supporting of any lift claim.
- [ ] Baseline runs (single-pass best-of-N).
- [ ] Pipeline runs across the cohort.
- [ ] Grading + comparison.

See [`HYPOTHESIS.md`](HYPOTHESIS.md) for the pre-registered claim,
falsifier, and cost / wall-clock budgets per backend.

## Quick start

```sh
# 1. Install
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 2. Confirm ollama is running and qwen2.5-coder:7b is on disk
curl -s http://localhost:11434/api/tags | python3 -c \
    'import json,sys; d=json.load(sys.stdin); print([m["name"] for m in d["models"]])'

# 3. Plumbing smoke (1 iteration, ~3-8 min wall on qwen-7B; cost $0)
python3 scripts/run.py --problem problems/usamo2026_p4.json \
                       --backend ollama --model qwen2.5-coder:7b \
                       --accept-passes 1 --max-iterations 2 \
                       --reject-after-critical 3 --max-output-tokens 3000

# 4. Full pipeline on one problem (cohort default config; wall time
#    highly variable per problem, 15-60 min on qwen-7B)
python3 scripts/run.py --problem problems/usamo2026_p4.json --backend ollama

# 5. Cohort runner — sequentially across all 6 USAMO 2026 problems
bash scripts/run_cohort.sh

# 6. Optional baseline (best-of-N single-pass)
python3 scripts/baseline.py --problem problems/usamo2026_p4.json \
                            --backend ollama --samples 4

# 7. Summary across runs/
python3 scripts/compare.py

# --- Anthropic backend (paid) ----------------------------------------
export ANTHROPIC_API_KEY=sk-ant-...
python3 scripts/run.py --problem problems/usamo2026_p4.json \
                       --backend anthropic --model sonnet
```

Each run writes a JSON trace to `runs/<problem-id>__<model>__<ts>.json`
with every solver / verifier / correction step, token usage, latency,
and the final verdict (accept / reject / max-iter / error).

## Why this is in `ontology/experiments/` rather than a sibling

Two reasons:

1. The ollama infrastructure already lives in ontology — Move 3α used
   `qwen2.5-coder:7b` extensively, the calibration log catalogues
   model-by-model performance on this hardware, and any cross-model
   lessons transfer back to the cartography matrix.
2. The strategic memory `phase-e-close-status` puts the verify-refine
   replication in the bucket of "Phase ε close evidence" — it
   strengthens or weakens the claim that the matrix is the right
   instrument for *the kind of intervention that pipelines like this
   one are*. Keeping the code adjacent to ontology makes the cross-
   reference cheap.

The replication itself is **standalone Python** with no imports from
ontology's TypeScript pipeline; only the directory placement is
shared.

## Caveats

- **Contamination of the plumbing problem.** `imo2025_p1.json` is in
  the training data of any frontier model released after July 2025.
  The plumbing problem is for end-to-end wiring validation only — a
  correct verdict there proves the loop runs, not that the loop
  *lifts* anything. Real lift claims require the USAMO 2026 cohort.
- **No human grading by default.** The paper relied on MathArena for
  independent grading on IMC 2025. This repo grades by *automated
  comparison to the official answer* supplied in each problem JSON
  (P1: $H_n-1$; P4: $2^{2026}-1$; P2: Yes). That's weaker than human
  grading but transparent — every judgement is reproducible from
  the run trace.
- **Single base model per run.** The paper showed model-agnostic
  results across Gemini / Grok / GPT-5. This harness tests one
  base model at a time per run; cross-model comparison is the
  experiment's job, not the runner's.
- **Wall-clock cost on Ollama.** Local 7B inference on an 8 GB Mac
  is ~5-20 tok/s. A single pipeline run can take 15-60+ minutes
  depending on how many iterations the verifier requires. The
  cohort default is `keep_alive=10m` so the model stays in VRAM
  between calls.

[paper]: https://arxiv.org/abs/2507.15855
[upstream]: https://github.com/lyang36/IMO25
