// Ficha-repair prompt assembly — MVP_REGEN_LOOP.md §3, the two operators.
//
// R_strict sees ONLY spec-side signal: the current ficha, the behaviour
// oracle's acceptance criteria, the failing-case diagnostics, export drift and
// lint issues of the best failing draft. It NEVER sees the reference source —
// that is what makes its closures the honest floor (no code-laundering can
// make F∘G≈id trivially true). The builder ENFORCES this: passing a
// referenceSource to the strict builder throws.
//
// R_perm may additionally read the reference source — the recoverable-intent
// CEILING. Its output is still guarded: the injected-text budget (Regimes'
// 2000-char structural invariant, arXiv 2606.10241 §gates) bounds how much
// text a repair can add, so "paste the implementation into the ficha" fails
// at proposal time rather than corrupting the fidelity metric downstream.
//
// Pure module: string assembly + parsing + the budget arithmetic. No IO, no
// dispatch — the orchestrator (repair.ts) owns those.

export type RepairOperatorMode = "R_strict" | "R_perm";

/** Regimes-inspired structural invariant: max characters a repair may ADD to
 *  the ficha surface (prompt + rules, summed) relative to the original. */
export const DEFAULT_REPAIR_BUDGET_CHARS = 2000;

export interface RepairPromptInputs {
  nodeId: string;
  /** Current ficha prompt (node.prompt.raw). */
  fichaPrompt: string;
  /** Current declared rules. */
  rules: readonly string[];
  /** Context contract surface, verbatim identifiers. */
  contract: { requires: readonly string[]; provides: readonly string[]; forbids: readonly string[] };
  /** Behaviour-oracle acceptance criteria (case name + optional description) —
   *  the same black-box prose oracle-grounding feeds the generator. */
  oracle: ReadonlyArray<{ name: string; description?: string }>;
  /** Aggregated failing cases from the parent baseline (majority-WRONG), with
   *  the draft-side diagnostic when one exists. */
  failingCases: ReadonlyArray<{ name: string; diagnostic?: string }>;
  /** Export drift of the parent's representative draft vs the source AST. */
  missingExports: readonly string[];
  extraExports: readonly string[];
  /** R_perm only. The strict builder throws if this is set. */
  referenceSource?: string;
}

export interface RepairedFicha {
  prompt: string;
  rules: string[];
}

/** System prompt: the operator's role and its output contract. Shared skeleton;
 *  the access clause differs per mode. */
export function buildRepairSystemPrompt(mode: RepairOperatorMode): string {
  const access =
    mode === "R_strict"
      ? "You see ONLY specification-side evidence: the current ficha, acceptance criteria, failure diagnostics, and export drift. You do NOT see the reference implementation, and you must not invent implementation detail — enrich the ficha only with intent the evidence supports."
      : "You additionally see the reference implementation. Use it to recover INTENT — semantics, edge-case conventions, contracts. You must NOT paste implementation into the ficha: no code blocks, no verbatim statements, no line-by-line description. A ficha that smuggles code is a failed repair.";
  return [
    "You repair the SPECIFICATION (ficha) of a code-generation node whose current spec under-determines its artifact: independent generations satisfy the spec yet fail the behaviour oracle, which means the missing information is in the spec, not the generator.",
    access,
    "Write the repaired ficha in the same language as the current ficha prompt.",
    'Respond with a single JSON object and nothing else: {"prompt": string, "rules": string[]}. "prompt" is the full replacement ficha prompt (not a diff). "rules" is the full replacement rule list — keep existing rules that are still correct, drop wrong ones, add missing ones. Rules are single-sentence, checkable constraints.',
  ].join("\n\n");
}

