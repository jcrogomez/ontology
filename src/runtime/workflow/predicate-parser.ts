// Predicate DSL for workflow branches_on edges (Phase ζ v0).
//
// Grammar (recursive descent, see WORKFLOW_RUNTIME_SPEC.md §3.2):
//
//   expr      := orExpr
//   orExpr    := andExpr ('||' andExpr)*
//   andExpr   := atom ('&&' atom)*
//   atom      := 'verdict' '==' string
//              | 'severity' '==' string
//              | 'consecutive' '(' expr ',' number ')'
//              | 'since_last' '(' expr ')' '>=' number
//              | 'step_count' '>=' number
//              | '(' expr ')'
//
// The grammar is intentionally small — it covers exactly the patterns
// that the IMO verify-refine flow + similar verify-loop workflows
// need. v1 may extend with arithmetic / variables / negation; v0 does
// not, because every additional operator adds parser surface that
// has to be validated against the verifier output schema.
//
// Predicates are pure data after parsing — the resulting AST node
// can be evaluated against an `EvalContext` (current verdict, per-
// node trace, step count) by `evaluatePredicate`. The parser and the
// evaluator are split so the graph loader can parse + statically
// validate predicates at load time without needing a runtime state.

import type { VerifierSchemaName } from "../../kernel/schemas/workflow.js";
import { verifierSchemaFields } from "./verifier-schemas.js";

// ── AST ─────────────────────────────────────────────────────────────────────

export type PredicateAst =
  | { kind: "verdictEq"; value: string }
  | { kind: "severityEq"; value: string }
  | { kind: "consecutive"; inner: PredicateAst; n: number }
  | { kind: "sinceLastGte"; inner: PredicateAst; n: number }
  | { kind: "stepCountGte"; n: number }
  | { kind: "and"; left: PredicateAst; right: PredicateAst }
  | { kind: "or"; left: PredicateAst; right: PredicateAst };

// ── Tokenizer ───────────────────────────────────────────────────────────────

type Token =
  | { kind: "ident"; value: string }
  | { kind: "string"; value: string }
  | { kind: "number"; value: number }
  | { kind: "op"; value: "==" | ">=" | "&&" | "||" }
  | { kind: "punct"; value: "(" | ")" | "," };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const c = input[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === "(" || c === ")" || c === ",") {
      tokens.push({ kind: "punct", value: c });
      i++;
      continue;
    }
    if (c === "=" && input[i + 1] === "=") {
      tokens.push({ kind: "op", value: "==" });
      i += 2;
      continue;
    }
    if (c === ">" && input[i + 1] === "=") {
      tokens.push({ kind: "op", value: ">=" });
      i += 2;
      continue;
    }
    if (c === "&" && input[i + 1] === "&") {
      tokens.push({ kind: "op", value: "&&" });
      i += 2;
      continue;
    }
    if (c === "|" && input[i + 1] === "|") {
      tokens.push({ kind: "op", value: "||" });
      i += 2;
      continue;
    }
    if (c === '"' || c === "'") {
      const quote = c;
      let j = i + 1;
      let value = "";
      while (j < input.length && input[j] !== quote) {
        if (input[j] === "\\" && j + 1 < input.length) {
          value += input[j + 1];
          j += 2;
        } else {
          value += input[j];
          j++;
        }
      }
      if (j >= input.length) {
        throw new Error(`unterminated string literal starting at position ${i}`);
      }
      tokens.push({ kind: "string", value });
      i = j + 1;
      continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < input.length && /[0-9]/.test(input[j])) j++;
      tokens.push({ kind: "number", value: parseInt(input.slice(i, j), 10) });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < input.length && /[A-Za-z0-9_]/.test(input[j])) j++;
      tokens.push({ kind: "ident", value: input.slice(i, j) });
      i = j;
      continue;
    }
    throw new Error(`unexpected character "${c}" at position ${i}`);
  }
  return tokens;
}

// ── Parser ──────────────────────────────────────────────────────────────────

class Parser {
  private pos = 0;
  constructor(private readonly tokens: Token[]) {}

  parse(): PredicateAst {
    const expr = this.parseOr();
    if (this.pos < this.tokens.length) {
      throw new Error(
        `unexpected trailing token: ${JSON.stringify(this.tokens[this.pos])}`,
      );
    }
    return expr;
  }

  private parseOr(): PredicateAst {
    let left = this.parseAnd();
    while (this.peekOp() === "||") {
      this.pos++;
      const right = this.parseAnd();
      left = { kind: "or", left, right };
    }
    return left;
  }

  private parseAnd(): PredicateAst {
    let left = this.parseAtom();
    while (this.peekOp() === "&&") {
      this.pos++;
      const right = this.parseAtom();
      left = { kind: "and", left, right };
    }
    return left;
  }

