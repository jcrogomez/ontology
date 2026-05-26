# IMO verify-refine — workflow runtime example

Worked example for the Phase ζ workflow runtime (`onto workflow run`).
Models the verify-refine agent flow from **Huang & Yang 2025**
([arXiv:2507.15855v4](https://arxiv.org/abs/2507.15855)) — see also the
upstream repo at <https://github.com/lyang36/IMO25> for the canonical
prompts and reference logs.

## Mapping to Figure 1 of the paper

| Paper step | Workflow node | Kind | Role |
|---|---|---|---|
| Step 1: Initial solution generation | `step1_initial_generation` | generator | Solve the problem from scratch. |
| Step 2: Self-improvement | `step2_self_improvement` | generator | Refine the draft into a tighter solution. |
| Step 3: Verification | `step3_verification` | verifier | Strict referee; emits `{verdict, severity, issues}` JSON. |
| — *(state preservation)* | `step3b_revisit` | generator (pass-through) | Echo the candidate solution unchanged so the verifier can re-check the SAME artefact on the next iteration. v0 hack — see "Pass-through node" below. |
| Step 4: Bug report review (optional) | `step4_bug_report_review` | generator | Read the verifier's critique; enumerate load-bearing bugs. |
| Step 5: Correction | `step5_correction` | generator | Apply the bug report; produce a corrected solution. |
| Step 6: Accept | `step6_accept` | terminal | Reached after 5 consecutive verifier passes. |
| Step 6': Reject | `step6_prime_reject` | terminal | Reached after 10 consecutive major-issue verifications. |

## Branch semantics on Step 3 (verifier)

The verifier's outgoing edges are evaluated **in declaration order**
on every visit. The first predicate that matches fires; if none
match, the workflow rejects with `no_matching_branch`. The order in
`graph.json` is deliberate:

1. `consecutive(verdict == "pass", 5)` → `step6_accept` — once 5
   straight passes accumulate, accept terminates immediately, even
   if the recent history mixed in failures elsewhere.
2. `since_last(verdict == "pass") >= 10 && severity == "major"` →
   `step6_prime_reject` — only fires when 10 visits have happened
   without any intervening pass AND the most-recent visit's severity
   is major.
3. `verdict == "pass"` → `step3b_revisit` — a pass that does not yet
   satisfy the 5-consecutive criterion; route through the pass-
   through node to preserve the artefact for re-verification.
4. `verdict == "fail"` → `step4_bug_report_review` — kick off the
   correction loop.

## Pass-through node

The pass-through generator (`step3b_revisit`) exists because the v0
executor's edge semantic is *output-forwards*: a node's text output
becomes the next node's input. For a verifier that emits a JSON
verdict, naively forwarding that JSON to a self-loop would have the
verifier re-verifying its own verdict on the next iteration — a
degenerate measurement.

The pass-through node, set with `"passThrough": true`, **does no LLM
dispatch**. Its output equals its input verbatim. Wiring it between
the verifier's pass-but-not-yet-5 branch and the verifier itself
preserves the candidate solution across the loop, so each
re-verification sees the SAME artefact and the LLM's per-call variance
drives the 5-consecutive criterion.

This is a v0 design hack. v1 may add explicit state primitives (a
"stash this input under name X" / "load X as input for the next
visit" pair) that would let workflows preserve artefacts without
needing dedicated pass-through nodes. For now, pass-through stays in
the executor surface as a small, well-defined escape hatch.

## How to run

A small toy problem ships in `input-toy.txt`. From the project
root:

```bash
# Dry-run: validates the graph + input, walks the path, no LLM spend.
npx tsx src/cli.ts workflow run examples/workflow-imo-verify-refine/graph.json \
  --input examples/workflow-imo-verify-refine/input-toy.txt \
  --dry-run

# Real run against anthropic (requires ANTHROPIC_API_KEY):
npx tsx src/cli.ts workflow run examples/workflow-imo-verify-refine/graph.json \
  --input examples/workflow-imo-verify-refine/input-toy.txt \
  --provider anthropic \
  --model claude-opus-4-7 \
  --max-steps 80 \
  --trace /tmp/imo-trace.json

# Or against ollama:
npx tsx src/cli.ts workflow run examples/workflow-imo-verify-refine/graph.json \
  --input examples/workflow-imo-verify-refine/input-toy.txt \
  --provider ollama \
  --model qwen2.5-coder:7b \
  --ollama-host http://localhost:11434
```

In dry-run mode the verifier always emits `verdict: "pass"` (see the
executor's `dryRunVisit` helper), so the workflow walks the
pass-loop 5 times via `step3 → step3b_revisit → step3 → ...` and
terminates on `step6_accept`. The trace shows how the predicate DSL
counts the consecutive passes.

## v0 caveats

- The graph is faithful to Figure 1 in structure, but the prompts
  shipped here are short approximations of Huang & Yang's full
  prompts. Their canonical wording lives in `code/agent.py` of the
  [IMO25 upstream repo](https://github.com/lyang36/IMO25) — you may
  point this graph at richer prompts by editing
  `prompt` fields in `graph.json`.
- `input-toy.txt` is a deliberately small problem, not a real IMO
  2025 statement (those carry their own attribution requirements).
  Substitute the upstream `problems/*.txt` files when you want to
  reproduce the paper's results.
- Real runs against Anthropic / Ollama can take many minutes per
  cycle. The `--max-steps` cap is the only safety net — set it
  conservatively while iterating.

## Citation

```bibtex
@article{huang2025gemini,
  title={Gemini 2.5 Pro Capable of Winning Gold at IMO 2025},
  author={Huang, Yichen and Yang, Lin F},
  journal={arXiv preprint arXiv:2507.15855},
  year={2025}
}
```
