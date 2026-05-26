#!/usr/bin/env python3
"""Summarise everything in runs/ — pipeline accepts vs baseline picks,
token usage, wall-clock time. Does NOT grade correctness; that needs
either human review of the trace or the auto-grader (which the v0
scaffold does not yet ship — see HYPOTHESIS.md and problems/README.md).

Output is a markdown table on stdout, suitable for pasting into a
report or eyeballing in the terminal.

Example:

    python3 scripts/compare.py
    python3 scripts/compare.py --runs-dir runs --problem imo2025_p1
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def load_runs(runs_dir: Path) -> list[dict]:
    out = []
    for p in sorted(runs_dir.glob("*.json")):
        try:
            data = json.loads(p.read_text())
            data["_path"] = str(p.name)
            out.append(data)
        except json.JSONDecodeError:
            print(f"warning: skipping unreadable JSON: {p}", file=sys.stderr)
    return out


def fmt_int(n: int) -> str:
    return f"{n:>9,}"


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--runs-dir", default="runs")
    p.add_argument(
        "--problem",
        default=None,
        help="restrict to a single problem id (default: all)",
    )
    args = p.parse_args()

    runs_dir = Path(args.runs_dir).resolve()
    if not runs_dir.exists():
        print(f"runs dir not found: {runs_dir}", file=sys.stderr)
        return 2

    runs = load_runs(runs_dir)
    if args.problem:
        runs = [r for r in runs if r.get("problem_id") == args.problem]

    pipelines = [r for r in runs if "verdict" in r]
    baselines = [r for r in runs if r.get("kind") == "baseline_best_of_n"]

    print("# verify-refine-math — runs summary\n")

    if pipelines:
        print("## Pipeline runs\n")
        print(
            "| Problem | Model | Verdict | Iters | Clean | In tokens | Out tokens | Wall (s) | Trace |"
        )
        print(
            "|---------|-------|---------|-------|-------|-----------|------------|----------|-------|"
        )
        for r in pipelines:
            wall = r.get("wall_clock_seconds", 0.0)
            inp = r.get("total_usage", {}).get("input_tokens", 0)
            out = r.get("total_usage", {}).get("output_tokens", 0)
            print(
                f"| {r.get('problem_id','?')} "
                f"| {r.get('model','?')} "
                f"| {r.get('verdict','?')} "
                f"| {len(r.get('iterations', []))} "
                f"| {r.get('consecutive_clean_passes', 0)} "
                f"| {fmt_int(inp)} "
                f"| {fmt_int(out)} "
                f"| {wall:>7.1f} "
                f"| `{r['_path']}` |"
            )
        print()

    if baselines:
        print("## Baseline (best-of-N) runs\n")
        print(
            "| Problem | Model | N | Selected | In tokens | Out tokens | Trace |"
        )
        print(
            "|---------|-------|---|----------|-----------|------------|-------|"
        )
        for r in baselines:
            print(
                f"| {r.get('problem_id','?')} "
                f"| {r.get('model','?')} "
                f"| {r.get('samples','?')} "
                f"| {r.get('selected_index','?')} "
                f"| {fmt_int(r.get('total_input_tokens', 0))} "
                f"| {fmt_int(r.get('total_output_tokens', 0))} "
                f"| `{r['_path']}` |"
            )
        print()

    if not pipelines and not baselines:
        print("(no runs found in", runs_dir, ")")
        return 0

    # Aggregate: total spend rough estimate (Sonnet pricing as of paper era;
    # update if you change models — this is for budget tracking, not billing).
    sonnet_in = 3.0 / 1_000_000  # $/token, approximate
    sonnet_out = 15.0 / 1_000_000
    total_in = sum(
        r.get("total_usage", {}).get("input_tokens", 0) for r in pipelines
    ) + sum(r.get("total_input_tokens", 0) for r in baselines)
    total_out = sum(
        r.get("total_usage", {}).get("output_tokens", 0) for r in pipelines
    ) + sum(r.get("total_output_tokens", 0) for r in baselines)
    est = total_in * sonnet_in + total_out * sonnet_out

    print("## Aggregate\n")
    print(f"- runs counted: pipeline={len(pipelines)}, baseline={len(baselines)}")
    print(f"- total tokens: in={total_in:,} out={total_out:,}")
    print(f"- rough USD estimate (Sonnet pricing): ${est:.2f}")
    print(
        "  *(this is a back-of-envelope number based on a single price tier; "
        "consult the Anthropic dashboard for billing truth)*"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
