# Calibration procedure — Vibe-Reasoning repo

**Target:** https://github.com/Julius-Woo/Vibe-Reasoning
**Why this repo:** the user-shared "Vibe Reasoning" project — a
case study on IMO 2025 P6 — happens to be a real-world artifact
that exercises Ontology's auto-digest end-to-end without us
having to manufacture a synthetic fixture. 24 Python files (the
scripts an LLM wrote during the IMO P6 session) + 17 Markdown
traces (the conversation snapshots). It is **not** TypeScript, so
γ-4 static-edge inference is skipped; γ-1 / γ-3 / γ-5 / γ-6
work fine on Python via the new `--include py` flag.

This document is the runbook. It tells you exactly what to run,
estimates cost up front, and explains what to expect.

---

## 0. Prerequisites

| | |
|---|---|
| Ontology HEAD | a `main` with γ-6 + walker AI indicator merged (commit `69424af` or later) |
| Ollama running | optional but recommended for the free pass — `ollama serve` plus `ollama pull qwen2.5-coder:3b` if not already pulled |
| `ANTHROPIC_API_KEY` | required only for the frontier pass; stored in macOS Keychain per the team convention (`security add-generic-password -a "$USER" -s "ANTHROPIC_API_KEY" -w`) |
| Disk | ~50 MB for the repo clone + the `.ontology/` it grows |

---

## 1. Clone the target repo

```sh
mkdir -p /tmp/vibe-reasoning-calibration
git clone https://github.com/Julius-Woo/Vibe-Reasoning.git /tmp/vibe-reasoning-calibration/repo
```

The Markdown traces and the PDF live at the top level; the Python
sources live under `/tmp/vibe-reasoning-calibration/repo/trace_files/`.
We will ingest the Python directory only (the markdown traces are
documentation about the AI session, not source code to compile back).

```sh
ls /tmp/vibe-reasoning-calibration/repo/trace_files/*.py | wc -l
# Expect: 24
```

---

## 2. Bootstrap the Ontology project

```sh
mkdir -p /tmp/vibe-reasoning-calibration/onto
cd /tmp/vibe-reasoning-calibration/onto
onto init
```

Initialising in a sibling directory (not inside the cloned repo)
keeps the `.ontology/` out of the target's tree and lets you
redo the experiment cleanly by `rm -rf onto` without touching the
source.

Verify the walker shows the AI indicator. With `ANTHROPIC_API_KEY`
exported you should see:

```
AI:  anthropic
```

With only Ollama:

```
AI:  ollama (local)  (http://127.0.0.1:11434)
```

With nothing:

```
AI:  none — mock fallback
```

---

## 3. Cost estimate

24 source files, ~per-file token cost from γ-2 single-file
calibration (`hash.ts`, ~57 LoC): ~2900 tokens at Opus 4.7 prices →
~$0.08. The Vibe-Reasoning Python files vary in size (50–200 LoC);
budget ~$0.05–0.15 per file.

| Pass | Files | Total cost | Wall-clock |
|---|---:|---:|---:|
| Ollama / qwen2.5-coder:3b | 24 | **$0** | ~5–10 min (local CPU/GPU) |
| Anthropic / Opus 4.7 | 24 | **~$2** | ~5–10 min (sequential dispatch) |
| Anthropic / Sonnet 4.6 | 24 | **~$1.20** | ~3–5 min |
| Anthropic / Haiku 4.5 | 24 | **~$0.40** | ~2–3 min |

> The β-2 hash.ts calibration with `qwen2.5-coder:3b` scored 3/5
> ε-equivalent on a pure-utility file; the γ-2 hash.ts calibration
> with Opus 4.7 scored 5/5. Expect Ollama to underperform Anthropic
> on Vibe-Reasoning's files in roughly the same direction. The
> Ollama pass is useful for verifying the pipeline mechanics; the
> Anthropic pass is the actual calibration data point.

The cycle has THREE LLM-spending steps. Cost above is for **step 3
only** (ingest). Steps 5 and 8 are also LLM dispatches:

- **Step 3** (ingest) — once per file. ~24 calls.
- **Step 5** (compile-back per node) — once per applied node.
- **Step 8** (re-compile or verify-homeomorphism if implemented) — same as step 5.

Total ceiling per pass on Anthropic Opus 4.7: roughly 3× the ingest
cost, so **~$6 worst case for a full Opus pass**, **~$0 for Ollama**.

---

## 4. Ollama pass (zero cost) — recommended first

