import { randomBytes } from "node:crypto";
import type { OntologyNode, OntologyEvent, OntologyModel, PersistedRunInput, PersistedRunModel } from "../../schemas/ontology.js";
import { OntologyEventSchema } from "../../schemas/ontology.js";
import { dispatchLlmRequest } from "../llm/dispatcher.js";
import { resolveNodeModel } from "../llm/resolve-node-model.js";
import type { LlmProvider, LlmTask } from "../llm/types.js";
import { hashPrompt } from "../../core/integrity/hash.js";
import { createPersistedRun, computeRunId, loadPersistedRun } from "../../core/runs/persist.js";
import { writeArtifact, type WriteArtifactResult } from "./artifact-writer.js";
import { extractCodeFence } from "./post/extract-code-fence.js";
import { validateLanguage } from "./post/validate-language.js";
import { runtimeCheck } from "./post/runtime-check.js";
import {
  buildUpstreamSystemPrompt,
  hashUpstreamContext,
  type UpstreamContextItem,
} from "./upstream-context.js";
import { getOntologyPaths } from "../../core/project/paths.js";
import { appendJsonl } from "../../core/fs/json.js";
import { readState, writeState } from "../../core/state/state-store.js";

// Single-node compile primitive.
//
// Given a focal OntologyNode and a model provider, this helper:
//   1. dispatches the node's prompt against the model (always task=code_sketch
//      so the mock provider acts as the identity functor — see mock.ts);
//   2. persists the run as a content-addressed PersistedRun (so every
//      compilation has full provenance back to a runId);
//   3. writes the response as an artifact under .ontology/artifacts/generated/
//      with the file extension derived from the node's manifestation;
//   4. appends a compilation_run event to events.jsonl carrying the nodeId,
//      runId, artifact relative path, and the bytes written.
//
// This function compiles ONE node. The plan-runner walks the topological plan
// and calls this helper for each step.
//
// Provenance contract: the resulting compilation_run event ties together
// the node id, the run id (which itself ties to the assembled-prompt hash),
// and the on-disk artifact. An auditor can re-trace: artifact → event →
// run → prompt hash → node body. Nothing slips through.

export interface CompileNodeOptions {
  node: OntologyNode;
  // CLI-level override. When set, every node compiles through this provider
  // regardless of its `model.ref`. When undefined, the node's `model.ref`
  // is resolved against the registry (passed in `registry`). The schema
  // defaults `model.ref` to "mock_default", so legacy chains with no
  // explicit per-node selection still flow through mock.
  provider?: LlmProvider;
  // CLI-level model override. Only meaningful when `provider` is also set;
  // ignored when resolving via per-node ref (the registry entry's `name`
  // is used instead).
  model?: string;
  ollamaHost?: string;
  cwd?: string;
  // Models registry. Required when `provider` is undefined (per-node routing
  // path). The plan-runner loads it once and threads it to every step.
  registry?: { models: OntologyModel[] };
  // When true, after parse-validation the compiled artifact is **executed**
  // in a subprocess with a timeout (default 5s, max 60s). Non-zero exit or
  // timeout produces a `runtime_failed` outcome. Off by default because
  // running arbitrary LLM-generated code is a non-trivial operational
  // decision. Surfaces only via the CLI flag `--runtime-check` today.
  runtimeCheck?: boolean;
  // Custom runtime check timeout. Ignored when runtimeCheck is false/undefined.
  runtimeCheckTimeoutMs?: number;
  // Direct refinement parents' compiled outputs, in the order they were
  // produced by the plan-runner (deterministic — sorted by nodeId). When
  // present, they are concatenated into the dispatcher's `system` prompt
  // and hashed into `PersistedRunInput.contextHash` so the run id reflects
  // both the focal prompt and the lineage that informed it.
  //
  // The mock adapter ignores `system` for `code_sketch`, so threading
  // upstreams here does NOT change the mock's artifact bytes — only the
  // run id changes. That is the correct behavior for the identity functor:
  // structurally distinct runs get distinct ids, even when the projection
  // to disk is the same.
  upstream?: UpstreamContextItem[];
}

export type CompileNodeResult =
  | {
      ok: true;
      runId: string;
      cached: boolean;
      artifact: WriteArtifactResult;
      event: OntologyEvent;
      response: { text: string; provider: LlmProvider; model: string };
    }
  | { ok: false; reason: "dispatch_failed" | "persist_failed" | "write_failed" | "validate_failed" | "runtime_failed" | "model_ref_unresolved"; message: string };

