import { assembleContext } from "../../../forward/context/assembler.js";
import { dispatchLlmRequest } from "../../../runtime/llm/dispatcher.js";
import { buildFragment } from "../../../forward/context/presheaf.js";
import { glueFragments } from "../../../forward/context/gluing.js";
import { validateIntent, type IntentValidationResult } from "../../../forward/context/intent-validator.js";
import type { LlmTask, LlmProvider } from "../../../runtime/llm/types.js";
import { hashPrompt, hashContext } from "../../../kernel/core/integrity/hash.js";
import { createPersistedRun, computeRunId, loadPersistedRun } from "../../../kernel/core/runs/persist.js";
import {
  AbstractionLevelSchema,
  NodeKindSchema,
  type PersistedRunInput,
  type PersistedRunModel,
  type OntologyEdge,
  type Proposal,
} from "../../../kernel/schemas/ontology.js";
import { EdgeTypeSchema } from "../../../kernel/schemas/ontology.js";
import { buildProposalFromRun } from "./prompt.js";

export interface RunContextOptions {
  provider?: string;
  task?: string;
  branch?: string;
  time?: string;
  mode?: string;
  json?: boolean;
  validate?: boolean;
  model?: string;
  ollamaHost?: string;
  persist?: boolean;
  includeEdges?: boolean;
  edgeTypes?: string;
  // O2 (CONTEXT_GLUING_REGIMES.md): when set, the validation gluing step treats
  // two distinct providers of the same key as compatible (glued) iff they carry
  // an identical syntactic signature (from O1), instead of always conflicting.
  // Opt-in; default keeps provider-uniqueness. This is O2's first real consumer
  // — exercised by static-ingest nodes, which carry `provides` + signatures.
  identifyEqualProviders?: boolean;
  // --as-proposal turns the model's response into a typed candidate node mutation.
  // Auto-implies --persist. Default proposal parent is the focal node id (the one
  // the context was assembled against), since a child of the focal node is the
  // common case for "expand this idea".
  asProposal?: boolean;
  proposalLevel?: string;
  proposalKind?: string;
  proposalParent?: string;
  proposalLabel?: string;
  proposalRationale?: string;
}

