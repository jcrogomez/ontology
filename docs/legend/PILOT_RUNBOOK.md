# Phase ε pilot runbook

> *Operational sequence for running the canonical Phase ε self-ingestion
> against Ontology. The Ollama pass validates mechanics at $0; the
> Anthropic pass is the publishable measurement. Both run under the
> framework declared in [`docs/POSITIONING.md`](../POSITIONING.md), with
> the prediction frozen in
> [`docs/legend/calibrations/SELF_INGEST_HYPOTHESIS_2026-05-13.md`](calibrations/SELF_INGEST_HYPOTHESIS_2026-05-13.md).*

**Pre-pilot tooling spec:** [`PREWORK_2026-05-13.md`](PREWORK_2026-05-13.md)
(A–E).
**Sequencing constraint** (per the project memory): Ollama dry-run +
full pilot first, then Anthropic — only after all $0 tooling pre-work
has shipped.

---

## 0. Pre-flight gates

Before any LLM dispatch, confirm:

```sh
cd /Users/juancarlosromero/Development/ontology
npm run check                 # tsc --noEmit clean
npx vitest run tests/legend-matrix.test.ts \
              tests/legend-matrix-intersections.test.ts \
              tests/frontier-tagger.test.ts \
              tests/legend-fixture-tagger.test.ts \
              tests/verify-report-markdown.test.ts \
              tests/ingest-cli.test.ts   # all green
```

All five Phase-ε test files green and `npm run check` clean is the
canonical "prework landed" signal.

Then confirm Ollama is reachable and a `semantic_parse`-tier model is
pulled:

```sh
curl -s http://localhost:11434/api/version
curl -s http://localhost:11434/api/tags | jq '.models[].name'
# expected: qwen2.5-coder:7b (semantic_parse) and qwen2.5-coder:14b (code_sketch)
ollama pull qwen2.5-coder:7b      # ~4.7 GB
ollama pull qwen2.5-coder:14b     # ~9 GB, needed for verify compile-back
```

---

## 1. Workspace

Phase ε runs **outside** the Ontology project's own `.ontology/` to
avoid self-mutating the audit chain we're trying to measure. Use a
fresh directory:

```sh
PILOT_DIR=/tmp/onto-self-pilot-$(date +%Y%m%d)
mkdir -p "$PILOT_DIR" && cd "$PILOT_DIR"
onto init
```

Record the commit hash being measured (for the report header):

```sh
git -C /Users/juancarlosromero/Development/ontology rev-parse HEAD
```

---

## 1.5 Frontier preview (zero LLM)

Confirm the tagger assigns sensible attributes to every file in the
perimeter before paying for ingest. `onto frontier` walks the same
file set and prints the tag distribution:

```sh
PERIMETER=(
  /Users/juancarlosromero/Development/ontology/src/runtime
  /Users/juancarlosromero/Development/ontology/src/core
  /Users/juancarlosromero/Development/ontology/src/commands
  /Users/juancarlosromero/Development/ontology/src/schemas
)
onto frontier "${PERIMETER[@]}" --include ts,tsx --totals-only
```

Read the output:

- `Zero-tagged files: 0` — acceptance contract. Any other value means
  the tagger has a coverage gap; fix the path rules in
  `src/runtime/legend/frontier-tagger.ts` before the pilot.
- The distribution should show every predicted-faithful tag
  (pure-transform, schema-driven, algebraic-lawful, declarative-validator)
  AND every predicted-resistant tag (cli-parsing, io-bound,
  adapter-boundary, operational-glue) at non-zero counts. The
  `frontier-tagger.test.ts` perimeter-coverage tests pin this; reading
  the actual distribution is the human sanity check.
- `Fallback-only` count is informational. It's the number of files
  classified *only* as `operational-glue` (i.e. no more specific rule
  fired). Acceptable for glue regions; rising over time is the signal
  that a region deserves a more specific rule.

## 2. Cost estimate (zero LLM)

The next concrete action validates the perimeter and projects the
spend before any dispatch:

```sh
PERIMETER=(
  /Users/juancarlosromero/Development/ontology/src/runtime
  /Users/juancarlosromero/Development/ontology/src/core
  /Users/juancarlosromero/Development/ontology/src/commands
  /Users/juancarlosromero/Development/ontology/src/schemas
)
onto ingest "${PERIMETER[@]}" \
  --include ts,tsx \
  --provider ollama \
  --cost-estimate \
  --json | tee cost-estimate.json | jq '.dedupedTotal,.inputs[]|.path,.fileCount'
```

**Expected total:** 117 files (the count pinned in the hypothesis;
re-record if it drifts). Each input's `fileCount` should match
hypothesis §1. If the total differs, freeze the new count in the
hypothesis file *before* proceeding — the pre-registration must
include the perimeter snapshot of the moment.

Switch `--provider ollama` → `--provider anthropic` to see the
projected dollar cost for the paid pass.

---

## 3. Ollama pilot — ingest

Mechanical validation pass. Sequential because the system prompt
caches across files; Anthropic caches similarly via prompt-caching.

```sh
onto ingest "${PERIMETER[@]}" \
  --include ts,tsx \
  --provider ollama \
  --json > pilot-ingest.json
```