  private parseAtom(): PredicateAst {
    const t = this.tokens[this.pos];
    if (!t) throw new Error("unexpected end of predicate");

    if (t.kind === "punct" && t.value === "(") {
      this.pos++;
      const inner = this.parseOr();
      this.expectPunct(")");
      return inner;
    }

    if (t.kind === "ident") {
      const name = t.value;
      this.pos++;
      if (name === "verdict") {
        this.expectOp("==");
        const s = this.expectString();
        return { kind: "verdictEq", value: s };
      }
      if (name === "severity") {
        this.expectOp("==");
        const s = this.expectString();
        return { kind: "severityEq", value: s };
      }
      if (name === "consecutive") {
        this.expectPunct("(");
        const inner = this.parseOr();
        this.expectPunct(",");
        const n = this.expectNumber();
        this.expectPunct(")");
        return { kind: "consecutive", inner, n };
      }
      if (name === "since_last") {
        this.expectPunct("(");
        const inner = this.parseOr();
        this.expectPunct(")");
        this.expectOp(">=");
        const n = this.expectNumber();
        return { kind: "sinceLastGte", inner, n };
      }
      if (name === "step_count") {
        this.expectOp(">=");
        const n = this.expectNumber();
        return { kind: "stepCountGte", n };
      }
      throw new Error(`unknown identifier "${name}" in predicate`);
    }

    throw new Error(`unexpected token at position ${this.pos}: ${JSON.stringify(t)}`);
  }

  private peekOp(): string | null {
    const t = this.tokens[this.pos];
    return t && t.kind === "op" ? t.value : null;
  }

  private expectOp(op: string): void {
    const t = this.tokens[this.pos];
    if (!t || t.kind !== "op" || t.value !== op) {
      throw new Error(`expected "${op}" at position ${this.pos}`);
    }
    this.pos++;
  }

  private expectPunct(p: string): void {
    const t = this.tokens[this.pos];
    if (!t || t.kind !== "punct" || t.value !== p) {
      throw new Error(`expected "${p}" at position ${this.pos}`);
    }
    this.pos++;
  }

  private expectString(): string {
    const t = this.tokens[this.pos];
    if (!t || t.kind !== "string") {
      throw new Error(`expected string literal at position ${this.pos}`);
    }
    this.pos++;
    return t.value;
  }

  private expectNumber(): number {
    const t = this.tokens[this.pos];
    if (!t || t.kind !== "number") {
      throw new Error(`expected number at position ${this.pos}`);
    }
    this.pos++;
    return t.value;
  }
}

/**
 * Parse a predicate string into an AST. Throws on syntax errors with
 * a position-anchored message so the graph loader can surface where
 * the offending predicate sits.
 */
export function parsePredicate(src: string): PredicateAst {
  return new Parser(tokenize(src)).parse();
}

// ── Static field-set validation ─────────────────────────────────────────────

/**
 * Walk a parsed predicate and return the set of verifier-output
 * field names it reads (currently: `verdict` and/or `severity`).
 * Used by the graph loader to reject predicates that reference a
 * field absent from the source verifier's declared output schema.
 */
export function predicateFields(ast: PredicateAst): Set<string> {
  const out = new Set<string>();
  walk(ast, out);
  return out;
}

function walk(ast: PredicateAst, out: Set<string>): void {
  switch (ast.kind) {
    case "verdictEq":
      out.add("verdict");
      return;
    case "severityEq":
      out.add("severity");
      return;
    case "stepCountGte":
      return;
    case "consecutive":
    case "sinceLastGte":
      walk(ast.inner, out);
      return;
    case "and":
    case "or":
      walk(ast.left, out);
      walk(ast.right, out);
      return;
  }
}

/**
 * Validate that every field the predicate reads is declared by the
 * given verifier output schema. Returns the list of unknown field
 * names; empty list when the predicate is compatible.
 */
export function validatePredicateAgainstSchema(
  ast: PredicateAst,
  schemaName: VerifierSchemaName,
): string[] {
  const declared = verifierSchemaFields(schemaName);
  const used = predicateFields(ast);
  const unknown: string[] = [];
  for (const f of used) {
    if (!declared.has(f)) unknown.push(f);
  }
  return unknown;
}

// ── Static coverage analysis ──────────────────────────────────────────────────