const COMPILE_TASK: LlmTask = "code_sketch";

export async function compileNode(options: CompileNodeOptions): Promise<CompileNodeResult> {
  const cwd = options.cwd ?? process.cwd();

  // Provider/model resolution. Two paths:
  //   (a) CLI override:    options.provider is set → use it for every node,
  //                        options.model is the override model name.
  //   (b) Per-node routing: options.provider is undefined → look up
  //                        node.model.ref in the registry; the registry
  //                        entry's (provider, name) is what we dispatch
  //                        with. options.model is ignored on this path.
  //
  // Path (a) preserves the original CLI semantics: `--provider ollama
  // --model llama3.2:3b` forces every step through that pair. Path (b)
  // is the new default — each node compiles with the model its author
  // chose, so abstract intentions can use mock while artifact leaves
  // use a coder-tuned LLM.
  let provider: LlmProvider;
  let resolvedModel: string | undefined;
  if (options.provider) {
    provider = options.provider;
    resolvedModel = options.model;
  } else {
    if (!options.registry) {
      return {
        ok: false,
        reason: "model_ref_unresolved",
        message: "compileNode called without an explicit provider and without a registry; cannot resolve node.model.ref",
      };
    }
    const r = resolveNodeModel(options.node.model.ref, options.registry);
    if (!r.ok) {
      return { ok: false, reason: "model_ref_unresolved", message: r.message };
    }
    provider = r.resolved.provider;
    resolvedModel = r.resolved.model;
  }

  // The compile prompt is the node's raw prompt. The upstream refinement
  // parents' compiled outputs (passed in by the plan-runner) become the
  // dispatcher's `system` prompt, when present — that is the inductive form
  // of axiom 7 (each compile sees the lineage one hop up; transitivity is
  // preserved because each parent was already compiled with ITS parents in
  // system). Mock identity is preserved because the mock adapter ignores
  // `system` for code_sketch.
  const promptText = options.node.prompt.raw ?? "";
  const upstream = options.upstream ?? [];
  const systemPrompt = buildUpstreamSystemPrompt(upstream);
  const contextHash = hashUpstreamContext(upstream);

  // Build the deterministic run envelope. Including the focal node's id, its
  // branch, and the upstream contextHash in the input means two structurally
  // distinct compiles never collide on a run id — even when the focal prompt
  // is identical, a different lineage produces a different id.
  const runInput: PersistedRunInput = {
    promptHash: hashPrompt(promptText),
    contextHash,
    targetNodeId: options.node.id,
    branch: options.node.coordinates.branch,
    time: null,
    task: COMPILE_TASK as string,
    includeEdges: false,
    edgeTypes: null,
  };
  const runModel: PersistedRunModel = {
    provider,
    model: resolvedModel ?? (provider === "mock" ? "mock_default" : "unknown"),
    host: options.ollamaHost ?? null,
  };

  // Cache hit on the deterministic id: we still need to write the artifact
  // and emit the compilation_run event. The cached run gives us the response
  // without re-dispatching to the model.
  const expectedId = computeRunId(runInput, runModel);
  const cachedRun = loadPersistedRun(expectedId, cwd);
  let runId: string;
  let cached: boolean;
  let response: { text: string; provider: LlmProvider; model: string };

  if (cachedRun) {
    runId = cachedRun.id;
    cached = true;
    response = {
      text: cachedRun.output.text,
      provider: cachedRun.model.provider,
      model: cachedRun.model.model,
    };
  } else {
    const start = Date.now();
    let dispatched;
    try {
      dispatched = await dispatchLlmRequest(
        {
          task: COMPILE_TASK,
          prompt: promptText,
          // Pass the resolved model in `request.model` so it flows to BOTH
          // adapters consistently. Mock's adapter reads `request.model`
          // directly (its `defaultModel` is ignored); ollama's adapter
          // honors `request.model` if set, falling back to defaultModel
          // otherwise. Without this, the mock adapter would always echo
          // "mock_default" as `dispatched.model`, which would then leak
          // into the persisted run's model field and break runId
          // determinism between the pre-dispatch expectedId and the
          // post-dispatch persisted id.
          ...(resolvedModel ? { model: resolvedModel } : {}),
          ...(systemPrompt ? { system: systemPrompt } : {}),
        },
        { provider, defaultModel: resolvedModel, ollamaHost: options.ollamaHost },
      );
    } catch (err: unknown) {
      return {
        ok: false,
        reason: "dispatch_failed",
        message: err instanceof Error ? err.message : String(err),
      };
    }
    const durationMs = Date.now() - start;

    let persisted;
    try {
      persisted = createPersistedRun({
        kind: "context",
        input: runInput,
        model: { ...runModel, model: dispatched.model },
        output: { text: dispatched.text, parsed: null },
        validation: null,
        durationMs,
        cwd,
      });
    } catch (err: unknown) {
      return {
        ok: false,
        reason: "persist_failed",
        message: err instanceof Error ? err.message : String(err),
      };
    }

    runId = persisted.run.id;
    cached = false;
    response = { text: dispatched.text, provider: dispatched.provider, model: dispatched.model };
  }

  // For manifestation:"code" nodes, project the dispatcher's text through a
  // markdown-fence extractor before writing. Chat-tuned models routinely wrap
  // code in ```lang ... ``` and surround it with prose; that prose would land
  // verbatim in a .py/.ts/.rs file and break the artifact at parse time.
  // The mock provider's identity-functor output has no fence, so this is a
  // no-op there. The persisted run still records the raw response text
  // (axiom 9: full provenance back to the prompt hash); the projection lives
  // between run.text and the on-disk artifact.
  let artifactContent = response.text;
  if (options.node.coordinates.manifestation === "code") {
    const projected = extractCodeFence({
      text: response.text,
      language: options.node.technical.language,
    });
    artifactContent = projected.content;
  }

  // Write the artifact.
  let artifact: WriteArtifactResult;
  try {
    artifact = writeArtifact({
      node: options.node,
      content: artifactContent,
      cwd,
    });
  } catch (err: unknown) {
    return {
      ok: false,
      reason: "write_failed",
      message: err instanceof Error ? err.message : String(err),
    };
  }

  // Parse-check the artifact against its declared language. Axiom 8: a model
  // emitting non-parseable code where the node declares one is a contradiction
  // and must surface as an explicit validation failure. If the language has
  // no registered validator, or the validator binary is not on PATH, the step
  // is skipped (no false positives in CI environments without the toolchain).
  // The compilation_run event is intentionally NOT emitted on failure: the
  // artifact stays on disk for inspection, but the audit chain does not record
  // it as a successful compilation.
  if (options.node.coordinates.manifestation === "code" && options.node.technical.language) {
    const check = validateLanguage({
      absolutePath: artifact.absolutePath,
      language: options.node.technical.language,
    });
    if (check.status === "failed") {
      return {
        ok: false,
        reason: "validate_failed",
        message: `${options.node.technical.language} parse failed for ${artifact.relativePath}: ${check.message}`,
      };
    }
  }

  // Optional runtime check. Strictly opt-in: parse-pass is not the same as
  // runs-correctly (a class definition referencing an undefined symbol
  // parses fine but raises NameError at execution). Off by default because
  // running arbitrary LLM output has operational consequences; the CLI
  // surfaces this via --runtime-check.
  if (
    options.runtimeCheck &&
    options.node.coordinates.manifestation === "code" &&
    options.node.technical.language
  ) {
    const rc = runtimeCheck({
      absolutePath: artifact.absolutePath,
      language: options.node.technical.language,
      timeoutMs: options.runtimeCheckTimeoutMs,
    });
    if (rc.status === "failed") {
      return {
        ok: false,
        reason: "runtime_failed",
        message: `${options.node.technical.language} runtime failed for ${artifact.relativePath}: ${rc.message}`,
      };
    }
  }

  // Emit compilation_run event. The event ties the artifact back to its run
  // and node, completing the audit chain: nodeId → runId → artifactPath.
  const paths = getOntologyPaths(cwd);
  const state = readState(cwd);
  const eventId = "evt_" + randomBytes(4).toString("hex");
  const event = OntologyEventSchema.parse({
    eventId,
    sequence: state.eventCount,
    timestamp: new Date().toISOString(),
    eventType: "compilation_run",
    branch: state.activeBranch,
    previousEventId: state.lastEventId,
    payload: {
      nodeId: options.node.id,
      runId,
      cached,
      artifactRelativePath: artifact.relativePath,
      bytes: artifact.bytesWritten,
    },
  });
  appendJsonl(paths.eventsPath, event);

  state.eventCount += 1;
  state.lastEventId = eventId;
  state.updatedAt = new Date().toISOString();
  writeState(state, cwd);

  return {
    ok: true,
    runId,
    cached,
    artifact,
    event,
    response,
  };
}
