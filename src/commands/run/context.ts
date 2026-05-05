import { assembleContext } from "../../runtime/context/assembler.js";
import { dispatchLlmRequest } from "../../runtime/llm/dispatcher.js";
import { buildFragment } from "../../runtime/context/presheaf.js";
import { glueFragments } from "../../runtime/context/gluing.js";
import { validateIntent, type IntentValidationResult } from "../../runtime/context/intent-validator.js";
import type { LlmTask, LlmProvider } from "../../runtime/llm/types.js";
import { hashPrompt, hashContext } from "../../core/integrity/hash.js";
import { createPersistedRun, computeRunId, loadPersistedRun } from "../../core/runs/persist.js";
import type { PersistedRunInput, PersistedRunModel, OntologyEdge } from "../../schemas/ontology.js";
import { EdgeTypeSchema } from "../../schemas/ontology.js";

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
}

export async function runContextCommand(id: string, options: RunContextOptions) {
  const provider = (options.provider || "mock") as string;
  const task = (options.task || "semantic_parse") as LlmTask;
  const mode = (options.mode || "strict") as "strict" | "compare" | "propose";
  const branch = options.branch;
  const time = options.time ? parseInt(options.time, 10) : undefined;
  const isJson = !!options.json;
  const isValidate = !!options.validate;
  const isPersist = !!options.persist;

  if (provider !== "mock" && provider !== "ollama") {
    throw new Error(`Unsupported LLM provider: ${provider}`);
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
    const glued = glueFragments(fragments);
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
