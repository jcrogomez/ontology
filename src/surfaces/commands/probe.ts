import * as fs from "node:fs";
import * as path from "node:path";
import { loadNodeById } from "../../kernel/core/project/load.js";
import { dispatchLlmRequest } from "../../runtime/llm/dispatcher.js";
import type { LlmProvider } from "../../runtime/llm/types.js";
import {
  PROBE_SYSTEM_PROMPT,
  buildProbeUserPrompt,
  extractFixtureSource,
  selfValidateFixture,
  renderValidatedFixture,
  fixturePathFor,
  isGeneratedFixture,
  ruleCoverage,
  type RuleCoverageStatus,
} from "../../inverse/probe-generator.js";
import { classifyRule } from "../../inverse/rule-checker.js";

// `onto probe <nodeId>` — generate a SELF-VALIDATED behavioural fixture for a
// node, the safety net that gives `onto regenerate --write` teeth. An LLM
// proposes characterization cases from the source + contract; each is then run
// against the real source (source-vs-source) and only the cases that cleanly
// match are persisted. The fixture is therefore a set of TRUE statements about
// how the code behaves today — so when `regenerate --behavior-check` later runs
// it against a regeneration, any behavioural divergence (including a
// structurally-identical off-by-one) fails and blocks the write.
//
// Run under tsx (`npm run dev -- probe ...`): the behaviour-checker loads
// modules via dynamic import, which needs the TS-aware host for `.ts` source.

export interface ProbeCommandOptions {
  provider?: string;
  model?: string;
  ollamaHost?: string;
  force?: boolean;
  fixturesDir?: string;
  maxTokens?: number;
  json?: boolean;
}

interface ProbeResult {
  ok: boolean;
  nodeId: string;
  sourceFile?: string;
  fixturePath?: string;
  generatedCases?: number;
  keptCases?: number;
  dropped?: { name: string; outcome: string }[];
  ruleCoverage?: { ruleIndex: number; rule: string; status: RuleCoverageStatus }[];
  written: boolean;
  failure?: string;
}

function emit(r: ProbeResult, json?: boolean): void {
  if (json) {
    console.log(JSON.stringify(r, null, 2));
    return;
  }
  if (!r.ok) {
    console.error(`✖ probe ${r.nodeId}: ${r.failure}`);
    return;
  }
  console.log(`◆ probe ${r.nodeId}  (${r.sourceFile})`);
  console.log(`  generated ${r.generatedCases} case(s), ${r.keptCases} self-validated against source.`);
  for (const d of r.dropped ?? []) console.log(`    dropped: ${d.name} — ${d.outcome}`);
  if (r.ruleCoverage?.length) {
    const mark: Record<RuleCoverageStatus, string> = {
      enforced: "✓ enforced",
      violated_or_unassertable: "⚠ code may violate this rule (case dropped)",
      uncovered: "· uncovered",
    };
    console.log(`  behavioural-rule coverage:`);
    for (const rc of r.ruleCoverage) console.log(`    ${mark[rc.status]}  ${rc.rule.slice(0, 78)}`);
  }
  if (r.written) {
    console.log(`  ✔ wrote ${r.fixturePath}`);
    console.log(`    now \`onto regenerate ${r.nodeId} --behavior-check --write\` is gated on behaviour.`);
  } else {
    console.log(`  ✖ nothing written: ${r.failure}`);
  }
}

