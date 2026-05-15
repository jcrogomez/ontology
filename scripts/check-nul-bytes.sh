#!/usr/bin/env bash
#
# scripts/check-nul-bytes.sh
#
# Phase ε H4 — guard against NUL bytes (0x00) in committed *.ts / *.tsx
# source files. A real source file is text; NUL bytes signal a binary
# corruption or a templating glitch that landed in the working tree.
#
# Background: pareto.ts shipped to 0.4.0-rc.1 main with two NUL bytes
# inside a template-literal separator. TypeScript still compiled
# (NUL is a valid string character), tests still passed (bucket
# equality is string equality), but the Phase ε pilot's ingest
# correctly classified the file as binary_content and refused to
# extract its intent. The pilot caught the bug end-to-end; this hook
# catches it locally before the commit lands.
#
# Usage:
#
#   # Scan files staged for commit (default):
#   ./scripts/check-nul-bytes.sh
#
#   # Scan an explicit file list:
#   ./scripts/check-nul-bytes.sh src/foo.ts src/bar.ts
#
#   # Scan every tracked .ts / .tsx file in the repo:
#   ./scripts/check-nul-bytes.sh --all
#
# Wire as a pre-commit hook (optional, opt-in):
#
#   ln -sf ../../scripts/check-nul-bytes.sh .git/hooks/pre-commit
#
# Or run via npm:
#
#   npm run check:nul

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# Resolve the file list. Three modes:
#   1. No args     → staged .ts / .tsx files (typical pre-commit case)
#   2. --all       → every tracked .ts / .tsx
#   3. explicit    → exactly the arguments passed
FILES=()
if [[ $# -eq 0 ]]; then
  # diff-filter ACM = Added / Copied / Modified — skip Deletes.
  # The xargs/grep chain is tolerated when staged is empty.
  while IFS= read -r f; do
    [[ -n "$f" ]] && FILES+=("$f")
  done < <(
    git diff --cached --name-only --diff-filter=ACM 2>/dev/null \
      | grep -E '\.tsx?$' \
      || true
  )
elif [[ "$1" == "--all" ]]; then
  while IFS= read -r f; do
    [[ -n "$f" ]] && FILES+=("$f")
  done < <(git ls-files '*.ts' '*.tsx')
else
  FILES=("$@")
fi

if [[ ${#FILES[@]} -eq 0 ]]; then
  # Nothing to check is success — empty staged set is normal during
  # interactive commits.
  exit 0
fi

OFFENDERS=()
for f in "${FILES[@]}"; do
  # Skip files that no longer exist (deleted but still in arg list).
  [[ ! -f "$f" ]] && continue
  # `grep -l --null-data` would also work but is GNU-specific. Use a
  # portable test: any NUL byte makes `file` report something
  # non-text. Direct byte scan via tr+grep is the most reliable
  # cross-platform check.
  if LC_ALL=C tr -d -c '\000' < "$f" | head -c 1 | LC_ALL=C grep -q . ; then
    OFFENDERS+=("$f")
  fi
done

if [[ ${#OFFENDERS[@]} -gt 0 ]]; then
  echo "✖ NUL bytes detected in TypeScript source files:" >&2
  for f in "${OFFENDERS[@]}"; do
    # Report rough byte offset(s) of the first few NUL occurrences so
    # the operator knows where to look without manual hex dumping.
    COUNT=$(LC_ALL=C tr -d -c '\000' < "$f" | wc -c | tr -d ' ')
    echo "    $f  ($COUNT NUL byte(s))" >&2
  done
  echo "" >&2
  echo "  NUL bytes in *.ts / *.tsx files signal binary corruption or a" >&2
  echo "  templating glitch (Phase ε caught one of these in pareto.ts)." >&2
  echo "  To inspect: 'od -c FILE | grep \\\\0'" >&2
  echo "  To fix:    'tr -d \"\\000\" < FILE > FILE.tmp && mv FILE.tmp FILE'" >&2
  echo "             then re-run typecheck + tests to confirm semantics" >&2
  exit 1
fi

exit 0