```sh
cd /tmp/vibe-reasoning-calibration/onto

# 4a. Dry-run first — verify the walker picks up all 24 .py files
#     and the extraction template doesn't choke on Python syntax.
onto ingest /tmp/vibe-reasoning-calibration/repo/trace_files \
  --provider ollama --model qwen2.5-coder:3b \
  --include py \
  --dry-run --json | tee /tmp/vibe-dry-run.json | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(f'files={d[\"fileCount\"]}  ok={d[\"okCount\"]}  failed={d[\"failedCount\"]}')
for r in d['results']:
    flag = '✓' if r['ok'] else '✖'
    label = r.get('extracted', {}).get('label', r.get('reason', ''))
    print(f'  {flag} {r[\"filePath\"]:50s} {label}')
"

# 4b. Commit. Drops --dry-run. Writes 24 node_create proposals
#     under .ontology/proposals/.
onto ingest /tmp/vibe-reasoning-calibration/repo/trace_files \
  --provider ollama --model qwen2.5-coder:3b \
  --include py \
  --json > /tmp/vibe-ingest-ollama.json

# 4c. Inspect a couple of proposals before applying.
onto proposal list --json | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(f'{len(d[\"proposals\"])} proposals pending')
"
onto proposal show $(onto proposal list --json | python3 -c "import json,sys; print(json.load(sys.stdin)['proposals'][0]['id'])")

# 4d. Apply all proposals.
for p in $(onto proposal list --json | python3 -c "
import json, sys
d = json.load(sys.stdin)
for p in d['proposals']:
    if p['status'] == 'pending':
        print(p['id'])
"); do
  onto proposal apply "$p" --json > /dev/null
done

# 4e. Skip γ-6 — the repo is Python; the TS-only static-edge
#     inference would find no imports it understands. (Multi-file
#     edges for Python require a future γ-7 Python parser.)

# 4f. Sanity check: 24 new nodes under .ontology/nodes/.
ls .ontology/nodes/ | wc -l
# Expect: 25 (canon + 24 ingested)
```

What the Ollama pass gives you:

- Validates the pipeline mechanics end-to-end on a non-TS repo.
- Gives a 24-node intent network for the IMO P6 work the
  researchers did.
- Costs nothing.
- Quality ceiling is `qwen2.5-coder:3b` — expect rough extractions
  (some files may fail the Zod schema because the model emits
  malformed JSON; those land as `failed` in step 4a's report and
  no proposal is created).

---

## 5. Anthropic pass (~$2) — the real calibration

```sh
# Sanity-check the AI indicator before paying. Both should be set
# to anthropic; the walker indicator + model doctor confirm.
ANTHROPIC_API_KEY="$(security find-generic-password -a "$USER" -s "ANTHROPIC_API_KEY" -w)" \
  onto model doctor

# 5a. Dry-run with Anthropic to sanity-check the extraction quality
#     on 2–3 files before paying for all 24. Pick 3 representative
#     ones via --include but constrain the walk by passing the
#     subdir directly:
mkdir -p /tmp/vibe-anthropic-probe
cp /tmp/vibe-reasoning-calibration/repo/trace_files/check_fooling_set.py \
   /tmp/vibe-reasoning-calibration/repo/trace_files/visualize_solution.py \
   /tmp/vibe-reasoning-calibration/repo/trace_files/verify_general_bound.py \
   /tmp/vibe-anthropic-probe/

ANTHROPIC_API_KEY="$(security find-generic-password -a "$USER" -s "ANTHROPIC_API_KEY" -w)" \
  onto ingest /tmp/vibe-anthropic-probe \
    --provider anthropic --model claude-opus-4-7 \
    --include py --dry-run --json \
    > /tmp/vibe-probe.json

cat /tmp/vibe-probe.json | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(f'probe: {d[\"okCount\"]}/{d[\"fileCount\"]} extractions OK, total tokens: {d[\"totalTokens\"]}')"

# At this point inspect /tmp/vibe-probe.json by hand. The 'extracted'
# field per file should have a meaningful 'prompt', a 'kind' that
# matches what the file does (rule for pure functions, command for
# script-style entry points), and a non-trivial 'rules' / 'provides'
# array. If the extractions look reasonable, commit the full sweep.

# 5b. Full sweep on the real repo. ~$2 budget.
ANTHROPIC_API_KEY="$(security find-generic-password -a "$USER" -s "ANTHROPIC_API_KEY" -w)" \
  onto ingest /tmp/vibe-reasoning-calibration/repo/trace_files \
    --provider anthropic --model claude-opus-4-7 \
    --include py --json \
    > /tmp/vibe-ingest-anthropic.json

# 5c. Inspect + apply same as 4c–4d.
```

What the Anthropic pass gives you:

- **The headline calibration data point.** Per-file extraction
  cost recorded in `/tmp/vibe-ingest-anthropic.json` under
  `results[].tokensUsed`. Total tokens used + cost in the trailing
  `totalTokens` field. Compare the per-file extraction quality
  against the Ollama pass on the same files.