export async function runContextCommand(id: string, options: RunContextOptions) {
  const provider = (options.provider || "mock") as string;
  const task = (options.task || "semantic_parse") as LlmTask;
  const mode = (options.mode || "strict") as "strict" | "compare" | "propose";
  const branch = options.branch;
  const time = options.time ? parseInt(options.time, 10) : undefined;
  const isJson = !!options.json;
  const isValidate = !!options.validate;
  const isAsProposal = !!options.asProposal;
  // --as-proposal forces persistence because the proposal pins itself to the runId.
  const isPersist = !!options.persist || isAsProposal;

  if (provider !== "mock" && provider !== "ollama") {
    throw new Error(`Unsupported LLM provider: ${provider}`);
  }

  // Validate --as-proposal flags up front so a malformed level/kind aborts
  // before any LLM dispatch.
  let proposalLevel: ReturnType<typeof AbstractionLevelSchema.parse> | null = null;
  let proposalKind: ReturnType<typeof NodeKindSchema.parse> | null = null;
  if (isAsProposal) {
    if (!options.proposalLevel) {
      console.error(`✖ --as-proposal requires --proposal-level`);
      process.exit(1);
    }
    if (!options.proposalKind) {
      console.error(`✖ --as-proposal requires --proposal-kind`);
      process.exit(1);
    }
    const lvl = AbstractionLevelSchema.safeParse(options.proposalLevel);
    if (!lvl.success) {
      console.error(`✖ Invalid --proposal-level: "${options.proposalLevel}". Expected one of: ${AbstractionLevelSchema.options.join(", ")}`);
      process.exit(1);
    }
    proposalLevel = lvl.data;
    const knd = NodeKindSchema.safeParse(options.proposalKind);
    if (!knd.success) {
      console.error(`✖ Invalid --proposal-kind: "${options.proposalKind}". Expected one of: ${NodeKindSchema.options.join(", ")}`);
      process.exit(1);
    }
    proposalKind = knd.data;
  }

  // Parse and validate --edge-types up front so a typo fails before any LLM dispatch.
  // The kernel rejects unknown edge types with the same brutalist message that
  // `context assemble` uses, keeping the contract uniform across both commands.
  const isIncludeEdges = !!options.includeEdges;
  let parsedEdgeTypes: OntologyEdge["type"][] | null = null;
  if (options.edgeTypes) {
    const list = options.edgeTypes.split(",").map(s => s.trim()).filter(Boolean);
    for (const t of list) {
      const r = EdgeTypeSchema.safeParse(t);
      if (!r.success) {
        console.error(`✖ Invalid edge type: ${t}`);
        process.exit(1);
      }
    }
    parsedEdgeTypes = list as OntologyEdge["type"][];
  }

  const contextOutput = assembleContext({
    targetNodeId: id,
    branch,
    time,
    mode,
    includeEdges: isIncludeEdges,
    edgeTypes: parsedEdgeTypes ?? undefined,
  });

  // Build deterministic envelopes up front so we can detect cache hits before dispatch
  // when --persist is on. Edge configuration is part of the cache key: a run with
  // --include-edges produces a different id than one without, even on the same node.
  const runInput: PersistedRunInput = {
    promptHash: hashPrompt(contextOutput.prompt),
    contextHash: hashContext(contextOutput),
    targetNodeId: id,
    branch: contextOutput.branch,
    time: time ?? null,
    task: task as string,
    includeEdges: isIncludeEdges,
    edgeTypes: parsedEdgeTypes,
  };
  const runModel: PersistedRunModel = {
    provider: provider as LlmProvider,
    model: options.model ?? (provider === "mock" ? "mock_default" : "unknown"),
    host: options.ollamaHost ?? null,
  };

  if (isPersist) {
    const expectedId = computeRunId(runInput, runModel);
    const cached = loadPersistedRun(expectedId);
    if (cached) {
      // When --as-proposal is on we still create a fresh proposal even on cache
      // hit. The cache is on the run; the proposal is the user's deliberate
      // staging act, which deserves a new record per invocation.
      let proposalInfo: { id: string; status: string } | undefined;
      if (isAsProposal) {
        const proposal = buildProposalFromRun({
          runId: cached.id,
          promptHash: cached.input.promptHash,
          contextHash: cached.input.contextHash,
          provider: cached.model.provider,
          model: cached.model.model,
          responseText: cached.output.text,
          proposalLevel: proposalLevel!,
          proposalKind: proposalKind!,
          proposalLabel: options.proposalLabel,
          proposalRationale: options.proposalRationale,
          // Default proposal parent = focal node id (the one we ran context against).
          proposalParent: options.proposalParent ?? id,
          validationSnapshot: cached.validation ?? null,
        });
        proposalInfo = { id: proposal.id, status: proposal.status };
      }
      emitRunContextOutput({
        contextOutput,
        responseText: cached.output.text,
        responseModel: cached.model.model,
        responseProvider: cached.model.provider,
        task,
        provider,
        validation: cached.validation ?? undefined,
        isJson,
        isValidate,
        persisted: { runId: cached.id, cached: true },
        proposal: proposalInfo,
      });
      return;
    }
  }

  // Track wall-clock duration locally instead of monkey-patching the LlmResponse.
  // The adapter's own `usage.evalDurationMs` (when available) reports model-side time;
  // this number captures the full dispatch round-trip, which is what the run record stores.
  let durationMs = 0;
  let llmResponse: Awaited<ReturnType<typeof dispatchLlmRequest>>;
  try {
    const start = Date.now();
    llmResponse = await dispatchLlmRequest(
      {
        task,
        prompt: contextOutput.prompt,
        json: isJson,
      },
      {
        provider: provider as LlmProvider,
        defaultModel: options.model,
        ollamaHost: options.ollamaHost,
      }
    );
    durationMs = Date.now() - start;
  } catch (err: unknown) {
    if (provider === "ollama") {
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (isJson) {
        console.log(JSON.stringify({ ok: false, provider: "ollama", error: errorMessage }, null, 2));
      } else {
        console.error(`✖ Ollama unavailable: ${errorMessage}`);
      }
      process.exit(1);
    } else {
      throw err;
    }
  }

  let validationResult: IntentValidationResult | undefined;
  if (isValidate) {
    const fragments = contextOutput.nodes.map(buildFragment);
    const glued = glueFragments(fragments, {
      onDuplicateProvider: options.identifyEqualProviders
        ? "identify-if-equal"
        : "conflict",
    });
    validationResult = validateIntent({
      assembled: contextOutput,
      glued,
      candidate: {
        text: llmResponse.text,
        provider: llmResponse.provider,
        model: llmResponse.model,
      },
    });
  }

  let persistedInfo: { runId: string; cached: boolean } | undefined;
  if (isPersist) {
    const finalModel: PersistedRunModel = { ...runModel, model: llmResponse.model };
    const { run, cached } = createPersistedRun({
      kind: "context",
      input: runInput,
      model: finalModel,
      output: { text: llmResponse.text, parsed: null },
      validation: validationResult
        ? {
            ok: validationResult.ok,
            score: validationResult.score,
            violations: validationResult.violations,
            warnings: validationResult.warnings,
          }
        : null,
      durationMs,
    });
    persistedInfo = { runId: run.id, cached };
  }

  let proposalInfo: { id: string; status: string } | undefined;
  if (isAsProposal && persistedInfo) {
    const validationSnapshot = validationResult
      ? {
          ok: validationResult.ok,
          score: validationResult.score,
          violations: validationResult.violations,
          warnings: validationResult.warnings,
        }
      : null;
    const proposal = buildProposalFromRun({
      runId: persistedInfo.runId,
      promptHash: runInput.promptHash,
      contextHash: runInput.contextHash,
      provider: llmResponse.provider,
      model: llmResponse.model,
      responseText: llmResponse.text,
      proposalLevel: proposalLevel!,
      proposalKind: proposalKind!,
      proposalLabel: options.proposalLabel,
      proposalRationale: options.proposalRationale,
      // Default proposal parent = focal node id.
      proposalParent: options.proposalParent ?? id,
      validationSnapshot,
    });
    proposalInfo = { id: proposal.id, status: proposal.status };
  }

  emitRunContextOutput({
    contextOutput,
    responseText: llmResponse.text,
    responseModel: llmResponse.model,
    responseProvider: llmResponse.provider,
    task,
    provider,
    validation: validationResult,
    isJson,
    isValidate,
    persisted: persistedInfo,
    proposal: proposalInfo,
  });
}

