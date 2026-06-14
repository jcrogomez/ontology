import { stripRulesBlock } from "../compile/rules-grounding.js";

// Rule enforcement — turn a node's `rules` from preserved text (rules-grounding
// closed that, LENS_LAWS_2026-06-13 E2) into VERIFIED invariants where it can,
// and HONESTLY TRIAGE the rest. The live graph's `rules` field is mostly
// behavioural prose, canon axioms, and 3B extraction noise (measured: ~90% of
// the corpus is not statically decidable), so the first value of enforcement is
// the classification itself — a ficha-quality signal — paired with certain
// static checks for the decidable minority and a routing of behavioural rules
// to the executable channel (`onto probe` → behaviour fixtures → the
// regenerate behaviour gate).
//
// Tiering (honest by construction):
//   forbid_static / require_static — DECIDABLE NOW: a clean code identifier is
//     forbidden-absent / required-present in the artifact. Deterministic, $0.
//   behavioural   — assertable at runtime ("returns X when Y", "throws on Z"):
//     not statically decidable; route to `onto probe`.
//   meta          — a property of the code's nature ("pure", "idempotent"):
//     needs effect/property analysis; declared, not checked here.
//   prose         — no imperative marker (canon axioms, descriptions, extraction
//     noise): not an enforceable rule at all; flagged for ficha cleanup.

export type RuleClass =
  | "forbid_static"
  | "require_static"
  | "behavioural"
  | "meta"
  | "prose";

export type RuleVerdict =
  | "pass" // static check held
  | "fail" // static check violated
  | "behavioural" // route to a behaviour fixture
  | "meta" // property-level, not statically checked
  | "prose" // not an enforceable rule
  | "unparseable"; // artifact could not be parsed for a static check

export interface RuleCheck {
  rule: string;
  ruleClass: RuleClass;
  verdict: RuleVerdict;
  /** The code identifier a static rule pins, when one was extracted. */
  symbol?: string;
  detail?: string;
}

export interface RuleCheckResult {
  nodeId: string;
  checks: RuleCheck[];
  staticChecked: number;
  violations: number;
  behavioural: number;
  meta: number;
  prose: number;
}

// A clean code identifier (incl. dotted member like console.log), nothing else.
const IDENTIFIER = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/;
const META_RX = /\b(pure|no side[- ]?effects?|idempotent|deterministic|reference[- ]?equal|thread[- ]?safe|stateless|immutab)/i;
const IMPERATIVE_RX = /\b(MUST|REQUIRE|FORBID|SHALL|SHOULD|NEVER|ALWAYS)\b/i;
const ASSERTABLE_RX = /\b(returns?|throws?|yields?|equals?|when|if |never returns|resolves?|rejects?|maps?|produces?)\b/i;

// Pull the forbidden/required symbol out of a rule, returning it only when the
// ENTIRE remainder is a single clean code identifier (e.g. "FORBID: console.log"
// or "MUST export createNode"). A rule whose remainder is a phrase ("FORBID:
// combining --literal flags", "FORBID: verdicts other than pass/fail") names a
// forbidden CONDITION, not a symbol — it is behavioural, never statically
// checked, so the static path never false-accuses on prose.
export function extractStaticSymbol(rule: string, kind: "forbid" | "require"): string | null {
  const head = kind === "forbid" ? /^\s*FORBID:?\s*/i : /^\s*(?:MUST\s+(?:export|expose|define)|REQUIRE:?\s*(?:export(?:s)?|define)?)\s*/i;
  let rest = rule.replace(head, "").trim();
  rest = rest.replace(/\(\s*\)$/, "").replace(/[.;,]+$/, "").trim(); // drop trailing "()" / punctuation
  if (IDENTIFIER.test(rest)) return rest;
  return null;
}

export function classifyRule(rule: string): { ruleClass: RuleClass; symbol?: string } {
  const r = rule.trim();
  if (/^\s*FORBID\b/i.test(r)) {
    const sym = extractStaticSymbol(r, "forbid");
    if (sym) return { ruleClass: "forbid_static", symbol: sym };
    return { ruleClass: "behavioural" }; // a forbidden CONDITION, not an identifier
  }
  if (/\b(MUST\s+(export|expose|define)|REQUIRE:?\s*(export|exports|define))\b/i.test(r)) {
    const sym = extractStaticSymbol(r, "require");
    if (sym) return { ruleClass: "require_static", symbol: sym };
  }
  if (META_RX.test(r)) return { ruleClass: "meta" };
  if (IMPERATIVE_RX.test(r) && ASSERTABLE_RX.test(r)) return { ruleClass: "behavioural" };
  // No imperative marker → a description / canon axiom / extraction noise.
  return { ruleClass: "prose" };
}

// Whole-word presence of `symbol` in code, after stripping the rules-grounding
// block (so a FORBID rule's own annotation text is never a self-violation) and
// line/block comments (a forbidden call mentioned in a comment is not the code
// doing it). Dotted identifiers match literally.
function symbolPresent(symbol: string, code: string): boolean {
  const stripped = stripRulesBlock(code)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  const esc = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\w$])${esc}(?![\\w$])`).test(stripped);
}

export function checkRules(args: {
  nodeId: string;
  rules: readonly string[];
  artifactText: string;
}): RuleCheckResult {
  const checks: RuleCheck[] = [];

  for (const rule of args.rules) {
    const { ruleClass, symbol } = classifyRule(rule);
    if (ruleClass === "forbid_static" && symbol) {
      const present = symbolPresent(symbol, args.artifactText);
      checks.push({
        rule, ruleClass, symbol,
        verdict: present ? "fail" : "pass",
        detail: present ? `forbidden symbol "${symbol}" is present in the artifact` : `forbidden symbol "${symbol}" absent`,
      });
    } else if (ruleClass === "require_static" && symbol) {
      const present = symbolPresent(symbol, args.artifactText);
      checks.push({
        rule, ruleClass, symbol,
        verdict: present ? "pass" : "fail",
        detail: present ? `required symbol "${symbol}" present` : `required symbol "${symbol}" missing from the artifact`,
      });
    } else if (ruleClass === "behavioural") {
      checks.push({ rule, ruleClass, verdict: "behavioural", detail: "assertable at runtime — enforce via `onto probe`" });
    } else if (ruleClass === "meta") {
      checks.push({ rule, ruleClass, verdict: "meta", detail: "property-level — not statically checked" });
    } else {
      checks.push({ rule, ruleClass, verdict: "prose", detail: "no imperative marker — descriptive/axiom/noise, not an enforceable rule" });
    }
  }

  return {
    nodeId: args.nodeId,
    checks,
    staticChecked: checks.filter((c) => c.ruleClass === "forbid_static" || c.ruleClass === "require_static").length,
    violations: checks.filter((c) => c.verdict === "fail").length,
    behavioural: checks.filter((c) => c.ruleClass === "behavioural").length,
    meta: checks.filter((c) => c.ruleClass === "meta").length,
    prose: checks.filter((c) => c.ruleClass === "prose").length,
  };
}
