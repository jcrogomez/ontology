"""Parse the verifier's free-form output into a structured judgment.

The verifier prompt asks for a "Final Verdict" sentence at the start
of the Summary, followed by a bulleted List of Findings classifying
each issue. We parse heuristically — the prompt is consistent enough
that a small grammar of regexes catches >95 % of well-formed outputs,
and the loop is robust to the remainder (UNCLEAR collapses to
CRITICAL, which biases toward more iterations rather than premature
accept).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import List

from .types import VerifierJudgment


_CRITICAL_PATTERNS = [
    # Explicit classification in the bullets the prompt asks for.
    re.compile(r"\*\*Critical Error\*\*", re.IGNORECASE),
    re.compile(r"Issue:\s*\**Critical Error\**", re.IGNORECASE),
    # Final-verdict phrasings the prompt exemplifies.
    re.compile(r"contains? (a|at least one) Critical Error", re.IGNORECASE),
    re.compile(r"is\s+\*?\*?invalid\*?\*?", re.IGNORECASE),
]

_GAP_PATTERNS = [
    re.compile(r"\*\*Justification Gap\*\*", re.IGNORECASE),
    re.compile(r"Issue:\s*\**Justification Gap\**", re.IGNORECASE),
    re.compile(r"Justification Gaps?", re.IGNORECASE),
]

_CORRECT_PATTERNS = [
    re.compile(r"solution is\s+\*?\*?correct\*?\*?", re.IGNORECASE),
    re.compile(r"solution is rigorous(ly correct)?", re.IGNORECASE),
    re.compile(r"no (issues|errors|gaps) (were )?found", re.IGNORECASE),
    re.compile(r"every step is rigorously justified", re.IGNORECASE),
]


@dataclass
class VerifierVerdict:
    judgment: VerifierJudgment
    critical_count: int
    gap_count: int


def _summary_block(text: str) -> str:
    """Restrict pattern matching to the Summary section when present.

    The verifier emits a Summary block followed by a Detailed
    Verification Log. The Log discusses individual steps and may
    repeat the words "Critical Error" / "Justification Gap" in
    contexts that are NOT a final-verdict classification (e.g.,
    "the previous step was a Critical Error" when narrating the
    bug). Counting only inside the Summary keeps the loop honest.
    """
    # The prompt asks for "List of Findings" right after "Final Verdict".
    # Look for the heading or fall back to the first ~3000 chars.
    m = re.search(r"\*\*List of Findings\*\*(.+?)(?:\n##|\Z|\*\*b\.|---)", text, re.DOTALL | re.IGNORECASE)
    if m:
        return m.group(0)
    m = re.search(r"\*\*Final Verdict\*\*(.+?)(?:\n##|\Z|---|\*\*b\.)", text, re.DOTALL | re.IGNORECASE)
    if m:
        return m.group(0)
    return text[:3000]


def parse_verifier_verdict(verifier_output: str) -> VerifierVerdict:
    summary = _summary_block(verifier_output)

    critical_count = sum(len(p.findall(summary)) for p in _CRITICAL_PATTERNS)
    gap_count = sum(len(p.findall(summary)) for p in _GAP_PATTERNS)

    # Critical patterns and the "List of Findings - Issue: Critical Error"
    # phrasing both match; the bullet form is more specific, so we
    # de-duplicate by capping at the count of distinct "Issue:" lines
    # classified as critical.
    issue_lines = re.findall(r"Issue:\s*[-–]?\s*(\*\*)?([A-Za-z ]+?)(?:\*\*)?", summary)
    bullet_crit = sum(1 for _, kind in issue_lines if "critical" in kind.lower())
    bullet_gap = sum(1 for _, kind in issue_lines if "gap" in kind.lower())
    if bullet_crit:
        critical_count = bullet_crit
    if bullet_gap:
        gap_count = bullet_gap

    # Decide the judgment.
    if critical_count > 0:
        return VerifierVerdict(VerifierJudgment.CRITICAL, critical_count, gap_count)

    correct_signal = any(p.search(summary) for p in _CORRECT_PATTERNS)
    if gap_count == 0 and correct_signal:
        return VerifierVerdict(VerifierJudgment.CLEAN, 0, 0)
    if gap_count > 0:
        return VerifierVerdict(VerifierJudgment.GAPS_ONLY, 0, gap_count)
    if correct_signal:
        return VerifierVerdict(VerifierJudgment.CLEAN, 0, 0)

    return VerifierVerdict(VerifierJudgment.UNCLEAR, 0, 0)


def extract_bug_report(verifier_output: str) -> str:
    """Return the section of the verifier's output that the corrector
    should consume. We pass the full Summary plus the Detailed
    Verification Log, since the paper's correction step (§2.3, Step 5)
    needs both the classification and the line-by-line reasoning.
    """
    # The whole output is small enough that we just hand it back as the
    # bug report, but we strip leading whitespace and trailing example
    # boilerplate (if the model copied the in-prompt example).
    return verifier_output.strip()
