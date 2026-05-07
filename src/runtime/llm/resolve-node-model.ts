import type { OntologyModel } from "../../schemas/ontology.js";
import type { LlmProvider } from "./types.js";

// Per-node model routing: each OntologyNode has `model.ref` (a string handle
// like "mock_default" or "qwen2.5-coder:1.5b") that resolves through the
// project's models/registry.json into a (provider, model_name) pair.
//
// Why this exists: a real Ontology project mixes concerns. Canon/project/target
// nodes are abstract intentions — a tiny model or even mock is fine. Artifact
// leaves with `manifestation: code` need a coder-tuned LLM. Hardcoding a
// single CLI-level `--provider/--model` for the whole plan forces the user
// to pick the WORST model for the WORST node and pay for it on every
// dispatch. With per-node routing each step picks its own.
//
// The dispatcher is the same; this helper just chooses what to dispatch
// with. compileNode calls it once per node, then passes the resolved
// (provider, model) into dispatchLlmRequest.

export interface ResolvedNodeModel {
  provider: LlmProvider;
  // The concrete model identifier the adapter should request (e.g.
  // "deterministic-mock-model" for mock, "llama3.2:3b" for ollama).
  model: string;
}

export type ResolveNodeModelResult =
  | { ok: true; resolved: ResolvedNodeModel }
  | { ok: false; reason: "ref_not_found" | "unsupported_provider"; message: string };

export function resolveNodeModel(
  ref: string,
  registry: { models: OntologyModel[] },
): ResolveNodeModelResult {
  const entry = registry.models.find((m) => m.id === ref);
  if (!entry) {
    return {
      ok: false,
      reason: "ref_not_found",
      message: `model.ref "${ref}" not found in .ontology/models/registry.json`,
    };
  }
  // Today the dispatcher only routes mock and ollama. Other providers in
  // the schema (openai, anthropic, local) are forward-compatible but not
  // yet wired; surface the failure clearly rather than silently falling
  // through to a stub.
  if (entry.provider !== "mock" && entry.provider !== "ollama") {
    return {
      ok: false,
      reason: "unsupported_provider",
      message: `model.ref "${ref}" resolves to provider "${entry.provider}" which is not yet supported by the dispatcher`,
    };
  }
  return {
    ok: true,
    resolved: { provider: entry.provider, model: entry.name },
  };
}
