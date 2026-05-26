"""The 6-step verification-and-refinement loop.

Faithful port of `agent.py:agent()` from github.com/lyang36/IMO25
(accessed 2026-05-25), which is the public code accompanying
Huang & Yang (arXiv:2507.15855v4). The control-flow constants and
conversation shape mirror that file:

- Initial solution generation (Step 1, system=SOLVER_SYSTEM, user=problem)
- Self-improvement (Step 2, continuation turn with SELF_IMPROVEMENT_PROMPT)
- Verification (Step 3, system=VERIFIER_SYSTEM, user=problem+solution+reminder)
- Bug-report review (Step 4, OPTIONAL — commented out in upstream; opt-in here)
- Correction (Step 5, FRESH conversation: system=SOLVER_SYSTEM, user=problem,
  model=prior_solution, user=CORRECTION_PROMPT + bug-report text)
- Accept after `accept_passes` (default 5) consecutive clean verifies, OR
  reject after `reject_after_critical` (default 10) consecutive critical
  verifies, OR cap out at `max_iterations` (default 30).

Notable divergence from upstream:

- Upstream `verify_solution` makes TWO API calls per verification: the
  verifier produces a full report, then a small yes/no classifier
  asks "does this say correct?" We replace the classifier with a
  regex parser in `verifier.parse_verifier_verdict()` — one fewer API
  call per iteration, and the regex is sound on the prompt-mandated
  Final Verdict / List of Findings structure. The UNCLEAR fallback
  biases toward CRITICAL so a parser miss extends the loop rather
  than prematurely accepts.
"""

from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Optional

from .client import Client
from .prompts import (
    CHECK_VERIFICATION_PROMPT,
    CORRECTION_PROMPT,
    SELF_IMPROVEMENT_PROMPT,
    SOLVER_SYSTEM,
    VERIFIER_SYSTEM,
    build_verifier_user_message,
)
from .types import (
    IterationTrace,
    PipelineResult,
    TokenUsage,
    Verdict,
    VerifierJudgment,
)
from .verifier import extract_bug_report, parse_verifier_verdict


DEFAULT_ACCEPT_PASSES = 5
DEFAULT_REJECT_AFTER_CRITICAL = 10
DEFAULT_MAX_ITERATIONS = 30


