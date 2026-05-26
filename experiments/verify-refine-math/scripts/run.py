#!/usr/bin/env python3
"""Run the verification-and-refinement pipeline on one problem.

Example:

    python3 scripts/run.py --problem problems/imo2025_p1.json \
                           --model claude-sonnet-4-6

Writes a JSON trace to runs/<problem-id>__<model>__<ts>.json containing
every solver / verifier / correction step, the final verdict, and token
usage. Token usage is also echoed at the end so cost can be estimated
without re-reading the trace.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

# Make the package importable when running from the repo root.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pipeline import run_pipeline
from pipeline.client import DEFAULT_MODELS, make_client, resolve_model
from pipeline.loop import (
    DEFAULT_ACCEPT_PASSES,
    DEFAULT_MAX_ITERATIONS,
    DEFAULT_REJECT_AFTER_CRITICAL,
)


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--problem", required=True, help="path to a problem JSON file")
    p.add_argument(
        "--backend",
        choices=["ollama", "anthropic"],
        default="ollama",
        help="model backend (default: ollama for $0 local runs)",
    )
    p.add_argument(
        "--model",
        default=None,
        help="model id or alias; defaults to qwen2.5-coder:7b (ollama) or claude-sonnet-4-6 (anthropic)",
    )
    p.add_argument(
        "--accept-passes",
        type=int,
        default=DEFAULT_ACCEPT_PASSES,
        help=f"consecutive verifier passes required to accept (default {DEFAULT_ACCEPT_PASSES})",
    )
    p.add_argument(
        "--max-iterations",
        type=int,
        default=DEFAULT_MAX_ITERATIONS,
        help=f"hard cap on Steps 3-5 cycles (default {DEFAULT_MAX_ITERATIONS}; upstream uses 30)",
    )
    p.add_argument(
        "--reject-after-critical",
        type=int,
        default=DEFAULT_REJECT_AFTER_CRITICAL,
        help=f"reject after this many consecutive critical verifications (default {DEFAULT_REJECT_AFTER_CRITICAL}; upstream uses 10)",
    )
    p.add_argument(
        "--review-bug-reports",
        action="store_true",
        help="enable Step 4 (verifier mistake filter); doubles per-iter cost. "
             "Commented out in upstream; opt-in here.",
    )
    p.add_argument(
        "--temperature",
        type=float,
        default=0.1,
        help="sampling temperature (paper used 0.1 for Gemini/Grok)",
    )
    p.add_argument(
        "--max-output-tokens",
        type=int,
        default=16000,
        help="per-call output cap; raise for Olympiad proofs that need length",
    )
    p.add_argument(
        "--out-dir",
        default="runs",
        help="directory for the run trace (default: runs/)",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="don't call the API; print what would happen and exit 0",
    )
    args = p.parse_args()

    problem_path = Path(args.problem).resolve()
    if not problem_path.exists():
        print(f"error: problem file not found: {problem_path}", file=sys.stderr)
        return 2
    problem = json.loads(problem_path.read_text())

    model_input = args.model or DEFAULT_MODELS[args.backend]
    resolved_model = resolve_model(model_input, args.backend)
    out_dir = Path(args.out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"problem      : {problem['id']} ({problem['source']})", file=sys.stderr)
    print(f"contamination: {problem.get('contamination_status', '(unset)')}", file=sys.stderr)
    print(f"backend      : {args.backend}", file=sys.stderr)
    print(f"model        : {resolved_model}", file=sys.stderr)
    print(
        f"accept       : {args.accept_passes} consecutive clean passes",
        file=sys.stderr,
    )
    print(f"max-iter     : {args.max_iterations}", file=sys.stderr)
    print(
        f"reject-after : {args.reject_after_critical} consecutive critical",
        file=sys.stderr,
    )
    print(f"review-bugs  : {args.review_bug_reports}", file=sys.stderr)
    print(f"out-dir      : {out_dir}", file=sys.stderr)

    if args.dry_run:
        print("\n(dry run — no API calls were made)", file=sys.stderr)
        return 0

    client = make_client(
        args.backend,
        default_model=resolved_model,
        max_tokens=args.max_output_tokens,
        temperature=args.temperature,
    )

    def progress(step: str, detail: str = "") -> None:
        sep = " — " if detail else ""
        print(f"[{step}]{sep}{detail}", file=sys.stderr, flush=True)

    result = run_pipeline(
        problem_id=problem["id"],
        problem_statement=problem["problem_statement"],
        client=client,
        model=resolved_model,
        accept_passes=args.accept_passes,
        max_iterations=args.max_iterations,
        reject_after_critical=args.reject_after_critical,
        enable_bug_report_review=args.review_bug_reports,
        progress=progress,
    )

    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out_path = out_dir / f"{problem['id']}__{resolved_model.replace('/', '-')}__{ts}.json"
    out_path.write_text(json.dumps(result.to_json(), indent=2, ensure_ascii=False))

    print("", file=sys.stderr)
    print(f"verdict       : {result.verdict.value}", file=sys.stderr)
    print(
        f"clean passes  : {result.consecutive_clean_passes} consecutive (target {args.accept_passes})",
        file=sys.stderr,
    )
    print(f"iterations    : {len(result.iterations)} / {args.max_iterations}", file=sys.stderr)
    print(
        f"tokens        : in={result.total_usage.input_tokens:,} "
        f"out={result.total_usage.output_tokens:,}",
        file=sys.stderr,
    )
    print(f"wall-clock    : {result.wall_clock_seconds:.1f}s", file=sys.stderr)
    print(f"trace         : {out_path}", file=sys.stderr)
    if result.error:
        print(f"error         : {result.error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
