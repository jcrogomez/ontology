import { dispatchLlmRequest } from "../../../runtime/llm/dispatcher.js";
import type { LlmTask, LlmProvider } from "../../../runtime/llm/types.js";
import { hashPrompt } from "../../../kernel/core/integrity/hash.js";
import { createPersistedRun, computeRunId, loadPersistedRun } from "../../../kernel/core/runs/persist.js";
import { createProposal } from "../../../kernel/core/proposals/persist.js";
import { loadNodeById, loadState } from "../../../kernel/core/project/load.js";
import {
  AbstractionLevelSchema,
  NodeKindSchema,
  type PersistedRunInput,
  type PersistedRunModel,
  type Proposal,
} from "../../../kernel/schemas/ontology.js";
import { errorMessage } from "../../../kernel/core/errors.js";

export interface RunPromptOptions {
  task?: string;
  prompt?: string;
  provider?: string;
  model?: string;
  ollamaHost?: string;
  json?: boolean;
  persist?: boolean;
  // --as-proposal turns the model's response into a typed candidate node mutation.
  // Auto-implies --persist because the proposal needs a runId to back-reference.
  asProposal?: boolean;
  proposalLevel?: string;
  proposalKind?: string;
  proposalParent?: string;
  proposalLabel?: string;
  proposalRationale?: string;
}

export async function runPromptCommand(options: RunPromptOptions): Promise<void> {
  const provider = (options.provider ?? "mock") as LlmProvider;

  if (provider !== "mock" && provider !== "ollama") {
    // Fails clearly as per requirements
    throw new Error(`Unsupported LLM provider: ${provider}`);
  }

  const task = options.task as LlmTask;
  const promptText = options.prompt!;
  const isAsProposal = !!options.asProposal;
  // --as-proposal forces persistence so the proposal can pin itself to the runId.
  const isPersist = !!options.persist || isAsProposal;

  // Validate proposal flags up front so we fail before any LLM dispatch.
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

  // Build the deterministic input/model envelopes up front so we can detect cache hits
  // before paying for an LLM call when --persist is set.
  const runInput: PersistedRunInput = {
    promptHash: hashPrompt(promptText),
    contextHash: null,
    targetNodeId: null,
    branch: null,
    time: null,
    task: task as string,
    includeEdges: false,
    edgeTypes: null,
  };
  const runModel: PersistedRunModel = {
    provider,
    model: options.model ?? (provider === "mock" ? "mock_default" : "unknown"),
    host: options.ollamaHost ?? null,
  };

  if (isPersist) {
    const expectedId = computeRunId(runInput, runModel);
    const cached = loadPersistedRun(expectedId);
    if (cached) {
      let proposalInfo: { id: string; status: string } | undefined;
      if (isAsProposal) {
        // Each --as-proposal invocation creates a NEW proposal even when the run
        // is cached — the cache is on the run, not on the user's deliberate
        // intention to stage a candidate mutation.
        const proposal = buildProposalFromRun({
          runId: cached.id,
          promptHash: cached.input.promptHash,
          contextHash: null,
          provider: cached.model.provider,
          model: cached.model.model,
          responseText: cached.output.text,
          proposalLevel: proposalLevel!,
          proposalKind: proposalKind!,
          proposalLabel: options.proposalLabel,
          proposalRationale: options.proposalRationale,
          proposalParent: options.proposalParent,
          validationSnapshot: null,
        });
        proposalInfo = { id: proposal.id, status: proposal.status };
      }
      emitRunPromptOutput(task, cached.model.provider, cached.model.model, cached.output.text, options.json, {
        persisted: true,
        runId: cached.id,
        cached: true,
      }, proposalInfo);
      return;
    }
  }

  try {
    const start = Date.now();
    const response = await dispatchLlmRequest(
      {
        task,
        prompt: promptText,
      },
      {
        provider,
        defaultModel: options.model,
        ollamaHost: options.ollamaHost
      }
    );
    const durationMs = Date.now() - start;

    let persistedInfo: { persisted: true; runId: string; cached: boolean } | undefined;
    if (isPersist) {
      // Update model.model to the actual model the adapter reports, so the persisted
      // record reflects what truly ran rather than the requested default.
      const finalModel: PersistedRunModel = { ...runModel, model: response.model };
      const finalInput: PersistedRunInput = runInput;
      const { run, cached } = createPersistedRun({
        kind: "prompt",
        input: finalInput,
        model: finalModel,
        output: { text: response.text, parsed: null },
        validation: null,
        durationMs,
      });
      persistedInfo = { persisted: true, runId: run.id, cached };
    }

    let proposalInfo: { id: string; status: string } | undefined;
    if (isAsProposal && persistedInfo) {
      const proposal = buildProposalFromRun({
        runId: persistedInfo.runId,
        promptHash: runInput.promptHash,
        contextHash: null,
        provider: response.provider,
        model: response.model,
        responseText: response.text,
        proposalLevel: proposalLevel!,
        proposalKind: proposalKind!,
        proposalLabel: options.proposalLabel,
        proposalRationale: options.proposalRationale,
        proposalParent: options.proposalParent,
        validationSnapshot: null,
      });
      proposalInfo = { id: proposal.id, status: proposal.status };
    }

    emitRunPromptOutput(task, response.provider, response.model, response.text, options.json, persistedInfo, proposalInfo);
  } catch (err: unknown) {
    if (provider === "ollama") {
      if (options.json) {
        console.log(
          JSON.stringify(
            {
              ok: false,
              provider: "ollama",
              error: errorMessage(err),
            },
            null,
            2
          )
        );
      } else {
        console.error(`✖ Ollama unavailable: ${errorMessage(err)}`);
      }
      process.exit(1);
    }
    // Let it bubble up if it's not an expected ollama error, or for mock
    throw err;
  }
}

