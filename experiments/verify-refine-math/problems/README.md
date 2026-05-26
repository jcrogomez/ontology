# Problem corpus

Each problem is one JSON file with the schema:

```json
{
  "id": "string — file basename",
  "source": "human-readable provenance",
  "contamination_status": "explicit assessment of whether the model has likely seen this problem in training",
  "problem_statement": "full TeX-formatted statement, ready to interpolate into the solver prompt",
  "official_answer": "TeX-formatted concise answer",
  "official_answer_natural": "natural-language restatement of the answer for the auto-grader",
  "grading_notes": "what makes a solution correct vs partial vs wrong"
}
```

## What's here

| File | Source | Domain | Contamination | Use |
|---|---|---|---|---|
| `imo2025_p1.json` | IMO 2025, P1 | combinatorial geometry | **high** | plumbing only |
| `usamo2026_p1.json` | USAMO 2026, P1 (Andreescu, Dospinescu) | algebra / floor | **low** | H1/H2 cohort |
| `usamo2026_p2.json` | USAMO 2026, P2 (Dittmer) | combinatorics / game | **low** | H1/H2 cohort |
| `usamo2026_p3.json` | USAMO 2026, P3 (Guerrero) | geometry | **low** | H1/H2 cohort |
| `usamo2026_p4.json` | USAMO 2026, P4 (Schildkraut) | number theory | **low** | H1/H2 cohort |
| `usamo2026_p5.json` | USAMO 2026, P5 (An) | geometry | **low** | H1/H2 cohort |
| `usamo2026_p6.json` | USAMO 2026, P6 (Feng, Shen) | number theory | **low** | H1/H2 cohort |

**USAMO 2026 cohort.** Held 2026-03-21/22, after the January 2026
knowledge cutoff of Claude Opus 4.7 / Sonnet 4.6. Problems were
publicly available from late March 2026 onward (AoPS wiki, MathArena
2026-03-28, Evan Chen's solution notes 2026-05-16); models with
training cutoffs after that date may have seen them, so verify the
exact cutoff of whichever model you run. P2 is a borderline case
because Evan Chen's notes mark its solution as "to be added later"
(as of 2026-05-16) — community solutions exist via AoPS and the
MathArena benchmark, but the official answer (`Yes — Annie can
always win`) is sourced from MathArena rather than Evan Chen.

**Why this cohort.** Six problems, the same size as the IMO/IMC
cohorts the paper used. Two from Day 1 are algebra/combinatorics,
one is geometry; Day 2 is one number theory, one geometry, one
number theory. That domain mix matters because the paper observed
their pipeline failed consistently on IMO 2025 P6 (combinatorics) —
a small cohort with a single failure mode would inflate the apparent
lift. The USAMO 2026 mix spans enough domains to surface failure
patterns honestly.

**MathArena prior** (https://matharena.ai/usamo/, 2026-03-28):
single-pass-best-of-N accuracies on USAMO 2026 ranged from 35.1 %
(GLM-5) to 95.2 % (GPT-5.4); Opus 4.6 scored 47.0 %. These are the
baselines the pipeline lift in `HYPOTHESIS.md` is measured against
when grounded in this cohort.

## What's needed beyond this cohort

If H1 holds on USAMO 2026, additional cohorts strengthen the claim:

- **IMC 2026** (August 2026): not yet held at the time of this
  scaffold; cleanest post-cutoff replication once available.
- **HMMT November / February 2027** or **Putnam 2026 (Dec 2026)**:
  future post-cutoff cohorts.

Avoid adding pre-2026 problems unless explicitly marked
plumbing-only (like `imo2025_p1.json`); they conflate base-model
memorization with pipeline lift.

For each problem you add:

1. Verify the problem was released **after** the cutoff of the model
   you intend to run. Otherwise the contamination_status must be
   honest about it and any results are plumbing-only.
2. Include the official answer (or at least the official answer's
   key result/value/structure) so `scripts/compare.py` can grade.
3. State the grading_notes precisely — Olympiad problems often have
   multiple equivalent correct phrasings; the notes should make
   clear what counts as "the same answer."

## Not in scope

- **Geometry problems requiring diagrams.** The IMO paper avoids
  geometry-heavy problems in their main results because diagrams
  break in plain-TeX prompts. Stick to algebra / number theory /
  combinatorics for v0.
- **Problems with multi-part answers** where partial credit matters.
  The auto-grader treats correct vs. partial as a binary; if the
  competition awards 1/7 / 4/7 / 7/7, this harness can't replicate
  that nuance.