export function buildRepairUserPrompt(mode: RepairOperatorMode, inputs: RepairPromptInputs): string {
  if (mode === "R_strict" && inputs.referenceSource !== undefined) {
    throw new Error("R_strict must not receive the reference source (laundering guard)");
  }
  const lines: string[] = [];
  lines.push(`# Node ${inputs.nodeId} — current ficha prompt`);
  lines.push(inputs.fichaPrompt.trim().length > 0 ? inputs.fichaPrompt : "(empty)");
  lines.push("");
  lines.push("# Current rules");
  lines.push(inputs.rules.length > 0 ? inputs.rules.map((r) => `- ${r}`).join("\n") : "(none)");
  lines.push("");
  lines.push("# Context contract");
  lines.push(`requires: ${inputs.contract.requires.join(", ") || "(none)"}`);
  lines.push(`provides: ${inputs.contract.provides.join(", ") || "(none)"}`);
  lines.push(`forbids: ${inputs.contract.forbids.join(", ") || "(none)"}`);
  lines.push("");
  lines.push("# Behaviour acceptance criteria (the oracle the artifact must pass)");
  lines.push(
    inputs.oracle.length > 0
      ? inputs.oracle.map((o) => `- ${o.name}${o.description ? `: ${o.description}` : ""}`).join("\n")
      : "(none)",
  );
  lines.push("");
  lines.push("# Failing cases at the current ficha (majority across independent draws)");
  lines.push(
    inputs.failingCases.length > 0
      ? inputs.failingCases.map((f) => `- ${f.name}${f.diagnostic ? ` — ${f.diagnostic}` : ""}`).join("\n")
      : "(none — the failures are structural, see export drift)",
  );
  if (inputs.missingExports.length > 0 || inputs.extraExports.length > 0) {
    lines.push("");
    lines.push("# Export drift of the representative draft");
    if (inputs.missingExports.length > 0) lines.push(`missing: ${inputs.missingExports.join(", ")}`);
    if (inputs.extraExports.length > 0) lines.push(`extra: ${inputs.extraExports.join(", ")}`);
  }
  if (mode === "R_perm" && inputs.referenceSource !== undefined) {
    lines.push("");
    lines.push("# Reference implementation (recover INTENT from it; never paste it)");
    lines.push("```");
    lines.push(inputs.referenceSource);
    lines.push("```");
  }
  lines.push("");
  lines.push(
    "Diagnose which intent the failing cases prove is MISSING from the ficha, then produce the repaired ficha JSON.",
  );
  return lines.join("\n");
}

/** Tolerant parse of the repairer's response: first fenced ```json block, else
 *  the first top-level {...} span. Returns null when nothing parses to the
 *  expected shape — the caller treats that as a failed (retryable) repair,
 *  never as a proposal. */
export function parseRepairResponse(text: string): RepairedFicha | null {
  const candidates: string[] = [];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) candidates.push(fenced[1]);
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last > first) candidates.push(text.slice(first, last + 1));
  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c) as unknown;
      if (typeof parsed !== "object" || parsed === null) continue;
      const obj = parsed as Record<string, unknown>;
      if (typeof obj.prompt !== "string" || obj.prompt.trim().length === 0) continue;
      const rules = Array.isArray(obj.rules) ? obj.rules.filter((r): r is string => typeof r === "string") : [];
      return { prompt: obj.prompt, rules };
    } catch {
      continue;
    }
  }
  return null;
}

export interface BudgetCheck {
  addedChars: number;
  budgetChars: number;
  withinBudget: boolean;
}

/** The injected-text budget: how many characters the repair ADDS to the ficha
 *  surface (prompt + rules). A shrinking or same-size repair is always within
 *  budget — the guard is against padding the spec with (possibly laundered)
 *  bulk, not against rewriting it. */
export function checkRepairBudget(
  original: { prompt: string; rules: readonly string[] },
  repaired: RepairedFicha,
  budgetChars: number = DEFAULT_REPAIR_BUDGET_CHARS,
): BudgetCheck {
  const size = (p: string, rs: readonly string[]): number => p.length + rs.reduce((s, r) => s + r.length, 0);
  const addedChars = Math.max(0, size(repaired.prompt, repaired.rules) - size(original.prompt, original.rules));
  return { addedChars, budgetChars, withinBudget: addedChars <= budgetChars };
}