interface EmitRunContextOutputOptions {
  contextOutput: ReturnType<typeof assembleContext>;
  responseText: string;
  responseModel: string;
  responseProvider: LlmProvider;
  task: LlmTask;
  provider: string;
  validation: IntentValidationResult | { ok: boolean; score: number; violations: string[]; warnings: string[] } | undefined;
  isJson: boolean;
  isValidate: boolean;
  persisted: { runId: string; cached: boolean } | undefined;
  proposal: { id: string; status: string } | undefined;
}

function emitRunContextOutput(opts: EmitRunContextOutputOptions): void {
  const {
    contextOutput,
    responseText,
    responseModel,
    responseProvider,
    task,
    provider,
    validation,
    isJson,
    isValidate,
    persisted,
    proposal,
  } = opts;

  if (isJson) {
    const output: Record<string, unknown> = {
      context: contextOutput,
      response: {
        text: responseText,
        model: responseModel,
        provider: responseProvider,
      },
    };

    if (isValidate && validation) {
      output.validation = {
        ok: validation.ok,
        score: validation.score,
        violations: validation.violations,
        warnings: validation.warnings,
      };
    }

    if (persisted) {
      output.persisted = { runId: persisted.runId, cached: persisted.cached };
    }
    if (proposal) {
      output.proposal = { id: proposal.id, status: proposal.status };
    }

    console.log(JSON.stringify(output, null, 2));
    return;
  }

  let truncatedText = responseText;
  if (truncatedText.length > 500) {
    truncatedText = truncatedText.substring(0, 500) + "...";
  }

  console.log(`=== ONTOLOGY RUN CONTEXT ===`);
  console.log(`Target:    ${contextOutput.targetNodeId}`);
  console.log(`Task:      ${task}`);
  console.log(`Provider:  ${provider}`);
  console.log(`Model:     ${responseModel}`);
  if (persisted) {
    const tag = persisted.cached ? " (cached)" : "";
    console.log(`Run:       ${persisted.runId}${tag}`);
  }
  if (proposal) {
    console.log(`Proposal:  ${proposal.id} (${proposal.status})`);
  }
  console.log(``);
  console.log(`Context:`);
  console.log(`  Mode:    ${contextOutput.mode}`);
  console.log(`  Branch:  ${contextOutput.branch}`);
  console.log(`  Nodes:   ${contextOutput.nodes.length}`);
  if (contextOutput.edgeContext) {
    console.log(`  Edges:   ${contextOutput.edgeContext.edges.length}`);
    console.log(`  Edge nodes: ${contextOutput.edgeContext.nodeIds.length}`);
  }
  console.log(``);
  console.log(`Response:\n${truncatedText}`);

  if (isValidate && validation) {
    console.log(``);
    console.log(`Validation:`);
    console.log(`  OK:       ${validation.ok}`);
    console.log(`  Score:    ${validation.score}`);
    console.log(`  Warnings: ${validation.warnings.length}`);
    console.log(`  Violations: ${validation.violations.length}`);
  }
}