/**
 * Optimistic static check: COULD this predicate ever fire on a visit
 * whose CURRENT verdict/severity equals `point`? Used by the graph
 * loader's branch-coverage lint (spec §3.2).
 *
 * History- and step-gated operators are treated optimistically — we
 * assume the surrounding trace can be arranged to satisfy their
 * counting constraint — EXCEPT where the current point alone makes the
 * predicate impossible:
 *   - `consecutive(inner, n)`: the current visit is inside the window,
 *     so it must satisfy `inner`.
 *   - `since_last(inner) >= n` (n ≥ 1): fires only when the current
 *     visit does NOT satisfy `inner` (otherwise the distance is 0 < n).
 *   - `step_count >= n`: independent of the current point.
 *
 * Because a fully-specified point fixes every field the v0 grammar can
 * read, `inner` is deterministic at a point, so the negation used for
 * `since_last` is exact. A point that NO predicate can match is a
 * guaranteed runtime `no_matching_branch`; the loader warns about it.
 */
export function predicateCanMatchPoint(
  ast: PredicateAst,
  point: { verdict: string; severity?: string },
): boolean {
  switch (ast.kind) {
    case "verdictEq":
      return point.verdict === ast.value;
    case "severityEq":
      return point.severity === ast.value;
    case "stepCountGte":
      return true;
    case "consecutive":
      return predicateCanMatchPoint(ast.inner, point);
    case "sinceLastGte":
      return ast.n <= 0 ? true : !predicateCanMatchPoint(ast.inner, point);
    case "and":
      return (
        predicateCanMatchPoint(ast.left, point) &&
        predicateCanMatchPoint(ast.right, point)
      );
    case "or":
      return (
        predicateCanMatchPoint(ast.left, point) ||
        predicateCanMatchPoint(ast.right, point)
      );
  }
}

// ── Evaluator ───────────────────────────────────────────────────────────────

/**
 * A single visit to a verifier node. The executor passes one of
 * these into the evaluator for each candidate edge so the predicate
 * can read `verdict` / `severity`. `verdict` is required (every
 * schema has it); `severity` is optional (only `with-severity` ships
 * it).
 */
export interface VerifierVisit {
  verdict: string;
  severity?: string;
}

/**
 * Evaluation context for a predicate. `current` is the verifier's
 * just-emitted visit; `history` is the ordered list of prior visits
 * to the SAME source node (used by `consecutive` and `since_last`).
 * `stepCount` is the workflow-global visit count, used by
 * `step_count >= n`.
 */
export interface EvalContext {
  current: VerifierVisit;
  history: readonly VerifierVisit[];
  stepCount: number;
}

/**
 * Evaluate a parsed predicate against an evaluation context. Pure;
 * throws nothing in the v0 grammar — all forms are total.
 */
export function evaluatePredicate(
  ast: PredicateAst,
  ctx: EvalContext,
): boolean {
  switch (ast.kind) {
    case "verdictEq":
      return ctx.current.verdict === ast.value;
    case "severityEq":
      return ctx.current.severity === ast.value;
    case "stepCountGte":
      return ctx.stepCount >= ast.n;
    case "and":
      return (
        evaluatePredicate(ast.left, ctx) && evaluatePredicate(ast.right, ctx)
      );
    case "or":
      return (
        evaluatePredicate(ast.left, ctx) || evaluatePredicate(ast.right, ctx)
      );
    case "consecutive": {
      // "Last n visits ALL satisfy inner" — including the current
      // one. We need exactly n historic+current visits to evaluate;
      // fewer than n total means the predicate cannot fire.
      const allVisits = [...ctx.history, ctx.current];
      if (allVisits.length < ast.n) return false;
      const slice = allVisits.slice(-ast.n);
      for (const v of slice) {
        const localCtx: EvalContext = {
          current: v,
          history: ctx.history,
          stepCount: ctx.stepCount,
        };
        if (!evaluatePredicate(ast.inner, localCtx)) return false;
      }
      return true;
    }
    case "sinceLastGte": {
      // "It has been ≥ n visits since the inner predicate last fired
      // true on this node's verdict." If the inner has NEVER fired
      // true in (history ∪ {current}), and the total visit count is
      // ≥ n, return true.
      const allVisits = [...ctx.history, ctx.current];
      let sinceLast = 0;
      let found = false;
      // Walk from the end backward; the most recent visit gets
      // distance 0 if it satisfies inner, distance 1 if the
      // penultimate does, etc.
      for (let k = allVisits.length - 1; k >= 0; k--) {
        const v = allVisits[k];
        const localCtx: EvalContext = {
          current: v,
          history: ctx.history,
          stepCount: ctx.stepCount,
        };
        if (evaluatePredicate(ast.inner, localCtx)) {
          sinceLast = allVisits.length - 1 - k;
          found = true;
          break;
        }
      }
      if (!found) {
        // Never fired. Conventionally, "since_last(p) >= n" with no
        // prior firing means "all visits failed p"; the count of
        // such visits is allVisits.length. Return true iff that
        // count >= n. This is the IMO 6' "10 consecutive major
        // issues with no intervening pass" case.
        return allVisits.length >= ast.n;
      }
      return sinceLast >= ast.n;
    }
  }
}