interface BuildProposalArgs {
  runId: string;
  promptHash: string;
  contextHash: string | null;
  provider: LlmProvider;
  model: string;
  responseText: string;
  proposalLevel: ReturnType<typeof AbstractionLevelSchema.parse>;
  proposalKind: ReturnType<typeof NodeKindSchema.parse>;
  proposalLabel?: string;
  proposalRationale?: string;
  proposalParent?: string;
  validationSnapshot: { ok: boolean; score: number; violations: string[]; warnings: string[] } | null;
}

// Resolve parent + create the proposal. Shared by both the cache-hit and the
// fresh-dispatch branches of run prompt. run context has a sibling helper.
export function buildProposalFromRun(args: BuildProposalArgs): Proposal {
  const state = loadState();
  const parentNodeId = args.proposalParent ?? state.rootNodeId;
  const parentNode = loadNodeById(parentNodeId);
  if (!parentNode) {
    console.error(`✖ Parent node not found: ${parentNodeId}`);
    process.exit(1);
  }
  const { proposal } = createProposal({
    mutation: {
      kind: "node_create",
      payload: {
        level: args.proposalLevel,
        kind: args.proposalKind,
        prompt: args.responseText,
        label: args.proposalLabel ?? null,
        parentNodeId,
      },
      parentHash: parentNode.integrity.hash,
    },
    source: {
      runId: args.runId,
      contextHash: args.contextHash,
      promptHash: args.promptHash,
      provider: args.provider,
      model: args.model,
    },
    validation: args.validationSnapshot,
    provenance: {
      derivedFrom: [parentNodeId],
      rationale: args.proposalRationale ?? null,
    },
  });
  return proposal;
}

function emitRunPromptOutput(
  task: LlmTask,
  provider: LlmProvider,
  model: string,
  text: string,
  isJson: boolean | undefined,
  persisted?: { persisted: true; runId: string; cached: boolean },
  proposal?: { id: string; status: string }
) {
  if (isJson) {
    const jsonOutput: Record<string, unknown> = {
      response: {
        text,
        model,
        provider,
      },
    };
    if (persisted) {
      jsonOutput.persisted = { runId: persisted.runId, cached: persisted.cached };
    }
    if (proposal) {
      jsonOutput.proposal = { id: proposal.id, status: proposal.status };
    }
    console.log(JSON.stringify(jsonOutput, null, 2));
    return;
  }

  console.log("=== ONTOLOGY RUN PROMPT ===");
  console.log(`Task:      ${task}`);
  console.log(`Provider:  ${provider}`);
  console.log(`Model:     ${model}`);
  if (persisted) {
    const tag = persisted.cached ? " (cached)" : "";
    console.log(`Run:       ${persisted.runId}${tag}`);
  }
  if (proposal) {
    console.log(`Proposal:  ${proposal.id} (${proposal.status})`);
  }
  console.log("");
  console.log("Response:");
  console.log(text);
}
