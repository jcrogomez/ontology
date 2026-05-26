# Pre-registered hypothesis

> *Filed before running any pipeline iterations against post-cutoff
> problems. The demo problem (`imo2025_p1.json`) is plumbing only and
> does NOT count toward this experiment — it is in training data and
> any accept verdict there proves nothing about lift.*
>
> *Updated 2026-05-25 (post-execution-redirect): the default backend
> is now Ollama (local 7B), not Anthropic. The Anthropic arm is opt-in
> via `--backend anthropic` and remains the canonical replication
> target, but is held until budget signal warrants it. The Ollama arm
> is genuinely novel because the paper only ran on frontier models —
> whether a verify-refine loop lifts a weak base model is the more
> interesting (and cheaper) question.*

## H1-ollama — pipeline lift on a weak local base model

**Claim.** The verification-and-refinement pipeline, with prompts
byte-identical to upstream `agent.py`, lifts `qwen2.5-coder:7b`
above its own single-pass best-of-N baseline on the USAMO 2026
cohort, when both solver and verifier are the same 7B model.

**Operational form.** Let
- $b_O$ = qwen2.5-coder:7b accuracy on $N = 6$ problems, single-pass
  best-of-$k$ with $k = 4$ (smaller than paper's 32 / scaffold's 8
  because each candidate is a 1-3 minute local generation).
- $p_O$ = same model, one pipeline run per problem, accept threshold
  5 consecutive verifier passes (upstream default).

**Prediction.** $p_O \ge 1.5 \cdot b_O$ when $b_O > 0$, OR $p_O \ge
0.15$ when $b_O = 0$ (this is a much weaker prior than for the
frontier arm because qwen-7B is a *coder* model, not math-tuned;
the loop has more room to lift but the ceiling is also lower).

**Falsifier.** $p_O \le b_O$. If the pipeline does no better than
best-of-4 single-pass, the loop adds nothing on a weak base model
— the paper's lift would be ceiling-effect of frontier capacity,
not a general property of the loop shape.

**Cost ceiling.** $0. Local-only. Wall-clock ceiling: ~6 hours
total compute (cohort of 6 × ~30 min average pipeline + 6 × ~10
min baseline + grading). Stop after the next problem completion
once 6 h elapsed.

## H1-anthropic — frontier replication (opt-in, held)

**Claim.** Same pipeline, driven by Claude Sonnet 4.6, reproduces a
substantial accuracy lift on USAMO 2026.

**Prediction.** $p_A \ge 2 \cdot b_A$ when $b_A > 0$, OR $p_A \ge
0.4$ when $b_A = 0$ (matches the original frontier prior).

**Falsifier.** $p_A < 1.3 \cdot b_A$.

**Cost ceiling.** Total spend ≤ $50 (Sonnet primary; Opus 4.7 spot-
check up to 2 problems if Sonnet results merit a ceiling test).
**Status: held** — only run after the Ollama arm produces
informative data (either confirming or falsifying H1-ollama).

## H2 — verifier honesty under accept

**Claim.** Of pipeline runs that *accept* (5 consecutive verifier
passes), the proportion whose accepted solution is correct against
the official answer is at least 0.7.

**Operational form.** Let
- $A$ = number of accept verdicts in the cohort.
- $A^+$ = number of accepts whose final solution matches the
  official answer in the auto-grader.

**Prediction.** $A^+ / A \ge 0.7$.

**Falsifier.** $A^+ / A < 0.5$. Below this, the verifier is more
generous than discriminating, and accept-verdicts are not informative.

This is the metric the paper acknowledges it does NOT quantify
(§2.3, "we do not have quantitative results on [the verifier's]
effectiveness"). H2 fills that gap on our cohort.

## What we are NOT pre-registering

- **Iteration count to accept.** Descriptive, not predictive — we'll
  report the distribution but don't bind it.
- **Token usage and time-to-accept.** Same.
- **Which problems pipeline solves vs base.** Per-problem outcomes
  are the data, not the hypothesis.

## Stopping rules

1. Total spend approaches \$50 → stop after the next clean
   completion, write up what's there.
2. Pipeline accept rate is 0/5 on the first five problems → stop,
   diagnose plumbing / contamination, do not just keep spending.
3. Pipeline accept rate is 5/5 with all-correct verdicts → still
   run the remaining cohort. A short cohort with a perfect score is
   weaker evidence than a longer cohort with mixed outcomes.

## What "reproducing the lift" would mean for ontology

Not directly transferable — math problems are not code regeneration.
What *would* transfer if H1 holds:

- The Critical-Error / Justification-Gap classification is
  actionable as a routing primitive (critical → re-extract;
  gap → expand context). Worth porting to Ontology's verify loop
  as a separate experiment.
- The "Honesty About Completeness" solver-prompt instruction
  is a portable phrasing of Ontology's "tools promising 100 %
  fidelity always lie" ethos. Direct prompt transplant candidate.
- The "5 consecutive verifier passes to accept" criterion maps
  onto Ontology's `--reps` flag. The math result, if it holds,
  is evidence the criterion is informative beyond just averaging
  noise away.

If H1 *fails*, the lessons above are still cheap-to-port hypotheses
worth their own falsifiable test — but with weaker priors.

---

*Filed 2026-05-25. Replication of the pipeline from
[arXiv:2507.15855v4](https://arxiv.org/abs/2507.15855).*
