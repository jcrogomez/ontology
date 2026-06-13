#!/usr/bin/env bash
# Fase 1 (counit side, F∘G over the live graph) for ROUNDTRIP_BILATERAL_2026-06-12.
# Pre-registration: docs/legend/calibrations/ROUNDTRIP_BILATERAL_2026-06-12_HYPOTHESIS.md
# Runs inside the isolated workspace copy; the live .ontology is never touched.
set -euo pipefail

REPO=/Users/juancarlosromero/Development/ontology
SCRATCH=$REPO/.ontology.scratch-roundtrip-2026-06-12
WS=$SCRATCH/ws
CLI=$REPO/dist/cli.js
SIDECAR=$SCRATCH/fase1-verify.json
LOG=$SCRATCH/fase1.log
REPORT=$SCRATCH/fase1-report.md

NODES=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$SCRATCH/sample.json','utf8')).ids.join(','))")

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Fase 1 start: 48 nodes, qwen2.5-coder:7b via proxy shim 11501 (upstream stubs, focal real)" | tee -a "$LOG"
cd "$WS"
OLLAMA_HOST=http://127.0.0.1:11501 node "$CLI" verify-homeomorphism --nodes "$NODES" \
  --matrix --ast-grounding --contract-check --behavior-check \
  --provider ollama --model qwen2.5-coder:7b --reps 1 \
  --report "$REPORT" --json > "$SIDECAR" 2>>"$LOG"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Fase 1 done -> $SIDECAR" | tee -a "$LOG"
