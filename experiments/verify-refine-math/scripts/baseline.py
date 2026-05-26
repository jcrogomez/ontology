#!/usr/bin/env python3
"""Single-pass baseline — the counterfactual the pipeline lift is
measured against (`HYPOTHESIS.md` H1). Generates K candidate solutions
to one problem using the SOLVER prompt only, then asks the same model
to pick the most promising one. This matches the paper's "best-of-N"
baseline from the MathArena evaluation (§4.1) at smaller K to keep
the cost bounded.

Example:

    python3 scripts/baseline.py --problem problems/imo2025_p1.json \
                                --model claude-sonnet-4-6 \
                                --samples 8
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pipeline.client import DEFAULT_MODELS, make_client, resolve_model
from pipeline.prompts import SOLVER_SYSTEM
from pipeline.types import TokenUsage


SELECTOR_PROMPT = """Below are {n} candidate solutions to the same mathematical problem. Each is the output of an independent solver attempt. Your job is to pick the single most promising candidate — the one that, in your judgment, is most likely to be a complete and rigorous correct solution.

Selection criteria (in order of priority):
1. **Completeness.** A candidate that proves the full claim outranks one that proves only a partial result.
2. **Rigor.** A candidate whose every step is rigorously justified outranks one with hand-wavy or hand-waved steps.
3. **Clarity.** Among equally complete and rigorous candidates, prefer the one whose argument is clearest.

Output ONLY a single integer in the range 1..{n}, indicating which candidate you select. No explanation, no preamble — just the number.

==========================================================================
### Problem ###

{problem}
==========================================================================
{candidates}
=========================================================================="""


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--problem", required=True)
    p.add_argument("--backend", choices=["ollama", "anthropic"], default="ollama")
    p.add_argument("--model", default=None,
                   help="defaults per backend: qwen2.5-coder:7b (ollama), claude-sonnet-4-6 (anthropic)")
    p.add_argument("--samples", type=int, default=8, help="N for best-of-N (paper used 32)")
    p.add_argument("--temperature", type=float, default=0.7, help="higher than pipeline for diversity")
    p.add_argument("--max-output-tokens", type=int, default=16000)
    p.add_argument("--out-dir", default="runs")
    args = p.parse_args()

    problem = json.loads(Path(args.problem).resolve().read_text())
    model = resolve_model(args.model or DEFAULT_MODELS[args.backend], args.backend)
    client = make_client(args.backend, default_model=model,
                         max_tokens=args.max_output_tokens, temperature=args.temperature)
    out_dir = Path(args.out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    print(
        f"baseline best-of-{args.samples} :: {problem['id']} :: {model}",
        file=sys.stderr,
    )

    total = TokenUsage()
    candidates = []
    for i in range(1, args.samples + 1):
        print(f"  candidate {i}/{args.samples} ...", file=sys.stderr, flush=True)
        r = client.call(
            problem["problem_statement"],
            model=model,
            system=SOLVER_SYSTEM,
            temperature=args.temperature,
        )
        candidates.append(
            {
                "index": i,
                "text": r.text,
                "input_tokens": r.usage.input_tokens,
                "output_tokens": r.usage.output_tokens,
                "latency_seconds": r.latency_seconds,
            }
        )
        total = total.add(r.usage)

    # Selector pass: model picks best.
    cat = "\n\n==========================================================================\n".join(
        f"### Candidate {c['index']} ###\n\n{c['text']}" for c in candidates
    )
    sel_prompt = SELECTOR_PROMPT.format(
        n=args.samples, problem=problem["problem_statement"], candidates=cat
    )
    print(f"  selecting ...", file=sys.stderr, flush=True)
    sel = client.call(sel_prompt, model=model, temperature=0.0)
    total = total.add(sel.usage)

    # Parse the integer the selector returned (robust to extra whitespace
    # or a stray period).
    selected_text = sel.text.strip()
    selected_index = None
    for tok in selected_text.replace(".", " ").split():
        if tok.isdigit():
            val = int(tok)
            if 1 <= val <= args.samples:
                selected_index = val
                break

    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out_path = out_dir / f"baseline__{problem['id']}__{model.replace('/', '-')}__bo{args.samples}__{ts}.json"
    out = {
        "kind": "baseline_best_of_n",
        "problem_id": problem["id"],
        "model": model,
        "samples": args.samples,
        "temperature": args.temperature,
        "candidates": candidates,
        "selector_output_raw": sel.text,
        "selected_index": selected_index,
        "selected_text": candidates[selected_index - 1]["text"] if selected_index else None,
        "total_input_tokens": total.input_tokens,
        "total_output_tokens": total.output_tokens,
        "finished_at": datetime.now(timezone.utc).isoformat(),
    }
    out_path.write_text(json.dumps(out, indent=2, ensure_ascii=False))

    print("", file=sys.stderr)
    print(f"selected      : candidate {selected_index}", file=sys.stderr)
    print(
        f"tokens        : in={total.input_tokens:,} out={total.output_tokens:,}",
        file=sys.stderr,
    )
    print(f"trace         : {out_path}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
