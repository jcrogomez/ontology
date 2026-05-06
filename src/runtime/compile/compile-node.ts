import { randomBytes } from "node:crypto";
import type { OntologyNode, OntologyEvent, PersistedRunInput, PersistedRunModel } from "../../schemas/ontology.js";
import { OntologyEventSchema } from "../../schemas/ontology.js";
import { dispatchLlmRequest } from "../llm/dispatcher.js";
import type { LlmProvider, LlmTask } from "../llm/types.js";
import { hashPrompt } from "../../core/integrity/hash.js";
import { createPersistedRun, computeRunId, loadPersistedRun } from "../../core/runs/persist.js";
import { writeArtifact, type WriteArtifactResult } from "./artifact-writer.js";
import { extractCodeFence } from "./post/extract-code-fence.js";
import { validateLanguage } from "./post/validate-language.js";
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
  provider?: LlmProvider; // default "mock"
  model?: string;
  ollamaHost?: string;
  cwd?: string;
  // Compilation results from earlier steps in the same plan run, keyed by
  // node id. Future versions may use this to thread upstream outputs into
  // the prompt; today the helper does NOT inject them automatically — it
  // is exposed so callers can build a richer prompt themselves if needed.
  upstreamArtifacts?: Record<string, string>;
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
  | { ok: false; reason: "dispatch_failed" | "persist_failed" | "write_failed" | "validate_failed"; message: string };

const COMPILE_TASK: LlmTask = "code_sketch";

export async function compileNode(options: CompileNodeOptions): Promise<CompileNodeResult> {
  const cwd = options.cwd ?? process.cwd();
  const provider: LlmProvider = options.provider ?? "mock";

  // The compile prompt is the node's raw prompt. Future versions may prepend
  // the assembled context as system instructions when the dispatch interface
  // grows a system slot. For v0 we keep the contract narrow so the mock's
  // identity-functor behavior is preserved end-to-end.
  const promptText = options.node.prompt.raw ?? "";

  // Build the deterministic run envelope. Including the focal node's id and
  // its abstraction in the input means two structurally identical compiles
  // of two different nodes still produce different run ids.
  const runInput: PersistedRunInput = {
    promptHash: hashPrompt(promptText),
    contextHash: null,
    targetNodeId: options.node.id,
    branch: options.node.coordinates.branch,
    time: null,
    task: COMPILE_TASK as string,
    includeEdges: false,
    edgeTypes: null,
  };
  const runModel: PersistedRunModel = {
    provider,
    model: options.model ?? (provider === "mock" ? "mock_default" : "unknown"),
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
        { task: COMPILE_TASK, prompt: promptText },
        { provider, defaultModel: options.model, ollamaHost: options.ollamaHost },
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
