#!/usr/bin/env bash
#
# Run the verify-refine pipeline sequentially over the USAMO 2026
# cohort. Sequential, not parallel, because (a) `HYPOTHESIS.md`
# stopping rules require checking after the first few completions
# ("0/5 → stop and diagnose"), and (b) parallel local Ollama
# inference on a single Mac saturates the GPU and goes slower per
# call than sequential.
#
# Usage:
#   bash scripts/run_cohort.sh                  # ollama, qwen2.5-coder:7b
#   BACKEND=anthropic MODEL=sonnet bash scripts/run_cohort.sh
#   ACCEPT_PASSES=3 MAX_ITER=15 bash scripts/run_cohort.sh
#
# All env overrides:
#   BACKEND        ollama (default) | anthropic
#   MODEL          per-backend default if unset
#   ACCEPT_PASSES  5 (upstream default)
#   MAX_ITER       30 (upstream default)
#   REJECT_AFTER   10 (upstream default)
#   OUT_TOKENS     8000 (smaller than scaffold default to bound wall time)
#   COHORT_DIR     problems
#   COHORT_GLOB    usamo2026_p*.json  (override to e.g. 'imo2025_p1.json'
#                  to run plumbing only)
#   STOP_AT_FAIL   5  — stop after this many consecutive non-accept verdicts
#                       per HYPOTHESIS.md stopping rule. Set to 0 to disable.
#

set -euo pipefail

cd "$(dirname "$0")/.."

BACKEND="${BACKEND:-ollama}"
case "$BACKEND" in
  ollama)    MODEL_DEFAULT="qwen2.5-coder:7b" ;;
  anthropic) MODEL_DEFAULT="sonnet" ;;
  *) echo "unknown BACKEND: $BACKEND" >&2; exit 2 ;;
esac
MODEL="${MODEL:-$MODEL_DEFAULT}"
ACCEPT_PASSES="${ACCEPT_PASSES:-5}"
MAX_ITER="${MAX_ITER:-30}"
REJECT_AFTER="${REJECT_AFTER:-10}"
OUT_TOKENS="${OUT_TOKENS:-8000}"
COHORT_DIR="${COHORT_DIR:-problems}"
COHORT_GLOB="${COHORT_GLOB:-usamo2026_p*.json}"
STOP_AT_FAIL="${STOP_AT_FAIL:-5}"

PYTHON="${PYTHON:-.venv/bin/python}"
if [[ ! -x "$PYTHON" ]]; then
  echo "error: $PYTHON not executable; create the venv first" >&2
  echo "       python3 -m venv .venv && .venv/bin/pip install -r requirements.txt" >&2
  exit 2
fi

# Ollama backend pre-flight: confirm daemon + model are present.
if [[ "$BACKEND" == "ollama" ]]; then
  if ! curl -sf --max-time 2 http://localhost:11434/api/tags >/dev/null; then
    echo "error: ollama daemon not reachable at localhost:11434" >&2
    echo "       start it with: ollama serve" >&2
    exit 2
  fi
  if ! curl -sf http://localhost:11434/api/tags | grep -q "\"$MODEL\""; then
    echo "warning: model '$MODEL' not in 'ollama list' output; will fetch on first call" >&2
  fi
fi

mapfile -t PROBLEMS < <(ls -1 "$COHORT_DIR"/$COHORT_GLOB 2>/dev/null | sort)
if [[ ${#PROBLEMS[@]} -eq 0 ]]; then
  echo "error: no problems matched '$COHORT_DIR/$COHORT_GLOB'" >&2
  exit 2
fi

TS_START=$(date -u +%Y%m%dT%H%M%SZ)
LOG_FILE="runs/cohort__${BACKEND}__${MODEL//\//-}__${TS_START}.log"
mkdir -p runs

echo "=== verify-refine-math cohort run ==="
echo "  backend       : $BACKEND"
echo "  model         : $MODEL"
echo "  cohort        : ${#PROBLEMS[@]} problems matching $COHORT_GLOB"
echo "  accept-passes : $ACCEPT_PASSES"
echo "  max-iter      : $MAX_ITER"
echo "  reject-after  : $REJECT_AFTER"
echo "  out-tokens    : $OUT_TOKENS"
echo "  stop-at-fail  : $STOP_AT_FAIL consecutive non-accept verdicts"
echo "  log           : $LOG_FILE"
echo ""

fail_streak=0
accepted=0
attempted=0

for prob in "${PROBLEMS[@]}"; do
  attempted=$((attempted+1))
  pid=$(basename "$prob" .json)
  echo "[$(date -u +%H:%M:%SZ)] >>> $pid" | tee -a "$LOG_FILE"

  if "$PYTHON" scripts/run.py \
      --problem "$prob" \
      --backend "$BACKEND" \
      --model "$MODEL" \
      --accept-passes "$ACCEPT_PASSES" \
      --max-iterations "$MAX_ITER" \
      --reject-after-critical "$REJECT_AFTER" \
      --max-output-tokens "$OUT_TOKENS" 2>&1 | tee -a "$LOG_FILE"; then
    # Inspect the most recent trace for this problem to see the verdict.
    trace=$(ls -1t runs/${pid}__*.json 2>/dev/null | head -1)
    verdict=$("$PYTHON" -c "import json,sys; print(json.load(open(sys.argv[1])).get('verdict','?'))" "$trace" 2>/dev/null || echo "?")
  else
    verdict="error"
  fi

  echo "[$(date -u +%H:%M:%SZ)] <<< $pid verdict=$verdict" | tee -a "$LOG_FILE"
  echo "" | tee -a "$LOG_FILE"

  if [[ "$verdict" == "accept" ]]; then
    accepted=$((accepted+1))
    fail_streak=0
  else
    fail_streak=$((fail_streak+1))
    if (( STOP_AT_FAIL > 0 && fail_streak >= STOP_AT_FAIL )); then
      echo "*** stopping per HYPOTHESIS.md rule: $fail_streak consecutive non-accept verdicts" | tee -a "$LOG_FILE"
      break
    fi
  fi
done

echo "" | tee -a "$LOG_FILE"
echo "=== cohort summary ===" | tee -a "$LOG_FILE"
echo "  attempted     : $attempted / ${#PROBLEMS[@]}" | tee -a "$LOG_FILE"
echo "  accepted      : $accepted" | tee -a "$LOG_FILE"
echo "  log           : $LOG_FILE" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"
echo "Next step: $PYTHON scripts/compare.py" | tee -a "$LOG_FILE"
