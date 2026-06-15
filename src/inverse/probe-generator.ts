import * as fs from "node:fs";
import * as path from "node:path";
import type { OntologyNode } from "../kernel/schemas/ontology.js";
import { loadFixture, runBehaviorCheck } from "../runtime/legend/behavior-checker.js";

// Probe generator — turns a node's intent + source into a SELF-VALIDATED
// behavioural fixture, the missing safety net for `onto regenerate --write`.
//
// The design is "characterization testing, validated against the truth on
// disk". An LLM proposes BehaviorCase entries that exercise the node's
// exported functions; we then run EACH case against the CURRENT source
// (source-vs-source via the behaviour-checker) and keep only the cases that
// cleanly `match` — i.e. they load, run deterministically, and their assert
// holds on the real code. A case that throws, times out, is non-deterministic,
// or asserts something false about the source is dropped. The persisted
// fixture is therefore honest by construction: every kept case is a true
// statement about how the code behaves today. When that fixture is later run
// by `regenerate --behavior-check`, a regeneration that diverges from the
// source on any kept input — including a structurally-identical off-by-one —
// fails the check and blocks the write.

const FIXTURES_DIR = "tests/behavior-fixtures";

export const PROBE_SYSTEM_PROMPT = `You write behavioural test fixtures for a code-regeneration verifier.

You are given one TypeScript source module and its declared exports. Output ONLY a TypeScript fixture module of this exact shape (no prose, no markdown fences):

import type { BehaviorCase } from "../src/runtime/legend/behavior-checker.js";

export const cases: BehaviorCase[] = [
  {
    name: "<short description of what this case exercises>",
    setup: () => (<inputs object or value>),
    invoke: (api, ctx) => (api as any).<exportedFunction>(<args from ctx>),
    assert: (r) => <boolean property that MUST hold for correct output>,
  },
  // more cases...
];

HARD RULES:
- Test ONLY the pure exported functions named in the contract. Skip anything that does file/network I/O, mutates global state, needs a database, renders UI, or depends on the current time/random — those are not characterizable here.
- 'api' is the imported module namespace: call exports as api.<name>(...). 'ctx' is what setup() returned.
- setup() MUST be deterministic and self-contained: build every input inline. No imports beyond the BehaviorCase type. No reading files. No Date.now()/Math.random().
- CRITICAL — assert against the ACTUAL CODE, never the prose intent. Trace the SOURCE line by line to compute the exact output; the intent description may be out of date or wrong. If the code does \`padStart(n)\` it does NOT increment n. When you are not 100% certain of the exact output by reading the code, write \`assert: () => true\` — the harness independently compares the regeneration against this source, so a case with a trivial assert still catches divergence, whereas a WRONG assert silently drops the case. A wrong guess is worse than no assertion.
- Prefer 4-8 cases that cover distinct branches/edge cases (empty input, boundary values, the typical case). A deterministic throw is a valid case (the harness locks "throws on this input").
- The module must be valid standalone TypeScript that compiles with no unresolved references.
- RULE TARGETS: if the prompt lists "Behavioural rules to verify", write one case per rule that DIRECTLY verifies it (e.g. a rule "returns undefined when candidates is empty" → invoke with an empty list, assert the result is undefined). Name each such case EXACTLY \`rule:<N> — <short label>\` where <N> is the rule's number. Trace the source to compute the assert: if the source obeys the rule the case will pass and be kept (enforcing the rule); if it does not, the case will fail self-validation and be dropped (surfacing that the code violates its own declared rule). Write the case anyway — a dropped rule case is a signal, not a mistake.`;

export function buildProbeUserPrompt(node: OntologyNode, sourceText: string, behaviouralRules: readonly string[] = []): string {
  const provides = (node.context?.provides ?? [])
    .map((p) => {
      if (typeof p === "string") return p;
      const sig = (p as { signature?: string }).signature;
      return sig ? `${p.key} :: ${sig}` : p.key;
    })
    .join("\n");
  const sourceRel = node.outputs?.files?.[0] ?? "(unknown)";
  const rulesSection = behaviouralRules.length
    ? [
        "",
        "Behavioural rules to verify (one `rule:<N> — ...` case each):",
        ...behaviouralRules.map((r, i) => `  ${i + 1}. ${r}`),
      ]
    : [];
  return [
    `Source module: ${sourceRel}`,
    `Node intent: ${node.prompt?.raw ?? "(none)"}`,
    "",
    "Declared exports (contract):",
    provides || "(none declared)",
    ...rulesSection,
    "",
    "Source code:",
    "```typescript",
    sourceText,
    "```",
    "",
    "Write the fixture module now. Output only the TypeScript module.",
  ].join("\n");
}

// Map self-validated cases back to the behavioural rules they target, via the
// `rule:<N>` name convention. A rule is "enforced" when a kept case names it,
// "violated_or_unassertable" when a case named it but was dropped (the source
// failed it), or "uncovered" when no case targeted it.
export type RuleCoverageStatus = "enforced" | "violated_or_unassertable" | "uncovered";

