import * as path from "node:path";
import { randomBytes } from "node:crypto";
import { loadNodeById } from "../../core/project/load.js";
import { writeJson, appendJsonl } from "../../core/fs/json.js";
import { readState, writeState } from "../../core/state/state-store.js";
import { getOntologyPaths } from "../../core/project/paths.js";
import { dispatchLlmRequest } from "../../runtime/llm/dispatcher.js";
import type { LlmProvider } from "../../runtime/llm/types.js";
import { errorMessage } from "../../core/errors.js";
import { OntologyEventSchema } from "../../schemas/ontology.js";
import {
  INSPECTOR_SYSTEM_PROMPT,
  buildInspectorPrompt,
  checkTranslatorCache,
  computeTranslatorSourceHash,
} from "../../runtime/legend/translator.js";

// `onto node inspect <nodeId>` — Project Legend δ-1 (Inspector / Lupa).
//
// Reads a node's structured intent (prompt + contract + rules) and
// produces a 3-5 sentence developer-facing summary. Cached on the
// node JSON file as `node.translator`. Subsequent inspect calls
// return the cached text without dispatching a fresh LLM call. The
// "one LLM call per node lifetime" property the design document
// (PROJECT_LEGEND.md §3) promises.
//
// Cache invalidation: the stored translator carries a `sourceHash`
// computed off the inputs (prompt + rules + contract). When those
// change the next inspect detects the mismatch and regenerates
// automatically. The user can also force regeneration with
// `--regenerate` (useful when iterating on the inspector prompt
// itself, or when a node's framing changes without altering the
// hashed inputs).

export interface NodeInspectOptions {
  provider?: string;
  model?: string;
  ollamaHost?: string;
  /**
   * Force a fresh dispatch even if the cached translator is valid.
   * Used when iterating on the inspector's prompt template, or when
   * the user wants a different model's reading of the same node.
   */
  regenerate?: boolean;
  json?: boolean;
}

export async function nodeInspectCommand(
  nodeId: string,
  options: NodeInspectOptions,
): Promise<void> {
  const cwd = process.cwd();
  const node = loadNodeById(nodeId, cwd);
  if (!node) {
    fail(`Node not found: ${nodeId}`, options.json);
    return;
  }

  // 1. Cache check. A valid hit returns immediately — no LLM call.
  if (!options.regenerate) {
    const status = checkTranslatorCache(node);
    if (status.hit) {
      if (options.json) {
        console.log(
          JSON.stringify(
            {
              ok: true,
              nodeId,
              cached: true,
              translator: {
                text: status.text,
                model: status.model,
                provider: status.provider,
                generatedAt: status.generatedAt,
              },
            },
            null,
            2,
          ),
        );
      } else {
        printInspector(nodeId, status.text, {
          model: status.model,
          provider: status.provider,
          generatedAt: status.generatedAt,
          cached: true,
        });
      }
      return;
    }
  }

  // 2. Resolve provider.
  const provider = resolveProvider(options.provider, options.json);
  if (options.provider !== undefined && provider === undefined) return;

  // 3. Dispatch.
  const userPrompt = buildInspectorPrompt(node);
  let resp;
  try {
    resp = await dispatchLlmRequest(
      {
        task: "inspect",
        prompt: userPrompt,
        system: INSPECTOR_SYSTEM_PROMPT,
      },
      {
        provider,
        defaultModel: options.model,
        ollamaHost: options.ollamaHost,
      },
    );
  } catch (err: unknown) {
    fail(`Inspector dispatch failed: ${errorMessage(err)}`, options.json);
    return;
  }

  const summary = resp.text.trim();
  if (summary.length === 0) {
    fail(
      `Inspector returned an empty response. Try a different provider or pass --regenerate.`,
      options.json,
    );
    return;
  }

  // 4. Cache the result on the node.
  const sourceHash = computeTranslatorSourceHash(node);
  const generatedAt = new Date().toISOString();
  const updatedNode = {
    ...node,
    translator: {
      text: summary,
      model: resp.model,
      provider: resp.provider,
      generatedAt,
      sourceHash,
    },
  };
  const nodePath = path.join(cwd, ".ontology", "nodes", `${nodeId}.json`);
  try {
    writeJson(nodePath, updatedNode);
  } catch (err: unknown) {
    fail(`Failed to persist translator cache: ${errorMessage(err)}`, options.json);
    return;
  }

  // 5. Append `node_inspected` event to the temporal log. Cache hits
  // bypass this block entirely (they returned in §1), so only paid
  // dispatches show up — the timeline is a record of API spend and
  // freshness moments. POST_GAMMA_PLAN.md §1.3 requested this so the
  // Phase ε self-ingestion run is replayable from events.jsonl alone.
  try {
    const paths = getOntologyPaths(cwd);
    const state = readState(cwd);
    const eventId = "evt_" + randomBytes(4).toString("hex");
    const event = OntologyEventSchema.parse({
      eventId,
      sequence: state.eventCount,
      timestamp: new Date().toISOString(),
      eventType: "node_inspected",
      branch: state.activeBranch,
      previousEventId: state.lastEventId,
      payload: {
        nodeId,
        model: resp.model,
        provider: resp.provider,
        sourceHash,
        ...(resp.usage?.totalTokens !== undefined
          ? { totalTokens: resp.usage.totalTokens }
          : {}),
      },
    });
    appendJsonl(paths.eventsPath, event);
    state.eventCount += 1;
    state.lastEventId = eventId;
    state.updatedAt = new Date().toISOString();
    writeState(state, cwd);
  } catch (err: unknown) {
    // Non-fatal: the translator is already persisted on the node; the
    // missing event is a provenance gap, not a correctness bug. Log
    // and continue so the user still sees the inspect output.
    console.error(`⚠ Failed to append node_inspected event: ${errorMessage(err)}`);
  }

  // 6. Emit.
  if (options.json) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          nodeId,
          cached: false,
          translator: {
            text: summary,
            model: resp.model,
            provider: resp.provider,
            generatedAt,
          },
          usage: resp.usage,
        },
        null,
        2,
      ),
    );
    return;
  }
  printInspector(nodeId, summary, {
    model: resp.model,
    provider: resp.provider,
    generatedAt,
    cached: false,
  });
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function resolveProvider(
  raw: string | undefined,
  json: boolean | undefined,
): LlmProvider | undefined {
  if (raw === undefined) return undefined; // routed per-node via registry
  if (raw !== "mock" && raw !== "ollama" && raw !== "anthropic") {
    fail(
      `Unsupported provider: ${raw} (try mock, ollama, or anthropic)`,
      json,
    );
    return undefined;
  }
  return raw as LlmProvider;
}

function printInspector(
  nodeId: string,
  text: string,
  meta: {
    model: string;
    provider: string;
    generatedAt: string;
    cached: boolean;
  },
): void {
  console.log(`=== ONTOLOGY INSPECT (δ-1) ===`);
  console.log(`Node:          ${nodeId}`);
  console.log(`Provider:      ${meta.provider} (${meta.model})`);
  console.log(`Generated at:  ${meta.generatedAt}${meta.cached ? "  (cached)" : ""}`);
  console.log(``);
  console.log(text);
  if (meta.cached) {
    console.log(``);
    console.log(
      `Cached — pass --regenerate for a fresh dispatch (or change the node's prompt / rules / contract and re-run).`,
    );
  }
}

function fail(msg: string, json?: boolean): void {
  if (json) {
    console.log(JSON.stringify({ ok: false, error: msg }));
  } else {
    console.error(`✖ ${msg}`);
  }
  process.exit(1);
}
