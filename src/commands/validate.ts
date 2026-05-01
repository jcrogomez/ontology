import * as fs from "node:fs";
import * as path from "node:path";
import { getOntologyPaths } from "../core/project/paths.js";
import { readJson, readJsonl } from "../core/fs/json.js";
import { hashObject, removeIntegrityHash } from "../core/integrity/hash.js";
import {
  OntologyStateSchema,
  OntologyNodeSchema,
  OntologyEventSchema,
  OntologyEdgeSchema,
  OntologyModelSchema,
  OntologyProcessorSchema,
  type OntologyNode,
  type OntologyEvent,
  type OntologyEdge,
  type OntologyState
} from "../schemas/ontology.js";

// Validation compares declared state with physical state. If they diverge, the network is no longer trustworthy.

export async function validateCommand(): Promise<void> {
  const paths = getOntologyPaths();

  if (!fs.existsSync(paths.ontologyDir)) {
    console.error("✖ .ontology directory not found. Run 'onto init' first.");
    process.exit(1);
  }

  let failures = 0;
  const errors: string[] = [];

  function reportError(msg: string) {
    failures++;
    errors.push(msg);
  }

  const requiredFiles = [
    paths.statePath,
    paths.eventsPath,
    paths.edgesPath,
    paths.modelsRegistryPath,
    paths.processorsRegistryPath,
  ];

  for (const file of requiredFiles) {
    if (!fs.existsSync(file)) {
      reportError(`Missing required file: ${path.basename(file)}`);
    }
  }

  if (!fs.existsSync(paths.nodesDir)) {
    reportError(`Missing required directory: nodes/`);
  }

  if (failures > 0) {
    console.error("✖ VALIDATION FAILED. Missing core structures.");
    errors.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  }

  let state: OntologyState;
  try {
    const rawState = readJson(paths.statePath);
    state = OntologyStateSchema.parse(rawState);
  } catch (err: unknown) {
    reportError(`Failed to parse state.json: ${(err as Error).message}`);
    console.error("✖ VALIDATION FAILED. State file is corrupted.");
    process.exit(1);
  }

  const nodeFiles = fs.readdirSync(paths.nodesDir).filter((f) => f.endsWith(".json"));
  const nodeIds = new Set<string>();
  let rootNodeFound: OntologyNode | null = null;

  for (const file of nodeFiles) {
    try {
      const rawNode = readJson<OntologyNode>(path.join(paths.nodesDir, file));
      // Each node is parsed through Zod before hashing. Shape errors and integrity errors are reported separately.
      const node = OntologyNodeSchema.parse(rawNode);
      nodeIds.add(node.id);

      if (node.id === state.rootNodeId) {
        rootNodeFound = node;
      }

      const nodeWithoutHash = removeIntegrityHash(node);
      const computedHash = hashObject(nodeWithoutHash);

      // If this hash differs, the node was changed outside Ontology's mutation path.
      if (computedHash !== node.integrity.hash) {
        reportError(`Hash mismatch in node ${node.id}`);
      }
    } catch (err: unknown) {
      reportError(`Failed to parse node ${file}: ${(err as Error).message}`);
    }
  }

  if (nodeIds.size !== state.nodeCount) {
    reportError(`Node count mismatch: state declares ${state.nodeCount}, found ${nodeIds.size}`);
  }

  if (!rootNodeFound) {
    reportError(`Root node ${state.rootNodeId} declared in state not found.`);
  } else {
    if (rootNodeFound.kind !== "canon") {
      reportError(`Root node is not kind 'canon'.`);
    }
    if (rootNodeFound.coordinates.abstraction !== "canon") {
      reportError(`Root node abstraction is not 'canon'.`);
    }
    if (!rootNodeFound.integrity.frozen) {
      reportError(`Root node is not frozen.`);
    }

    const rulesStr = rootNodeFound.rules.join(" ");
    if (!rulesStr.includes("Code is not the source of truth")) {
      reportError(`Root canon missing rule: "Code is not the source of truth"`);
    }
    if (!rulesStr.includes("structure-preserving functor")) {
      reportError(`Root canon missing rule: "structure-preserving functor"`);
    }

    const inputsText = rootNodeFound.inputs
      .filter((i) => i.type === "text")
      .map((i) => (i as { type: "text", value: string }).value)
      .join(" ");

    const requiredPhrases = [
      "typed, temporal, directed graph",
      "partial order of abstraction",
      "rewrite rules",
      "presheaf",
      "structure-preserving functor",
      "compiled shadow"
    ];

    for (const phrase of requiredPhrases) {
      if (!inputsText.includes(phrase) && !rulesStr.includes(phrase)) {
        reportError(`Root canon missing essential phrase: "${phrase}"`);
      }
    }
  }

  let events: OntologyEvent[] = [];
  try {
    events = readJsonl<OntologyEvent>(paths.eventsPath).map((e) => OntologyEventSchema.parse(e));
  } catch (err: unknown) {
    reportError(`Failed to parse events.jsonl: ${(err as Error).message}`);
  }

  if (events.length !== state.eventCount) {
    reportError(`Event count mismatch: state declares ${state.eventCount}, found ${events.length}`);
  }

  if (events.length > 0) {
    const lastEvent = events[events.length - 1];
    if (lastEvent.eventId !== state.lastEventId) {
      reportError(`Last event mismatch: state declares ${state.lastEventId}, found ${lastEvent.eventId}`);
    }
  } else if (state.eventCount > 0) {
      reportError(`State declares events but events.jsonl is empty.`);
  }

  let edges: OntologyEdge[] = [];
  try {
    edges = readJsonl<OntologyEdge>(paths.edgesPath).map((e) => OntologyEdgeSchema.parse(e));
    for (const edge of edges) {
      // Edges must point to existing nodes. A dangling edge means the topology no longer describes a valid network.
      if (!nodeIds.has(edge.from)) {
        reportError(`Edge ${edge.edgeId} 'from' reference ${edge.from} does not exist.`);
      }
      if (!nodeIds.has(edge.to)) {
        reportError(`Edge ${edge.edgeId} 'to' reference ${edge.to} does not exist.`);
      }
      const edgeWithoutHash = removeIntegrityHash(edge);
      const computedHash = hashObject(edgeWithoutHash);
      if (computedHash !== edge.integrity.hash) {
         reportError(`Hash mismatch in edge ${edge.edgeId}`);
      }
    }
  } catch (err: unknown) {
    reportError(`Failed to parse edges.jsonl: ${(err as Error).message}`);
  }

  if (edges.length !== state.edgeCount) {
    reportError(`Edge count mismatch: state declares ${state.edgeCount}, found ${edges.length}`);
  }

  try {
    const modelsRegistry = readJson<{ models: unknown[] }>(paths.modelsRegistryPath);
    if (!modelsRegistry || !Array.isArray(modelsRegistry.models)) {
      reportError("Models registry format invalid: expected { models: [] }");
    } else {
      let hasMock = false;
      for (const m of modelsRegistry.models) {
        const model = OntologyModelSchema.parse(m);
        if (model.id === "mock_default") {
          hasMock = true;
        }
      }
      if (!hasMock) {
        reportError("Models registry missing 'mock_default' model.");
      }
    }
  } catch (err: unknown) {
    reportError(`Failed to parse models registry: ${(err as Error).message}`);
  }

  try {
    const processorsRegistry = readJson<{ processors: unknown[] }>(paths.processorsRegistryPath);
    if (!processorsRegistry || !Array.isArray(processorsRegistry.processors)) {
      reportError("Processors registry format invalid: expected { processors: [] }");
    } else {
      const foundIds = new Set<string>();
      for (const p of processorsRegistry.processors) {
        const proc = OntologyProcessorSchema.parse(p);
        foundIds.add(proc.id);
      }
      const requiredProcs = ["assemble_context", "validate_json_schema", "generate_provenance_headers"];
      for (const req of requiredProcs) {
        if (!foundIds.has(req)) {
          reportError(`Processors registry missing required processor: '${req}'`);
        }
      }
    }
  } catch (err: unknown) {
    reportError(`Failed to parse processors registry: ${(err as Error).message}`);
  }

  if (failures > 0) {
    console.error(`\n=== ONTOLOGY NETWORK VALIDATION ===`);
    console.error(`✖ VALIDATION FAILED. ${failures} checks failed.`);
    errors.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  }

  console.log(`\n=== ONTOLOGY NETWORK VALIDATION ===`);
  console.log(`✔ NETWORK KERNEL IS STABLE.`);
}