export function ruleCoverage(
  behaviouralRules: readonly string[],
  caseResults: readonly CaseValidation[],
): { ruleIndex: number; rule: string; status: RuleCoverageStatus }[] {
  return behaviouralRules.map((rule, i) => {
    const n = i + 1;
    const tagged = caseResults.filter((c) => new RegExp(`^rule:\\s*${n}\\b`).test(c.name));
    let status: RuleCoverageStatus = "uncovered";
    if (tagged.some((c) => c.kept)) status = "enforced";
    else if (tagged.length > 0) status = "violated_or_unassertable";
    return { ruleIndex: n, rule, status };
  });
}

// Strip markdown fences and any leading prose, returning the fixture module
// source. Tolerates a ```ts / ```typescript fence and a leading explanation.
export function extractFixtureSource(llmText: string): string {
  let text = llmText.trim();
  const fence = text.match(/```(?:ts|typescript)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  // If the model emitted leading prose, cut to the first import/`export const cases`.
  const importIdx = text.indexOf("import type { BehaviorCase }");
  const exportIdx = text.indexOf("export const cases");
  const start = importIdx >= 0 ? importIdx : exportIdx;
  if (start > 0) text = text.slice(start);
  return text.trim();
}

export interface CaseValidation {
  index: number;
  name: string;
  kept: boolean;
  outcome: string;
}

export interface ProbeValidationResult {
  totalCases: number;
  kept: number[];
  caseResults: CaseValidation[];
  error?: string;
}

// Self-validate a candidate fixture by running each case against the source
// twice (source-vs-source). A case is kept iff it cleanly matches: it loads,
// runs without throwing/timeout, and its assert holds on the real source.
export async function selfValidateFixture(
  nodeId: string,
  sourcePath: string,
  candidateFixturePath: string,
  fixturesDir: string,
): Promise<ProbeValidationResult> {
  const loaded = await loadFixture(fixturesDir, nodeId).catch((e: unknown) => {
    throw new Error(`candidate fixture failed to load: ${e instanceof Error ? e.message : String(e)}`);
  });
  if (!loaded) {
    return { totalCases: 0, kept: [], caseResults: [], error: "candidate fixture resolved to no cases" };
  }
  const allCases = loaded.fixture.cases;
  const caseResults: CaseValidation[] = [];
  const kept: number[] = [];
  for (let i = 0; i < allCases.length; i++) {
    const c = allCases[i];
    let outcome = "errored";
    try {
      // Run this single case with source as BOTH sides. A correct,
      // deterministic case that asserts true on the source yields "match".
      const res = await runBehaviorCheck({
        nodeId,
        sourcePath,
        regenPath: sourcePath,
        fixture: { cases: [c] },
      });
      outcome = res.cases?.[0]?.outcome ?? res.verdict;
    } catch (e: unknown) {
      outcome = `threw: ${e instanceof Error ? e.message : String(e)}`;
    }
    const keep = outcome === "match";
    if (keep) kept.push(i);
    caseResults.push({ index: i, name: c.name, kept: keep, outcome });
  }
  return { totalCases: allCases.length, kept, caseResults };
}

// Render the final fixture: keep the candidate module verbatim but rename its
// `export const cases` to a private array and re-export only the validated
// indices. Closures can't be re-serialized, so we filter at load time.
export function renderValidatedFixture(
  candidateSource: string,
  nodeId: string,
  sourceRel: string,
  keptIndices: number[],
  model: string,
): string {
  const renamed = candidateSource.replace(
    /export\s+const\s+cases/,
    "const __generatedCases",
  );
  const keepSet = `new Set([${keptIndices.join(", ")}])`;
  const header = [
    `// GENERATED by \`onto probe ${nodeId}\` (model: ${model}). Do not hand-edit;`,
    `// re-run probe to regenerate. ${keptIndices.length} self-validated case(s)`,
    `// (each matched the source ${sourceRel} under the behaviour-checker).`,
    "",
  ].join("\n");
  const footer = [
    "",
    `// Only the cases that self-validated against the source are exported.`,
    `export const cases = __generatedCases.filter((_, i) => ${keepSet}.has(i));`,
    "",
  ].join("\n");
  return `${header}${renamed}${footer}`;
}

export function fixturePathFor(nodeId: string, fixturesDir: string = FIXTURES_DIR): string {
  return path.join(fixturesDir, `${nodeId}.fixture.ts`);
}

// A fixture is "generated" (safe to overwrite) if it carries our header
// marker. Hand-written fixtures lack it and are protected without --force.
export function isGeneratedFixture(fixturePath: string): boolean {
  if (!fs.existsSync(fixturePath)) return false;
  const head = fs.readFileSync(fixturePath, "utf-8").slice(0, 200);
  return head.includes("GENERATED by `onto probe");
}
