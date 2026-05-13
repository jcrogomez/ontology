import * as fs from "node:fs";
import * as path from "node:path";
import { randomBytes } from "node:crypto";
import { getOntologyPaths } from "../core/project/paths.js";
import { ensureDir, writeJson, appendJsonl } from "../core/fs/json.js";
import {
  OntologyEventSchema,
  OntologySchemaVersion,
  OntologyNodeSchema,
  OntologyModelSchema,
  OntologyProcessorSchema,
  OntologyStateSchema,
  type OntologyNode,
} from "../schemas/ontology.js";
import { hashObject } from "../core/integrity/hash.js";
import { registerProject } from "../core/projects/registry.js";

export interface InitOptions {
  // Friendly name for the global project registry. Defaults to the basename
  // of the current working directory. Does not change anything inside
  // `.ontology/` itself — the project's internal `state.json.projectName`
  // is left at its default.
  name?: string;
}

// Bootstrap 0.1 creates the smallest trustworthy Ontology universe.
//
// It does not parse prompts.
// It does not execute models.
// It does not compile code.
//
// It creates a frozen mathematical canon, a temporal genesis event,
// empty typed-edge storage, model/processor registries, and a state file.
// This is enough for Ontology to verify its own memory before learning to edit it.

export async function initCommand(options: InitOptions = {}): Promise<void> {
  const paths = getOntologyPaths();

  if (fs.existsSync(paths.ontologyDir)) {
    console.log("✖ Ontology project already initialized.");
    return;
  }

  // Create full directory structure
  ensureDir(paths.ontologyDir);
  ensureDir(paths.nodesDir);
  ensureDir(paths.imagesDir);
  ensureDir(paths.audioDir);
  ensureDir(paths.videoDir);
  ensureDir(paths.filesDir);
  ensureDir(paths.datasetsDir);
  ensureDir(paths.modelsDir);
  ensureDir(paths.processorsDir);
  ensureDir(paths.presetsDir);
  ensureDir(paths.contextSnapshotsDir);
  ensureDir(paths.generatedArtifactsDir);
  ensureDir(paths.buildsDir);
  ensureDir(paths.validationReportsDir);
  ensureDir(paths.compilationReportsDir);

  // Genesis event comes first: time precedes semantic state.
  const genesisEventId = "evt_" + randomBytes(4).toString("hex");
  const genesisEvent = OntologyEventSchema.parse({
    eventId: genesisEventId,
    sequence: 0,
    timestamp: new Date().toISOString(),
    eventType: "system_init",
    branch: "main",
    previousEventId: null,
    payload: {
      action: "bootstrap_network_kernel",
      schemaVersion: OntologySchemaVersion,
    },
  });
  appendJsonl(paths.eventsPath, genesisEvent);

  // Create empty edges file
  fs.writeFileSync(paths.edgesPath, "");

  // The mathematical canon is stored as data, not only documentation. This makes the formal model part of the network itself.
  const canonRules = [
    "1. Ontology is a typed, temporal, directed graph enriched with a partial order of abstraction.",
    "2. Prompts act as rewrite rules that expand subgraphs.",
    "3. Context is assigned locally as a presheaf over graph neighborhoods.",
    "4. Compilation is a structure-preserving functor from the category of intention to the category of executable artifacts.",
    "5. Code is not the source of truth.",
    "6. Code is the compiled shadow of a valid semantic network.",
    "7. Lower-level nodes may refine higher-level nodes, but may not mutate them.",
    "8. Contradictions must become explicit as validation failures, superseding relations, or branches.",
    "9. Every generated artifact must be traceable to source nodes, edges, events, and hashes.",
  ];

  const mathematicalCanonText = `Establish Ontology as a typed temporal semantic graph with prompt rewriting, context presheaves, and functorial compilation.\n\n${canonRules.join("\n")}`;

  const nodeWithoutHash = {
    id: "node_0000_canon",
    label: "Ontology Mathematical Canon",
    kind: "canon",
    status: "frozen",
    coordinates: {
      abstraction: "canon",
      time: 0,
      branch: "main",
      plane: "semantic",
      manifestation: "intent",
    },
    inputs: [
      {
        type: "text",
        value: mathematicalCanonText,
        role: "mathematical_canon",
      },
    ],
    prompt: {
      raw: "Establish Ontology as a typed temporal semantic graph with prompt rewriting, context presheaves, and functorial compilation.",
      language: "en",
      variables: {},
    },
    model: {
      ref: "mock_default",
    },
    processors: {
      pre: [],
      post: [],
    },
    context: {
      provides: [
        {
          key: "MathematicalCanon",
          nodeType: "canon",
        },
        {
          key: "CanonRules",
          nodeType: "canon",
        },
      ],
      requires: [],
      forbids: [],
      optional: [],
    },
    rules: canonRules,
    technical: {},
    outputs: {
      files: [],
    },
    validation: {
      errors: [],
      warnings: [],
    },
    graph: {
      parentId: null,
      orbitOf: null,
    },
    integrity: {
      frozen: true,
      schemaVersion: OntologySchemaVersion,
    }
  };

  const nodeHash = hashObject(nodeWithoutHash);

  const canonNode = OntologyNodeSchema.parse({
    ...nodeWithoutHash,
    integrity: {
      ...nodeWithoutHash.integrity,
      hash: nodeHash,
    },
  });

  writeJson(`${paths.nodesDir}/node_0000_canon.json`, canonNode);

  // Create models/registry.json with cross-provider, per-tier entries.
  // A real project mixes nodes: simple translators want a fast/cheap
  // model, deep code-reasoning wants a critic model, abstract canon
  // nodes can stay on mock. Each entry below is a routing handle a
  // node's `model.ref` can point at; combine freely across providers
  // in the same compile plan. The DefaultAnthropicRouting / DefaultOllamaRouting
  // tables in src/runtime/llm/registry.ts give the auto-pick when no
  // ref is set and only `--provider` is on the CLI.
  const modelsRegistry = {
    models: [
      OntologyModelSchema.parse({
        id: "mock_default",
        provider: "mock",
        name: "deterministic-mock-model",
        temperature: 0,
        multimodal: false,
        notes: "Default placeholder model for Network Kernel bootstrap and offline tests.",
      }),
      // Anthropic frontier tier — for code-sketch / critique / verify-
      // homeomorphism compile-back. The γ-2 and γ-7 calibrations both
      // hit publishable verdicts using this model.
      OntologyModelSchema.parse({
        id: "anthropic-opus-critic",
        provider: "anthropic",
        name: "claude-opus-4-7",
        temperature: 0,
        multimodal: false,
        notes: "Frontier model for deep code-reasoning, compile-back (code_sketch), and node_critique. Requires ANTHROPIC_API_KEY.",
      }),
      // Anthropic balanced tier — for ingest extraction (semantic_parse),
      // node_expand, test_generate. Best $/quality on structured outputs.
      OntologyModelSchema.parse({
        id: "anthropic-sonnet-balanced",
        provider: "anthropic",
        name: "claude-sonnet-4-6",
        temperature: 0,
        multimodal: false,
        notes: "Balanced model for ingest extraction and structured generation. ~40% cheaper than Opus on the same task family.",
      }),
      // Anthropic fast tier — for the Inspector translator, documentation,
      // context_assemble. Short prose, low ambiguity.
      OntologyModelSchema.parse({
        id: "anthropic-haiku-fast",
        provider: "anthropic",
        name: "claude-haiku-4-5",
        temperature: 0,
        multimodal: false,
        notes: "Fast tier — Inspector translator, documentation, lightweight tasks. ~5× cheaper than Opus per call.",
      }),
      // Ollama local-coder — free, runs against `ollama serve`. Useful
      // for offline calibration baselines (the β-2 hash.ts run used
      // this family) and for nodes where the user wants zero API spend.
      OntologyModelSchema.parse({
        id: "ollama-qwen-coder",
        provider: "ollama",
        name: "qwen2.5-coder:7b",
        temperature: 0,
        multimodal: false,
        notes: "Local Ollama coder model for free dispatch. Pull with `ollama pull qwen2.5-coder:7b` before use.",
      }),
      // Legacy alias preserved so projects initialised before the cross-
      // provider rewrite still resolve their `model.ref: "anthropic_default"`
      // canon entries.
      OntologyModelSchema.parse({
        id: "anthropic_default",
        provider: "anthropic",
        name: "claude-opus-4-7",
        temperature: 0,
        multimodal: false,
        notes: "Legacy alias — kept for backwards compatibility. Prefer anthropic-opus-critic / anthropic-sonnet-balanced / anthropic-haiku-fast for tier-aware routing.",
      }),
    ],
  };
  writeJson(paths.modelsRegistryPath, modelsRegistry);

  // Create processors/registry.json
  const processorsRegistry = {
    processors: [
      OntologyProcessorSchema.parse({
        id: "assemble_context",
        phase: "pre",
        description: "Assembles minimal context from graph contracts.",
        enabled: true,
      }),
      OntologyProcessorSchema.parse({
        id: "validate_json_schema",
        phase: "post",
        description: "Validates structured outputs against declared schemas.",
        enabled: true,
      }),
      OntologyProcessorSchema.parse({
        id: "generate_provenance_headers",
        phase: "post",
        description: "Adds source node metadata to generated artifacts.",
        enabled: true,
      }),
    ],
  };
  writeJson(paths.processorsRegistryPath, processorsRegistry);

  // Create state.json
  const now = new Date().toISOString();
  const state = OntologyStateSchema.parse({
    initialized: true,
    schemaVersion: OntologySchemaVersion,
    projectName: "ontology-project",
    rootNodeId: "node_0000_canon",
    activeBranch: "main",
    nodeCount: 1,
    edgeCount: 0,
    eventCount: 1,
    lastEventId: genesisEventId,
    createdAt: now,
    updatedAt: now,
  });
  writeJson(paths.statePath, state);

  // Register this project in the global registry so `onto open` can list it
  // later. Friendly name defaults to the cwd basename so the picker shows
  // something more useful than "ontology-project". Failure to write the
  // registry is non-fatal — the project itself is fine and the user can
  // always re-register by opening it.
  const projectAbsPath = path.resolve(process.cwd());
  const friendlyName = options.name ?? path.basename(projectAbsPath);
  try {
    registerProject({
      name: friendlyName,
      path: projectAbsPath,
      rootNodeId: "node_0000_canon",
    });
  } catch (err: unknown) {
    console.error(`(warning) project not registered: ${err instanceof Error ? err.message : String(err)}`);
  }

  console.log(`=== ONTOLOGY NETWORK KERNEL BOOTSTRAPPED ===

Axiom:
  Ontology is a typed, temporal, directed graph enriched with a partial order of abstraction.

Created:
  .ontology/
  .ontology/nodes/node_0000_canon.json
  .ontology/events.jsonl
  .ontology/edges.jsonl
  .ontology/models/registry.json
  .ontology/processors/registry.json

Project "${friendlyName}" registered. Open later with:
  onto open

Next:
  onto validate
  onto inspect`);
}
