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
| — *(loop-back)* | `step3b_revisit` | generator (pass-through) | A no-dispatch loop-back node on the pass branch so the verifier re-runs on the next iteration. The candidate solution is preserved by the executor's artefact slot, not by this node — see "Dataflow" below. |
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
   satisfy the 5-consecutive criterion; loop back through the
   pass-through node to re-verify.
4. `verdict == "fail"` → `step4_bug_report_review` — kick off the
   correction loop.

## Dataflow: the artefact slot and prompt variables

The executor threads three values through the run, and node prompts
pull what they need via template variables (spec §3.4.1):

- `${ARTIFACT}` — the **current solution under refinement**. A
  generator's output replaces it, *except* when the node is
  pass-through or sets `"emitsArtifact": false`. Verifiers read the
  artefact, never the previous verdict.
- `${CRITIQUE}` — the most recent verifier's verbatim output.
- `${INPUT}` — the immediate predecessor's output.

This is what makes the loop sound:

- **Verifier** (`step3_verification`) reads `${ARTIFACT}`, so a
  re-verification on the pass loop checks the SAME solution — never
  its own verdict JSON — and the LLM's per-call variance drives the
  5-consecutive criterion.
- **Bug-report review** (`step4_bug_report_review`) is marked
  `"emitsArtifact": false`: its output is a scratch bug report, so it
  does NOT overwrite the solution. It reads `${CRITIQUE}`.
- **Correction** (`step5_correction`) reads BOTH the solution it must
  fix (`${ARTIFACT}`) and the bug report (`${INPUT}`), then emits the
  corrected solution as the new artefact.

The pass-through node (`step3b_revisit`, `"passThrough": true`) does no
LLM dispatch — it just loops the pass branch back to the verifier.
Artefact preservation is handled by the artefact slot above, so the
pass-through node carries no state of its own; it exists only because
the verifier needs an outgoing edge target to loop through. A node
that uses no `${…}` variable falls back to legacy composition: the
predecessor's output is appended under an `INPUT:` heading.

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
