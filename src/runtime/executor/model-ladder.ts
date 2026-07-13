// Premise-based capability ladder.
//
// The executor's `escalate` lever climbs a ladder of models ordered cheapest →
// most capable. That ladder is NOT a hardcoded array: it is the RESULT of
// resolving a ModelPremise (the architect's "prefer local, escalate to
// cloud-open-free, never paid" intent) against the model registry's capability
// descriptors. This is the tool the architect uses to choose models by premise
// (-local / -frontier / -ollama / free-only), and what keeps the $0/local
// default honest — the default premise forbids `paid`, so a paid frontier model
// is simply absent from the ladder unless the human opts in.
//
// Caps are read from each model's optional `caps` field; when absent they are
// derived coarsely from the provider. Real ladders should annotate caps in
// .ontology/models/registry.json (a cloud open model on the `ollama` provider
// derives as local/cheap otherwise — annotate it cloud/mid to order correctly).

import type { ModelCaps, OntologyModel } from "../../kernel/schemas/ontology.js";
import type { ResolvedNodeModel } from "../llm/resolve-node-model.js";
import type { LlmProvider } from "../llm/types.js";

type Dimension = "locality" | "tier" | "cost" | "provider";

export interface ModelPremise {
  // Whitelist per dimension: if present and non-empty, a model's value MUST be
  // in the list. Omitted dimension = no constraint.
  allow?: Partial<Record<Dimension, string[]>>;
  // Blacklist per dimension: a model's value must NOT be in the list.
  forbid?: Partial<Record<Dimension, string[]>>;
  // Sort keys, applied in order, ascending rank (cheap/free/local first). Ties
  // are broken by model id for determinism.
  order: ("tier" | "cost" | "locality")[];
}

// The $0/local default: never paid, never the identity mock, climb cheap→capable.
export const DEFAULT_PREMISE: ModelPremise = {
  forbid: { cost: ["paid"], provider: ["mock"] },
  order: ["tier", "cost", "locality"],
};

// A ladder rung: the dispatchable (provider, model) pair PLUS the caps it was
// ordered by, so downstream consumers (the runner's economics accounting) can
// read rung locality without re-loading the registry. `caps` stays optional for
// hand-built test ladders; rungLocality falls back to the provider heuristic.
export interface LadderRung extends ResolvedNodeModel {
  caps?: ModelCaps;
}

/** Locality of a rung: explicit caps win; otherwise the same coarse
 *  provider-derivation as deriveCaps (ollama/mock → local, else cloud). */
export function rungLocality(rung: LadderRung): "local" | "cloud" {
  if (rung.caps) return rung.caps.locality;
  return rung.provider === "ollama" || rung.provider === "mock" ? "local" : "cloud";
}

// Providers the dispatcher can actually route through (mirrors resolve-node-model).
const DISPATCHABLE = new Set<string>(["mock", "ollama", "anthropic"]);

export function deriveCaps(m: OntologyModel): ModelCaps {
  if (m.caps) return m.caps;
  switch (m.provider) {
    case "ollama":
    case "local":
      return { locality: "local", tier: "cheap", cost: "free", openWeights: true };
    case "mock":
      return { locality: "local", tier: "cheap", cost: "free", openWeights: true };
    default: // anthropic / openai / gemini — assume cloud paid frontier closed
      return { locality: "cloud", tier: "frontier", cost: "paid", openWeights: false };
  }
}

const TIER_RANK: Record<string, number> = { cheap: 0, mid: 1, frontier: 2 };
const COST_RANK: Record<string, number> = { free: 0, paid: 1 };
const LOCALITY_RANK: Record<string, number> = { local: 0, cloud: 1 };

function rankBy(key: "tier" | "cost" | "locality", caps: ModelCaps): number {
  if (key === "tier") return TIER_RANK[caps.tier] ?? 99;
  if (key === "cost") return COST_RANK[caps.cost] ?? 99;
  return LOCALITY_RANK[caps.locality] ?? 99;
}

function dimensionValue(m: OntologyModel, caps: ModelCaps, dim: Dimension): string {
  if (dim === "provider") return m.provider;
  if (dim === "locality") return caps.locality;
  if (dim === "tier") return caps.tier;
  return caps.cost;
}

function passesFilter(m: OntologyModel, caps: ModelCaps, premise: ModelPremise): boolean {
  for (const [dim, vals] of Object.entries(premise.allow ?? {})) {
    if (vals && vals.length > 0 && !vals.includes(dimensionValue(m, caps, dim as Dimension))) {
      return false;
    }
  }
  for (const [dim, vals] of Object.entries(premise.forbid ?? {})) {
    if (vals && vals.includes(dimensionValue(m, caps, dim as Dimension))) {
      return false;
    }
  }
  return true;
}

// Resolve a premise to an ordered ladder of dispatchable models. rung 0 is the
// cheapest/most-preferred; the last rung is the most capable allowed. An empty
// ladder means the premise excluded everything (the runner treats that as a
// configuration error, not a node result).
//
// A model is a ladder candidate ONLY if it carries EXPLICIT `caps`. This makes
// the caps annotation the opt-in: a registry full of embedding/extraction
// models does not pollute the compilation ladder, and the architect controls
// exactly which models are rungs by annotating them. (deriveCaps is still
// exported for callers that want a best-effort classification of a lone model.)
export function resolveLadder(
  premise: ModelPremise,
  registry: { models: OntologyModel[] },
): LadderRung[] {
  const candidates = registry.models
    .filter((m) => m.caps !== undefined)
    .map((m) => ({ m, caps: m.caps! }))
    .filter(({ m }) => DISPATCHABLE.has(m.provider))
    .filter(({ m, caps }) => passesFilter(m, caps, premise));

  candidates.sort((a, b) => {
    for (const key of premise.order) {
      const diff = rankBy(key, a.caps) - rankBy(key, b.caps);
      if (diff !== 0) return diff;
    }
    return a.m.id.localeCompare(b.m.id);
  });

  return candidates.map(({ m, caps }) => ({
    provider: m.provider as LlmProvider,
    model: m.name,
    caps,
  }));
}