export async function probeCommand(nodeId: string, options: ProbeCommandOptions): Promise<void> {
  const cwd = process.cwd();
  const fixturesDir = options.fixturesDir ?? path.join(cwd, "tests/behavior-fixtures");

  // 1. Validate provider.
  let provider: LlmProvider | undefined;
  if (options.provider !== undefined) {
    const allowed = ["mock", "ollama", "anthropic", "gemini"];
    if (!allowed.includes(options.provider)) {
      emit({ ok: false, nodeId, written: false, failure: `unsupported provider: ${options.provider}` }, options.json);
      process.exit(1);
    }
    provider = options.provider as LlmProvider;
  }

  // 2. Load node + source.
  const node = loadNodeById(nodeId, cwd);
  if (!node) {
    emit({ ok: false, nodeId, written: false, failure: `node not found: ${nodeId}` }, options.json);
    process.exit(1);
    return;
  }
  const sourceRel = node.outputs?.files?.[0];
  if (!sourceRel) {
    emit({ ok: false, nodeId, written: false, failure: "node has no outputs.files[0] — nothing to probe" }, options.json);
    process.exit(1);
    return;
  }
  const sourcePath = path.isAbsolute(sourceRel) ? sourceRel : path.join(cwd, sourceRel);
  if (!fs.existsSync(sourcePath)) {
    emit({ ok: false, nodeId, sourceFile: sourceRel, written: false, failure: `source not found on disk: ${sourceRel}` }, options.json);
    process.exit(1);
    return;
  }

  // 3. Governance: protect a hand-written fixture.
  const finalPath = fixturePathFor(nodeId, fixturesDir);
  if (fs.existsSync(finalPath) && !isGeneratedFixture(finalPath) && !options.force) {
    emit(
      { ok: false, nodeId, sourceFile: sourceRel, fixturePath: finalPath, written: false, failure: "a hand-written fixture exists here — pass --force to replace it" },
      options.json,
    );
    process.exit(1);
    return;
  }

  // 4. Dispatch: LLM proposes the fixture, with the node's behavioural rules as
  //    explicit verification targets (the executable enforcement layer — each
  //    becomes a self-validated case the regenerate behaviour-gate enforces).
  const sourceText = fs.readFileSync(sourcePath, "utf-8");
  const behaviouralRules = (node.rules ?? []).filter((r) => classifyRule(r).ruleClass === "behavioural");
  let candidateRaw: string;
  try {
    const response = await dispatchLlmRequest(
      {
        task: "test_generate",
        model: options.model,
        system: PROBE_SYSTEM_PROMPT,
        prompt: buildProbeUserPrompt(node, sourceText, behaviouralRules),
        temperature: 0.2,
        maxTokens: options.maxTokens,
        metadata: { command: "probe", nodeId },
      },
      { provider, ollamaHost: options.ollamaHost, defaultModel: options.model },
    );
    candidateRaw = response.text ?? "";
  } catch (err: unknown) {
    emit({ ok: false, nodeId, sourceFile: sourceRel, written: false, failure: `LLM dispatch failed: ${err instanceof Error ? err.message : String(err)}` }, options.json);
    process.exit(1);
    return;
  }

  const candidateTs = extractFixtureSource(candidateRaw);
  if (!candidateTs.includes("export const cases")) {
    emit({ ok: false, nodeId, sourceFile: sourceRel, written: false, failure: "model output did not contain an `export const cases` fixture" }, options.json);
    process.exit(1);
    return;
  }

  // 5. Self-validate. probe runs under tsx (like --behavior-check), so write
  //    the candidate as a `.fixture.ts` and let the TS-aware loader import it
  //    verbatim — type annotations and the `import type` line included.
  const candDir = path.join(cwd, ".ontology/probe-candidates");
  fs.mkdirSync(candDir, { recursive: true });
  const candPath = path.join(candDir, `${nodeId}.fixture.ts`);
  fs.writeFileSync(candPath, candidateTs);

  let validation;
  try {
    validation = await selfValidateFixture(nodeId, sourcePath, candPath, candDir);
  } catch (err: unknown) {
    emit({ ok: false, nodeId, sourceFile: sourceRel, written: false, failure: `candidate failed to load/validate: ${err instanceof Error ? err.message : String(err)}` }, options.json);
    process.exit(1);
    return;
  }

  const dropped = validation.caseResults.filter((c) => !c.kept).map((c) => ({ name: c.name, outcome: c.outcome }));
  const coverage = behaviouralRules.length ? ruleCoverage(behaviouralRules, validation.caseResults) : undefined;
  const base: ProbeResult = {
    ok: true,
    nodeId,
    sourceFile: sourceRel,
    fixturePath: finalPath,
    generatedCases: validation.totalCases,
    keptCases: validation.kept.length,
    dropped,
    ...(coverage ? { ruleCoverage: coverage } : {}),
    written: false,
  };

  if (validation.kept.length === 0) {
    emit({ ...base, failure: "no generated case self-validated against the source" }, options.json);
    process.exit(1);
    return;
  }

  // 6. Persist the validated fixture.
  const model = options.model ?? provider ?? "unknown";
  const finalTs = renderValidatedFixture(candidateTs, nodeId, sourceRel, validation.kept, String(model));
  fs.mkdirSync(path.dirname(finalPath), { recursive: true });
  fs.writeFileSync(finalPath, finalTs);

  emit({ ...base, written: true }, options.json);
}