- The intent network this produces is the candidate for Phase ε
  (self-ingestion + verify-homeomorphism), once δ-1 lands.

---

## 6. Compile-back round-trip per node (the F ∘ G measurement)

Phase γ ships ingest (G); compile-back (F) is the existing `onto
compile run`. For each applied node, we can manually run the
round-trip — the same way the γ-2 hash.ts calibration did. δ-1
(`onto verify-homeomorphism`) would automate this into a single
command; until it lands, the manual loop is:

```sh
mkdir -p /tmp/vibe-regenerated

# For each ingested node:
for nodeId in $(onto node list --json | python3 -c "
import json, sys
nodes = json.load(sys.stdin)['nodes']
for n in nodes:
    if n['outputs']['files'] and n['outputs']['files'][0].endswith('.py'):
        print(n['id'])
"); do
  # Drop the requires that came from the extraction — there's no
  # provider graph yet, the validator would block compile.
  onto node update "$nodeId" --requires "" --json > /dev/null

  # Determine the original source file path from outputs.files[0].
  src_rel=$(onto node show "$nodeId" --json | python3 -c "
import json, sys
print(json.load(sys.stdin)['outputs']['files'][0])
")
  src=/tmp/vibe-reasoning-calibration/repo/$(basename "$src_rel")
  target=/tmp/vibe-regenerated/$(basename "$src_rel")

  # Compile back through Anthropic (or Ollama).
  ANTHROPIC_API_KEY="$(security find-generic-password -a "$USER" -s "ANTHROPIC_API_KEY" -w)" \
    onto compile run "$nodeId" \
      --provider anthropic --model claude-opus-4-7 \
      --target "$target" --force --json > /dev/null

  # Diff.
  if diff -q "$src" "$target" > /dev/null; then
    echo "$nodeId  =  $(basename $src)"
  else
    loc_orig=$(wc -l < "$src")
    loc_regen=$(wc -l < "$target")
    echo "$nodeId  ≠  $(basename $src)  (orig=$loc_orig regen=$loc_regen)"
  fi
done
```

The script above is **the** measurement. For each file:

- Identical → semantic AND structural homeomorphism (rare).
- Different → divergent. Report LoC churn distance vs the
  γ-2 hash.ts bound (~$d \approx 0.3$ for ε-equivalent under the
  current §2.5 metric; comment-density divergence above that often
  hides semantic equivalence — see γ-2's writeup).

---

## 7. Reporting

The calibration deliverable per pass is a small markdown file
analogous to `HASH_TS_2026-05-12.md`:

- Setup (which model, which pass)
- Per-file extraction quality (eyeball'd from step 4a / 5a output)
- Per-file round-trip verdict (from step 6, with LoC numbers)
- Aggregate: how many files survived ε-equivalent vs divergent vs
  failed-to-extract
- Cost + wall-clock totals
- Intent-resistant complement: which files (if any) don't survive
  the round-trip and what irreducible specificity each carries

Write the report at:

```
docs/legend/calibrations/VIBE_REASONING_<YYYY-MM-DD>_<provider>.md
```

—e.g. `VIBE_REASONING_2026-05-13_anthropic-opus-4-7.md`.

---

## 8. Cleanup

```sh
rm -rf /tmp/vibe-reasoning-calibration
rm -rf /tmp/vibe-anthropic-probe /tmp/vibe-regenerated
rm /tmp/vibe-*.json
```

The Ontology project under `.ontology/` is regenerable from the
clone + this runbook; nothing in it needs to be persisted unless
you want to keep the intent network for further analysis (in
which case mv it under `~/Ontology-archives/vibe-reasoning/` or
similar).

---

## What this calibration is good for

- **Validates auto-digest on a non-TS / non-Ontology codebase.**
  The γ-2 calibration was a single Ontology source file — a known
  intent-faithful candidate by design. Vibe-Reasoning is real
  external code written for a different purpose; the intent
  extraction has to work on prose the project authors wrote, not
  on prose we authored.

- **Compares Ollama vs Anthropic on the same fixtures.** Two
  passes over the same 24 files produce two distributions of
  per-file verdicts — directly comparable.

- **Surfaces irreducible specificity in real code.** Python
  scripts that use specific library functions (numpy / matplotlib
  signatures, exact algorithms) are the natural home for
  `node.literal` (β-2). The calibration will show which.

## What it is NOT

- Not enough data to claim the adjunction (§3.10 in
  MATHEMATICAL_CLAIMS.md) at scale — that's Phase ε, the
  self-ingestion of the Ontology repo itself.
- Not a multi-file edge measurement — Python imports aren't
  parsed by γ-4 yet. The cross-file graph is empty for this
  pass.
- Not automated — manual loop for compile-back diff. δ-1
  (`onto verify-homeomorphism`) will automate it.
