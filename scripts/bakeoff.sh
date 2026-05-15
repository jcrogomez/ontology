#!/usr/bin/env bash
#
# scripts/bakeoff.sh
#
# Phase ε E5 — multi-model × multi-repeat bake-off on a curated 20-file
# subset of the Ontology core perimeter. Measures the variance of OK
# rate, retry behaviour, and per-axis honesty score across model
# families (qwen-code, llama-generalist, hermes-instruction, deepseek-
# reasoning) at the same parameter size (~7-8B params).
#
# Designed to falsify or strengthen the "82.3% → 95.97% recovery"
# headline by establishing variance, not just point estimates.
#
# Output: one INGEST report per (model, repeat) under results/, plus a
# combined INDEX.md with quick comparison.
#
# Wall-clock: ~2 hours. Cost: $0 (all Ollama local).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ONTO="npx tsx ${REPO_ROOT}/src/cli.ts"

# ── Configuration ──────────────────────────────────────────────────────────

# Four diverse small model families (~1.5-3.8B params). Sized for
# the actual M1 VRAM ceiling (5.3 GiB unified, ~3 GiB headroom after
# a 4-bit 3B model loads). The thesis frames "what can small local
# models extract reliably?" — running 8B+ on this hardware burns
# wall-clock to swap-paging without producing better intent.
# Order matters: each model's repeats run consecutively so Ollama
# keeps the model loaded — saves warmup × N(repeats) per swap.
MODELS=(
  "qwen2.5-coder:3b"    # code-specialized
  "llama3.2:3b"         # generalist
  "phi3:mini"           # Microsoft instruction-tuned (~3.8B)
  "deepseek-r1:1.5b"    # reasoning-tuned (smallest in family)
)

REPEATS=3

# Curated 20 files spanning hypothesis §4 (faithful predictions)
# + §5 (resistant predictions) + edge cases. Annotated with the
# predicted bucket so the comparison report can group by class.
#
# Format: "source-path|predicted-bucket"
declare -a FILES=(
  # Predicted faithful (10) — hypothesis §4
  "src/core/integrity/hash.ts|pure-transform"
  "src/runtime/topos/predicate.ts|algebraic-lawful"
  "src/runtime/topos/omega.ts|algebraic-lawful"
  "src/runtime/effects/result.ts|algebraic-lawful"
  "src/runtime/effects/laws.ts|algebraic-lawful"
  "src/runtime/legend/render-ascii.ts|pure-transform"
  "src/runtime/legend/vocab-gap.ts|pure-transform"
  "src/runtime/legend/matrix-intersections.ts|pure-transform"
  "src/runtime/graph/poset.ts|pure-transform"
  "src/runtime/static/edges.ts|pure-transform"
  # Predicted resistant (8) — hypothesis §5
  "src/commands/init.ts|cli-parsing"
  "src/commands/walk.ts|cli-parsing"
  "src/commands/runs/show.ts|cli-parsing"
  "src/core/fs/lock.ts|io-bound"
  "src/core/state/state-store.ts|io-bound"
  "src/runtime/llm/anthropic/adapter.ts|adapter-boundary"
  "src/runtime/llm/ollama/adapter.ts|adapter-boundary"
  "src/runtime/legend/translator.ts|prompt-sensitive"
  # Edge cases (2)
  "src/runtime/effects/index.ts|barrel"
  "src/runtime/topos/index.ts|barrel"
)

# ── Setup ──────────────────────────────────────────────────────────────────

BAKEOFF_ROOT="${BAKEOFF_ROOT:-/tmp/ontology-bakeoff}"
rm -rf "$BAKEOFF_ROOT"
mkdir -p "$BAKEOFF_ROOT/src-template"
mkdir -p "$BAKEOFF_ROOT/results"

# Copy curated files into the template tree, preserving the src/...
# structure so the path-based frontier-tagger rules still fire.
echo "=== preparing curated subset ==="
for entry in "${FILES[@]}"; do
  rel_path="${entry%%|*}"
  src="$REPO_ROOT/$rel_path"
  dst="$BAKEOFF_ROOT/src-template/$rel_path"
  if [[ ! -f "$src" ]]; then
    echo "✖ source missing: $rel_path" >&2
    exit 1
  fi
  mkdir -p "$(dirname "$dst")"
  cp "$src" "$dst"
done
file_count=$(find "$BAKEOFF_ROOT/src-template" -type f -name "*.ts" | wc -l | tr -d ' ')
echo "  ${file_count} files copied"
echo ""

# ── Run the matrix ─────────────────────────────────────────────────────────

