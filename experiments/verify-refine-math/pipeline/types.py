"""Data types for the pipeline. Kept dataclass-shaped so the JSON
serialisation in `loop.py` is a one-liner and the on-disk schema
is self-describing.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from enum import Enum
from typing import Optional


class Verdict(str, Enum):
    """Final outcome of a pipeline run on one problem."""

    ACCEPT = "accept"
    REJECT = "reject"
    MAX_ITERATIONS = "max_iterations"
    ERROR = "error"


class VerifierJudgment(str, Enum):
    """Coarse classification of one verifier pass.

    The verifier prompt asks for richer output (per-issue location,
    classification as Critical Error / Justification Gap, etc.); this
    enum is the loop-level decision derived from that rich output by
    `parse_verifier_verdict`.
    """

    CLEAN = "clean"  # no issues raised
    GAPS_ONLY = "gaps_only"  # justification gaps but no critical errors
    CRITICAL = "critical"  # at least one critical error
    UNCLEAR = "unclear"  # parser couldn't decide; treat as critical


@dataclass
class TokenUsage:
    input_tokens: int = 0
    output_tokens: int = 0

    def add(self, other: "TokenUsage") -> "TokenUsage":
        return TokenUsage(
            self.input_tokens + other.input_tokens,
            self.output_tokens + other.output_tokens,
        )


@dataclass
class IterationTrace:
    """One verify-correct cycle (Steps 3-5 of the paper's pipeline).

    `iteration` is 1-indexed; the initial solver run + self-improvement
    are recorded separately in `PipelineResult.initial_solution` /
    `.improved_solution`, not as an iteration.
    """

    iteration: int
    verifier_output: str
    verifier_judgment: VerifierJudgment
    issues_critical: int
    issues_gaps: int
    bug_report_review: Optional[str]  # Step 4 (optional); None when skipped
    corrected_solution: Optional[str]  # Step 5; None on the final pass
    usage: TokenUsage


@dataclass
class PipelineResult:
    problem_id: str
    problem_statement: str
    model: str
    verdict: Verdict
    consecutive_clean_passes: int
    initial_solution: str
    improved_solution: str
    iterations: list[IterationTrace] = field(default_factory=list)
    final_solution: str = ""  # last accepted (or last attempted) solution
    total_usage: TokenUsage = field(default_factory=TokenUsage)
    wall_clock_seconds: float = 0.0
    started_at: str = ""
    finished_at: str = ""
    error: Optional[str] = None

    def to_json(self) -> dict:
        d = asdict(self)
        # Enums serialise as strings via the str-inheriting class above,
        # but asdict() preserves the wrapping; flatten for stable JSON.
        d["verdict"] = self.verdict.value
        for it in d["iterations"]:
            it["verifier_judgment"] = (
                it["verifier_judgment"]
                if isinstance(it["verifier_judgment"], str)
                else it["verifier_judgment"].value
            )
        return d