def run_pipeline(
    *,
    problem_id: str,
    problem_statement: str,
    client: Client,
    model: Optional[str] = None,
    accept_passes: int = DEFAULT_ACCEPT_PASSES,
    reject_after_critical: int = DEFAULT_REJECT_AFTER_CRITICAL,
    max_iterations: int = DEFAULT_MAX_ITERATIONS,
    enable_bug_report_review: bool = False,
    progress: Optional[callable] = None,
) -> PipelineResult:
    """Run the pipeline on one problem and return a full trace."""

    def _emit(step: str, detail: str = "") -> None:
        if progress:
            progress(step, detail)

    started = time.time()
    started_iso = datetime.now(timezone.utc).isoformat()
    total_usage = TokenUsage()
    mdl = model or client.default_model

    result = PipelineResult(
        problem_id=problem_id,
        problem_statement=problem_statement,
        model=mdl,
        verdict=Verdict.ERROR,
        consecutive_clean_passes=0,
        initial_solution="",
        improved_solution="",
        started_at=started_iso,
    )

    try:
        # --- Step 1: initial solution (system + user) ---------------------
        _emit("step1", "initial solution")
        r1 = client.call(
            problem_statement,
            model=mdl,
            system=SOLVER_SYSTEM,
        )
        result.initial_solution = r1.text
        total_usage = total_usage.add(r1.usage)
        _emit(
            "step1.done",
            f"{r1.usage.input_tokens}/{r1.usage.output_tokens} tok, {r1.latency_seconds:.1f}s",
        )

        # --- Step 2: self-improvement (continuation) ----------------------
        _emit("step2", "self-improvement")
        turns = [
            {"role": "user", "content": problem_statement},
            {"role": "assistant", "content": r1.text},
            {"role": "user", "content": SELF_IMPROVEMENT_PROMPT},
        ]
        r2 = client.conversation(turns, model=mdl, system=SOLVER_SYSTEM)
        result.improved_solution = r2.text
        total_usage = total_usage.add(r2.usage)
        _emit(
            "step2.done",
            f"{r2.usage.input_tokens}/{r2.usage.output_tokens} tok, {r2.latency_seconds:.1f}s",
        )

        current_solution = result.improved_solution

        # --- Initial verification (counted toward consecutive_clean) ------
        # Upstream's `agent()` calls verify_solution() inside init_explorations
        # and uses its result as the first `good_verify`. We mirror that —
        # but unlike upstream which seeds correct_count = 1 unconditionally,
        # we seed from the actual initial-verify outcome. This is the only
        # principled change from the upstream control flow: counting a "no"
        # initial verify as "1 toward accept" would let a 4-iter run accept
        # despite never having passed verification, which is clearly wrong.
        _emit("initial-verify", "verifying improved solution before loop")
        v0 = client.call(
            build_verifier_user_message(problem_statement, current_solution),
            model=mdl,
            system=VERIFIER_SYSTEM,
        )
        total_usage = total_usage.add(v0.usage)
        initial_verdict = parse_verifier_verdict(v0.text)
        _emit(
            "initial-verify.done",
            f"judgment={initial_verdict.judgment.value} crit={initial_verdict.critical_count} gaps={initial_verdict.gap_count}",
        )

        consecutive_clean = 1 if initial_verdict.judgment == VerifierJudgment.CLEAN else 0
        consecutive_critical = 1 if initial_verdict.judgment == VerifierJudgment.CRITICAL else 0
        last_verifier_output = v0.text
        last_judgment = initial_verdict.judgment

        if consecutive_clean >= accept_passes:
            result.verdict = Verdict.ACCEPT
            result.consecutive_clean_passes = consecutive_clean
            result.final_solution = current_solution
            _emit("accept", "initial verification alone met the threshold (unusual)")
            _finalise(result, total_usage, started)
            return result

        # --- Steps 3-5 loop (upstream's `for i in range(30)`) -------------
        for it in range(1, max_iterations + 1):
            _emit(
                f"iter{it}.start",
                f"prior judgment={last_judgment.value} consec_clean={consecutive_clean}/{accept_passes} consec_critical={consecutive_critical}/{reject_after_critical}",
            )

            corrected = None
            bug_report_review = None
            correction_usage = TokenUsage()
            review_usage = TokenUsage()

            if last_judgment != VerifierJudgment.CLEAN:
                # Step 4 (optional) — review the bug report.
                bug_report_for_correction = extract_bug_report(last_verifier_output)
                if enable_bug_report_review:
                    _emit(f"iter{it}.review", "reviewing bug report (Step 4)")
                    rev = client.conversation(
                        [
                            {"role": "user", "content": build_verifier_user_message(problem_statement, current_solution)},
                            {"role": "assistant", "content": last_verifier_output},
                            {"role": "user", "content": CHECK_VERIFICATION_PROMPT},
                        ],
                        model=mdl,
                        system=VERIFIER_SYSTEM,
                    )
                    review_usage = rev.usage
                    total_usage = total_usage.add(rev.usage)
                    bug_report_review = rev.text
                    bug_report_for_correction = rev.text

                # Step 5 — correct. Upstream builds a FRESH conversation:
                # system=SOLVER_SYSTEM, user=problem, model=prior_solution,
                # user=[correction_prompt, verify_text]. Anthropic message
                # content can be a list of text blocks the same way Gemini
                # `parts` is, so we keep the two-block user message.
                _emit(f"iter{it}.correct", "applying correction")
                c = client.conversation(
                    [
                        {"role": "user", "content": problem_statement},
                        {"role": "assistant", "content": current_solution},
                        {
                            "role": "user",
                            "content": [
                                {"type": "text", "text": CORRECTION_PROMPT},
                                {"type": "text", "text": bug_report_for_correction},
                            ],
                        },
                    ],
                    model=mdl,
                    system=SOLVER_SYSTEM,
                )
                correction_usage = c.usage
                total_usage = total_usage.add(c.usage)
                corrected = c.text
                current_solution = corrected
                _emit(
                    f"iter{it}.correct.done",
                    f"{c.usage.input_tokens}/{c.usage.output_tokens} tok, {c.latency_seconds:.1f}s",
                )

            # Re-verify the current solution (whether or not we corrected it).
            _emit(f"iter{it}.verify", "verifier pass")
            v = client.call(
                build_verifier_user_message(problem_statement, current_solution),
                model=mdl,
                system=VERIFIER_SYSTEM,
            )
            total_usage = total_usage.add(v.usage)
            verdict = parse_verifier_verdict(v.text)
            _emit(
                f"iter{it}.verify.done",
                f"judgment={verdict.judgment.value} crit={verdict.critical_count} gaps={verdict.gap_count}",
            )

            if verdict.judgment == VerifierJudgment.CLEAN:
                consecutive_clean += 1
                consecutive_critical = 0
            elif verdict.judgment == VerifierJudgment.CRITICAL:
                consecutive_clean = 0
                consecutive_critical += 1
            else:
                # GAPS_ONLY or UNCLEAR — resets clean streak but does NOT
                # count toward the reject-after-critical streak. Justification
                # gaps are explicitly weaker than critical errors in the
                # verifier prompt ("assume the step's conclusion is true").
                consecutive_clean = 0

            iter_usage = TokenUsage(
                input_tokens=v.usage.input_tokens + correction_usage.input_tokens + review_usage.input_tokens,
                output_tokens=v.usage.output_tokens + correction_usage.output_tokens + review_usage.output_tokens,
            )

            result.iterations.append(
                IterationTrace(
                    iteration=it,
                    verifier_output=v.text,
                    verifier_judgment=verdict.judgment,
                    issues_critical=verdict.critical_count,
                    issues_gaps=verdict.gap_count,
                    bug_report_review=bug_report_review,
                    corrected_solution=corrected,
                    usage=iter_usage,
                )
            )

            last_verifier_output = v.text
            last_judgment = verdict.judgment

            if consecutive_clean >= accept_passes:
                result.verdict = Verdict.ACCEPT
                result.consecutive_clean_passes = consecutive_clean
                result.final_solution = current_solution
                _emit("accept", f"after {it} iterations")
                break

            if consecutive_critical >= reject_after_critical:
                result.verdict = Verdict.REJECT
                result.final_solution = current_solution
                _emit(
                    "reject",
                    f"{consecutive_critical} consecutive critical verifications",
                )
                break
        else:
            # Loop completed all max_iterations without accept or reject.
            result.verdict = Verdict.MAX_ITERATIONS
            result.final_solution = current_solution

        result.consecutive_clean_passes = consecutive_clean

    except Exception as e:  # noqa: BLE001
        result.error = f"{type(e).__name__}: {e}"
        result.verdict = Verdict.ERROR
        _emit("error", result.error)

    _finalise(result, total_usage, started)
    return result


def _finalise(result: PipelineResult, total_usage: TokenUsage, started: float) -> None:
    result.total_usage = total_usage
    result.wall_clock_seconds = time.time() - started
    result.finished_at = datetime.now(timezone.utc).isoformat()
