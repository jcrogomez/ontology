import { loadModelsRegistry } from "../../../kernel/core/project/load.js";
import { getOntologyPaths } from "../../../kernel/core/project/paths.js";
import { writeJson } from "../../../kernel/core/fs/json.js";
import { resolveNodeModel } from "../../../runtime/llm/resolve-node-model.js";

// Walker action: view + reconfigure per-TASK model routing
// (REGEN_ORACLE_REFINE). The round-trip measured that the forward functor F
// (`code_sketch`) wants a code-expert model while G-extraction
// (`semantic_parse` / `inspect`) and verification (`node_critique`) want a
// stronger reasoning model. This surfaces the routing as a small, inspectable
// table in the Walker (`:models`) and lets the user re-point any task at any
// registered model (`:route <task> <model-id|off>`) — the policy layer between
// a CLI `--model` override and a node's own `model.ref`.

// The tasks worth routing, each with the role it plays in the F↔G round-trip,
// in display order. (LlmTask has more values; these are the load-bearing ones
// a user reasons about when assigning model capability where it matters.)
export const ROUTABLE_TASKS: ReadonlyArray<{ task: string; role: string }> = [
  { task: "code_sketch", role: "F · intención→código" },
  { task: "semantic_parse", role: "G · extraer intención" },
  { task: "inspect", role: "G · narración (lupa)" },
  { task: "node_critique", role: "verificación" },
  { task: "node_expand", role: "expansión (workflow)" },
];

const ROUTABLE_TASK_SET = new Set(ROUTABLE_TASKS.map((t) => t.task));

export interface RoutingRow {
  task: string;
  role: string;
  /** The routed model id, or null when this task falls back to per-node model.ref. */
  modelId: string | null;
  /** Resolved provider/model when the routed id resolves; absent otherwise. */
  provider?: string;
  modelName?: string;
  /** True when modelId is set AND resolves to a dispatchable model. */
  resolved: boolean;
  /** Set when modelId is present but does not resolve (dangling/unsupported). */
  problem?: string;
}

export interface ModelCatalogRow {
  id: string;
  provider: string;
  name: string;
  /** First clause of the model's `notes` (often "ROL …") — its declared role. */
  role?: string;
}

export type ModelsFromWalkerResult =
  | { ok: true; routing: RoutingRow[]; catalog: ModelCatalogRow[] }
  | { ok: false; message: string };

/** Read the registry and project it into the routing table + model catalog. */
export function modelsFromWalker(cwd: string = process.cwd()): ModelsFromWalkerResult {
  let registry: ReturnType<typeof loadModelsRegistry>;
  try {
    registry = loadModelsRegistry(cwd);
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
  const routingMap = registry.routing ?? {};
  const routing: RoutingRow[] = ROUTABLE_TASKS.map(({ task, role }) => {
    const modelId = routingMap[task] && routingMap[task].length > 0 ? routingMap[task] : null;
    if (modelId === null) return { task, role, modelId: null, resolved: false };
    const r = resolveNodeModel(modelId, registry);
    if (r.ok) {
      return { task, role, modelId, provider: r.resolved.provider, modelName: r.resolved.model, resolved: true };
    }
    return { task, role, modelId, resolved: false, problem: r.message };
  });
  const catalog: ModelCatalogRow[] = registry.models.map((m) => ({
    id: m.id,
    provider: m.provider,
    name: m.name,
    role: m.notes ? m.notes.split(/[:.]/)[0].trim() : undefined,
  }));
  return { ok: true, routing, catalog };
}

export interface RouteResult {
  ok: boolean;
  message: string;
}

/**
 * Governed reconfigure: point `task` at model `modelId`, or clear it
 * (`modelId === null` → fall back to per-node model.ref). Validates the task
 * is routable and the model id exists+resolves before writing. Writes the
 * registry.json back via the kernel's atomic writeJson.
 */
export function routeFromWalker(
  task: string,
  modelId: string | null,
  cwd: string = process.cwd(),
): RouteResult {
  if (!ROUTABLE_TASK_SET.has(task)) {
    return { ok: false, message: `unknown task "${task}". Routable: ${[...ROUTABLE_TASK_SET].join(", ")}` };
  }
  let registry: ReturnType<typeof loadModelsRegistry>;
  try {
    registry = loadModelsRegistry(cwd);
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
  const routing: Record<string, string> = { ...(registry.routing ?? {}) };
  if (modelId === null) {
    if (!(task in routing)) {
      return { ok: false, message: `task "${task}" was not routed — nothing to clear` };
    }
    delete routing[task];
  } else {
    const r = resolveNodeModel(modelId, registry);
    if (!r.ok) {
      return { ok: false, message: `cannot route "${task}" → "${modelId}": ${r.message}` };
    }
    routing[task] = modelId;
  }
  const paths = getOntologyPaths(cwd);
  try {
    // Preserve every other registry field; only `routing` changes. Omit the
    // key entirely when empty so a cleared registry is byte-clean.
    const next: Record<string, unknown> = { models: registry.models };
    if (Object.keys(routing).length > 0) next.routing = routing;
    writeJson(paths.modelsRegistryPath, next);
  } catch (err) {
    return { ok: false, message: `failed to write registry: ${err instanceof Error ? err.message : String(err)}` };
  }
  return {
    ok: true,
    message:
      modelId === null
        ? `cleared routing for "${task}" (falls back to per-node model.ref)`
        : `routed "${task}" → "${modelId}"`,
  };
}