START=$(date +%s)
ROW_COUNT=0
TOTAL_RUNS=$(( ${#MODELS[@]} * REPEATS ))

# Header for the running summary CSV — useful for the analysis pass.
SUMMARY_CSV="$BAKEOFF_ROOT/results/summary.csv"
echo "model,repeat,files,ok,failed,total_tokens,wallclock_s,report_path" > "$SUMMARY_CSV"

for model in "${MODELS[@]}"; do
  # Pre-flight: confirm VRAM is empty before starting this model's
  # repeats. If any prior model is still loaded, stop it. Without
  # this, Ollama may try to coexist two models in the unified 5.3GiB
  # VRAM and one of them gets paged to swap silently — kills wall-clock.
  echo "  ── pre-flight: VRAM state before $model ──"
  loaded=$(curl -s http://localhost:11434/api/ps 2>/dev/null | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print(' '.join(m['name'] for m in d.get('models',[])))" 2>/dev/null || true)
  if [[ -n "$loaded" ]]; then
    for m in $loaded; do
      echo "    stopping leftover: $m"
      ollama stop "$m" 2>&1 | tail -1 || true
    done
  else
    echo "    VRAM clean"
  fi

  for repeat in $(seq 1 $REPEATS); do
    ROW_COUNT=$((ROW_COUNT + 1))
    slug="$(echo "$model" | tr ':/' '_')_${repeat}"
    workdir="$BAKEOFF_ROOT/runs/$slug"
    echo "=== [$ROW_COUNT / $TOTAL_RUNS] model=$model repeat=$repeat ==="

    rm -rf "$workdir"
    mkdir -p "$workdir"
    cp -r "$BAKEOFF_ROOT/src-template" "$workdir/src"

    cd "$workdir"
    $ONTO init > /dev/null 2>&1

    run_start=$(date +%s)
    # Capture stdout for the file-by-file ok/fail markers and exit
    # status. The INGEST report is written to .ontology/reports/
    # automatically by progress-report.ts (Phase ε prework I).
    log_out="$workdir/ingest-stdout.log"
    $ONTO ingest src --include ts --provider ollama --model "$model" --dry-run \
      > "$log_out" 2>&1 || true
    run_end=$(date +%s)
    wall=$((run_end - run_start))

    # Find the auto-written INGEST report and copy it to results/
    # with the descriptive slug. The auto-writer uses a random
    # runId; we'd rather have a deterministic name for the bake-off.
    auto_report=$(ls -t "$workdir/.ontology/reports/INGEST_"*.md 2>/dev/null | head -1 || true)
    if [[ -n "$auto_report" && -f "$auto_report" ]]; then
      cp "$auto_report" "$BAKEOFF_ROOT/results/INGEST_${slug}.md"
      report_path="results/INGEST_${slug}.md"
    else
      report_path="(no report — ingest failed before writer)"
    fi

    # Pull the aggregate numbers out of the stdout log. grep -c
    # returns exit 1 on zero matches WHILE still writing "0" to
    # stdout, which under `|| echo 0` concatenates as "0\n0" and
    # breaks the `$(( ))` arithmetic. The `; true` pattern is the
    # portable fix: keep the "0" stdout, swallow the exit code.
    ok=$(grep -c '^ ✓' "$log_out" 2>/dev/null; true)
    failed=$(grep -c '^ ✖' "$log_out" 2>/dev/null; true)
    ok="${ok:-0}"
    failed="${failed:-0}"
    files=$(( ok + failed ))
    tokens=$(grep -oE 'Tokens used:[[:space:]]+[0-9]+' "$log_out" 2>/dev/null | grep -oE '[0-9]+' | head -1; true)
    tokens="${tokens:-0}"

    echo "  ok=$ok failed=$failed tokens=$tokens wall=${wall}s"
    echo "$model,$repeat,$files,$ok,$failed,$tokens,$wall,$report_path" >> "$SUMMARY_CSV"
    echo ""
  done

  # Done with this model's repeats — unload it explicitly so the next
  # model has a fresh VRAM budget. Without this, the next model has to
  # evict the prior (which Ollama would do anyway via
  # OLLAMA_MAX_LOADED_MODELS=1 default) but the unload happens lazily
  # on the next request, sometimes producing a slow first-file on the
  # next run while the prior model is being paged out.
  echo "  ── post-flight: stopping $model to free VRAM ──"
  ollama stop "$model" 2>&1 | tail -1 || true
  sleep 1
done

END=$(date +%s)
TOTAL_WALL=$((END - START))

# ── Build the INDEX.md ─────────────────────────────────────────────────────

INDEX="$BAKEOFF_ROOT/results/INDEX.md"
{
  echo "# Bake-off — Phase ε E5"
  echo ""
  echo "**Generated:** $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "**Wall-clock total:** ${TOTAL_WALL}s ($((TOTAL_WALL / 60))m)"
  echo "**Models:** ${#MODELS[@]} · **Repeats:** $REPEATS · **Files:** $file_count"
  echo ""
  echo "## Results"
  echo ""
  echo "| Model | Repeat | OK / Failed | Tokens | Wall | Report |"
  echo "|---|---:|---|---:|---:|---|"
  tail -n +2 "$SUMMARY_CSV" | while IFS=, read -r model repeat files ok failed tokens wall report; do
      echo "| \`$model\` | $repeat | $ok / $failed | $tokens | ${wall}s | [link]($report) |"
  done
  echo ""
  echo "## Variance per model (across repeats)"
  echo ""
  echo "| Model | OK rate range | Mean tokens | Note |"
  echo "|---|---|---:|---|"
  for model in "${MODELS[@]}"; do
    oks=$(awk -F, -v m="$model" '$1==m {print $4}' "$SUMMARY_CSV")
    mean_tok=$(awk -F, -v m="$model" '$1==m {s+=$6; n++} END {if (n) printf "%d", s/n; else print 0}' "$SUMMARY_CSV")
    ok_min=$(echo "$oks" | sort -n | head -1)
    ok_max=$(echo "$oks" | sort -n | tail -1)
    range_note=""
    if [[ "$ok_min" == "$ok_max" ]]; then range_note="(stable)"; fi
    echo "| \`$model\` | $ok_min – $ok_max | $mean_tok | $range_note |"
  done
  echo ""
  echo "## Files in the curated subset"
  echo ""
  echo "| Source | Predicted bucket |"
  echo "|---|---|"
  for entry in "${FILES[@]}"; do
    rel_path="${entry%%|*}"
    bucket="${entry##*|}"
    echo "| \`$rel_path\` | $bucket |"
  done
} > "$INDEX"

echo "=== DONE — total wall-clock: ${TOTAL_WALL}s ==="
echo "  Index: $INDEX"
echo "  Per-run reports under: $BAKEOFF_ROOT/results/"
