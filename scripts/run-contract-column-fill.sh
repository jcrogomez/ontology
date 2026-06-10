#!/usr/bin/env bash
# Contract-column fill — dated driver (2026-06-09).
# Pre-registration: docs/legend/calibrations/SELF_INGEST_CONTRACT_COLUMN_2026-06-09_HYPOTHESIS.md
#
# Runs verify-homeomorphism with --contract-check over the ARCHIVED Arm A
# graph (copied to a scratch .ontology/ — the archive stays pristine),
# against local Ollama qwen2.5-coder:7b. Self-guarding: builds first,
# smokes ONE node end-to-end before committing to the full overnight
# sweep, and always restores the main .ontology on exit.
#
# Invoke wrapped in caffeinate so the Mac doesn't idle-sleep mid-run:
#   caffeinate -i bash scripts/run-contract-column-fill.sh
set -euo pipefail
cd "$(dirname "$0")/.."

ARCHIVE=".ontology.self-ingest-epsilon-3a-arm-a-result"
BACKUP=".ontology.main-backup-contract-fill"
RESULT=".ontology.contract-column-2026-06-09-result"
REPORT="docs/legend/calibrations/SELF_INGEST_CONTRACT_COLUMN_2026-06-09.md"
SIDECAR=".ontology.contract-column-2026-06-09.json"
STDERR_LOG=".ontology.contract-column-2026-06-09.stderr.log"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

[ -d "$ARCHIVE" ] || { log "FATAL: archive not found: $ARCHIVE"; exit 1; }
[ -d "$BACKUP" ] && { log "FATAL: $BACKUP already exists — previous run did not restore?"; exit 1; }
curl -sf "${OLLAMA_HOST:-http://127.0.0.1:11434}/api/tags" > /dev/null \
  || { log "FATAL: Ollama is not reachable"; exit 1; }

log "building dist (needs the --contract-check flag)"
npm run build > /dev/null

log "swapping workspaces: main → $BACKUP, copy of $ARCHIVE → .ontology"
mv .ontology "$BACKUP"
cp -R "$ARCHIVE" .ontology

restore() {
  log "restoring workspaces"
  if [ -d .ontology ] && [ -d "$BACKUP" ]; then
    rm -rf "$RESULT" 2>/dev/null || true
    mv .ontology "$RESULT"
    mv "$BACKUP" .ontology
    log "worked copy archived at $RESULT; main .ontology restored"
  fi
}
trap restore EXIT

log "smoke: verifying ONE node end-to-end before the full sweep"
if ! node dist/cli.js verify-homeomorphism node_0001 \
    --matrix --ast-grounding --contract-check \
    --provider ollama --model qwen2.5-coder:7b \
    --json > .ontology.contract-column-smoke.json 2>> "$STDERR_LOG"; then
  log "FATAL: smoke failed — aborting before the overnight sweep (see $STDERR_LOG)"
  exit 1
fi
log "smoke OK ($(python3 -c "import json;d=json.load(open('.ontology.contract-column-smoke.json'));print(d['results'][0]['verdict'], d['matrix'][0]['cell']['contract'])" 2>/dev/null || echo 'parsed-na'))"

log "full sweep: 126 nodes, reps=1 — Arm A took ~1h33m in May; expect 2–5h"
node dist/cli.js verify-homeomorphism \
  --all-artifacts --matrix --ast-grounding --contract-check \
  --provider ollama --model qwen2.5-coder:7b \
  --report "$REPORT" \
  --json > "$SIDECAR" 2>> "$STDERR_LOG"

log "sweep done. Contract column summary:"
python3 - <<'PY'
import json
d = json.load(open(".ontology.contract-column-2026-06-09.json"))
ax = d.get("byAxis", {}).get("contract", {})
total = sum(ax.values()) or 1
measured = ax.get("pass", 0) + ax.get("fail", 0)
print(f"  byAxis.contract: {ax}")
print(f"  measured (pass+fail): {measured}/{total}")
if measured:
    print(f"  pass rate over measured: {ax.get('pass',0)/measured:.3f}")
reasons = {}
for r in d.get("contractResults", []):
    reasons[r["reason"]] = reasons.get(r["reason"], 0) + 1
print(f"  reasons: {dict(sorted(reasons.items(), key=lambda kv: -kv[1]))}")
PY
log "report: $REPORT · sidecar: $SIDECAR · stderr: $STDERR_LOG"
log "NEXT SESSION: read the hypothesis doc, judge H-C1..H-C4, write the result entry in CALIBRATION_LOG (do NOT edit the hypothesis)."