Inspect the failure shape early; if `failedCount > 5 %` of total, stop
and iterate the extraction template (`--dry-run` for $0 iteration).

Apply all pending proposals:

```sh
for p in $(onto proposal list --json | jq -r '.proposals[]|select(.status=="pending")|.id'); do
  onto proposal apply "$p" >/dev/null
done
onto proposal list --json | jq '.proposals|map(select(.status=="applied"))|length'
```

---

## 4. Edge inference (γ-6)

Static cross-file edges, $0:

```sh
for dir in "${PERIMETER[@]}"; do
  onto graph infer-edges "$dir" --include ts,tsx --create-proposals >/dev/null
done
for p in $(onto proposal list --json | jq -r '.proposals[]|select(.status=="pending")|.id'); do
  onto proposal apply "$p" >/dev/null
done
```

Per-root edge inference is the documented limitation of the
multi-positional ingest (PREWORK §A): cross-root edges between
`src/runtime → src/core` are *not* inferred. Accept for the pilot.

---

## 5. Verify with the six-axis matrix

The Ollama compile-back pass with `--matrix` produces the full Phase ε
report shape:

```sh
REPORT_DATE=$(date +%Y-%m-%d)
onto verify-homeomorphism \
  --all-artifacts \
  --provider ollama \
  --matrix \
  --report "$PILOT_DIR/SELF_INGEST_PILOT_${REPORT_DATE}.md" \
  --max-tokens 16384 \
  --json > pilot-verify.json
```

Outputs:

- `SELF_INGEST_PILOT_${REPORT_DATE}.md` — human-readable report with
  Aggregate, Matrix by axis, Frontier coverage, Frontier intersections,
  Per-node, Methodology.
- `pilot-verify.json` — full structured report. Validates against
  `src/runtime/legend/matrix.ts` Zod schemas.

If the Ollama pilot reveals tag/intersection regressions or the
matrix shape diverges from POSITIONING §2, iterate the prework
locally before the paid pass — Ollama findings are the cheapest
signal we get.

---

## 6. Anthropic publishable pass

Same commands, swap provider, expect the spend from §2:

```sh
onto ingest "${PERIMETER[@]}" \
  --include ts,tsx \
  --provider anthropic \
  --json > anthropic-ingest.json
# apply proposals (same loop as §3)
# edge inference (same as §4)

onto verify-homeomorphism \
  --all-artifacts \
  --provider anthropic \
  --matrix \
  --report "/Users/juancarlosromero/Development/ontology/docs/legend/calibrations/SELF_INGEST_${REPORT_DATE}.md" \
  --max-tokens 16384 \
  --json > anthropic-verify.json
```

The Anthropic report file lands under the canonical
`docs/legend/calibrations/` directory, matching the §3.10 tier-upgrade
contract in `MATHEMATICAL_CLAIMS.md`.

---

## 7. Post-pilot checklist

After `SELF_INGEST_${REPORT_DATE}.md` lands on `main`:

1. Update `MATHEMATICAL_CLAIMS.md` §3.10 from **T4** to a bounded T2
   claim citing the report file and the measured perimeter. Use the
   limited-claim wording from `SELF_INGEST_HYPOTHESIS_<date>.md` §9.
2. Update `LEGEND.md` §3 with a sentence summarising the measured
   axes and the frontier shape.
3. Open the run report as an appendix to the hypothesis file:
   commit the hypothesis with a new section *Result* (per POSITIONING
   §7 — append only).
4. If the run revealed a faithful class that surprised the prediction
   (or vice versa), record it in
   `MATHEMATICAL_CLAIMS.md` §3.10 under "discovery outcomes" so the
   next pre-registration includes the corrected hypothesis.

---

## 8. Failure modes and recovery

| Failure | Cause | Recovery |
|---|---|---|
| `connect ECONNREFUSED ::1:11434` | Ollama not running | Start the macOS app, or `ollama serve` in another shell. |
| `model not found: qwen2.5-coder:7b` | Model not pulled | `ollama pull qwen2.5-coder:7b`. |
| Many `schema_failed` proposals | Extraction template drift under a weaker model | Iterate the template with `--dry-run`; if hopeless, escalate to Anthropic for the affected files only. |
| Verify `unrecoverable` count high | Compile-back model can't produce valid TS | Switch verify's `--provider ollama` → `--provider anthropic` for compile-back specifically (acceptable mixed-provider Phase ε). |
| ε-equivalent fraction near zero | Tagger / matrix / extraction misconfiguration, NOT a real result | Re-run the prework test suite; if green, investigate the verify Jaccard normalisation. |
| Token budget exhausted under Anthropic | Some files are large | Bump `--max-tokens` to 32768 for the failing nodes, or split via `--nodes`. |

---

## 9. Sequencing recap

```
prework (A-E) ✓     ──┐
hypothesis frozen ✓   │
fixture sanity test ✓ ├─► Ollama §3-§5  ──► Anthropic §6  ──► post-pilot §7
report markdown ✓     │
PILOT_RUNBOOK ✓       ┘
```

The Ollama pass is a dry-run for the Anthropic pass. Do not skip it
even if Anthropic credit is plentiful — the $0 pass catches the
classes of failure that are operationally fatal, before paying.
