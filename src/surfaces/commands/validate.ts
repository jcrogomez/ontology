import * as fs from "node:fs";
import * as path from "node:path";
import { getOntologyPaths } from "../../kernel/core/project/paths.js";
import { readJson, readJsonl } from "../../kernel/core/fs/json.js";
import { hashObject, removeIntegrityHash } from "../../kernel/core/integrity/hash.js";
import { errorMessage } from "../../kernel/core/errors.js";
import { validateEdgeDirection } from "../../kernel/graph/poset.js";
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
} from "../../kernel/schemas/ontology.js";
import { z } from "zod";

function summarizeError(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.errors
      .slice(0, 3)
      .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
      .join("; ");
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown error";
}

type CorruptFile = {
  fileName: string;
  reason: string;
};

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
    reportError(`Failed to parse state.json: ${errorMessage(err)}`);
    console.error("✖ VALIDATION FAILED. State file is corrupted.");
    process.exit(1);
  }

  const nodeFiles = fs.readdirSync(paths.nodesDir).filter((f) => f.endsWith(".json"));

  const validNodes: OntologyNode[] = [];
  const corruptNodeFiles: CorruptFile[] = [];
  const validNodeIds = new Set<string>();

  for (const file of nodeFiles) {
    try {
      const rawNode = readJson<OntologyNode>(path.join(paths.nodesDir, file));
      const node = OntologyNodeSchema.parse(rawNode);

      const nodeWithoutHash = removeIntegrityHash(node);
      const computedHash = hashObject(nodeWithoutHash);

      // Hash mismatch means the node changed outside Ontology's mutation path.
      if (computedHash !== node.integrity.hash) {
        reportError(`Hash mismatch in node ${node.id}`);
      }

      validNodes.push(node);
      validNodeIds.add(node.id);
    } catch (err: unknown) {
      // Corrupt node files still count as physical nodes, but cannot participate in topology.
      // Root corruption is reported separately because the network cannot have a trustworthy origin without it.
      const reason = summarizeError(err);
      corruptNodeFiles.push({ fileName: file, reason });
      console.error(`✖ Node file is schema-corrupt: ${file}`);
      console.error(`  ${reason}`);
      reportError(`Node file is schema-corrupt: ${file}`);
    }
  }

  const totalPhysicalNodes = validNodes.length + corruptNodeFiles.length;
  if (totalPhysicalNodes !== state.nodeCount) {
    reportError(`Node count mismatch: state declares ${state.nodeCount}, found ${totalPhysicalNodes}`);
  }

  const rootNodeFileName = `${state.rootNodeId}.json`;
  const rootNodePath = path.join(paths.nodesDir, rootNodeFileName);

  if (!fs.existsSync(rootNodePath)) {
    reportError(`Root node file missing: ${rootNodeFileName}`);
  } else if (corruptNodeFiles.some(c => c.fileName === rootNodeFileName)) {
    reportError(`Root node exists but is schema-corrupt: ${rootNodeFileName}`);
  } else {
    const rootNodeFound = validNodes.find(n => n.id === state.rootNodeId);
    if (rootNodeFound) {
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
  }

  // --- EVENTS ---
  type CorruptLine = { lineNumber: number; reason: string; };

  const validEvents: OntologyEvent[] = [];
  const corruptEventLines: CorruptLine[] = [];

  if (fs.existsSync(paths.eventsPath)) {
    const content = fs.readFileSync(paths.eventsPath, "utf-8");
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      try {
        const rawEvent = JSON.parse(line);
        const ev = OntologyEventSchema.parse(rawEvent);
        validEvents.push(ev);
      } catch (err: unknown) {
        const reason = summarizeError(err);
        corruptEventLines.push({ lineNumber: i + 1, reason });
        console.error(`✖ Event line is schema-corrupt at events.jsonl:${i + 1}`);
        console.error(`  ${reason}`);
        reportError(`Event line is schema-corrupt at events.jsonl:${i + 1}`);
      }
    }
  }

  const totalEventLines = validEvents.length + corruptEventLines.length;
  if (totalEventLines !== state.eventCount) {
    reportError(`Event count mismatch: state declares ${state.eventCount}, found ${totalEventLines}`);
  }

  if (totalEventLines > 0) {
    // Check if the last non-empty line was corrupt
    const content = fs.existsSync(paths.eventsPath) ? fs.readFileSync(paths.eventsPath, "utf-8") : "";
    const lines = content.split("\n");
    let lastNonEmptyIdx = lines.length - 1;
    while (lastNonEmptyIdx >= 0 && lines[lastNonEmptyIdx].trim() === "") {
      lastNonEmptyIdx--;
    }

    if (lastNonEmptyIdx >= 0) {
      const isCorrupt = corruptEventLines.some(c => c.lineNumber === lastNonEmptyIdx + 1);
      if (isCorrupt) {
        reportError(`Last event is corrupt, cannot verify lastEventId`);
      } else if (validEvents.length > 0) {
        const lastEvent = validEvents[validEvents.length - 1];
        if (lastEvent.eventId !== state.lastEventId) {
          reportError(`Last event mismatch: state declares ${state.lastEventId}, found ${lastEvent.eventId}`);
        }
      }
    }

    for (let i = 0; i < validEvents.length; i++) {
      const current = validEvents[i];
      if (current.sequence !== i) {
        reportError(`Event sequence mismatch at ${current.eventId}: expected ${i}, found ${current.sequence}`);
      }

      if (i === 0) {
        if (current.previousEventId !== null) {
          reportError(`Genesis event must have previousEventId=null`);
        }
      } else {
        const prev = validEvents[i - 1];
        if (current.previousEventId !== prev.eventId) {
          reportError(
            `Event chain broken at ${current.eventId}: expected previousEventId=${prev.eventId}, found ${current.previousEventId}`
          );
        }
      }

      if (current.branch !== state.activeBranch) {
        reportError(`Event ${current.eventId} branch mismatch: expected ${state.activeBranch}, found ${current.branch}`);
      }
    }
  } else if (state.eventCount > 0) {
    reportError(`State declares events but events.jsonl is empty.`);
  }

  // --- EDGES ---
  const validEdges: OntologyEdge[] = [];
  const corruptEdgeLines: CorruptLine[] = [];

  // Build a node-id → abstraction-level lookup so the poset check below can
  // run without re-loading nodes from disk.
  const nodeAbstractionById = new Map(validNodes.map(n => [n.id, n.coordinates.abstraction]));

  if (fs.existsSync(paths.edgesPath)) {
    const content = fs.readFileSync(paths.edgesPath, "utf-8");
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      try {
        const rawEdge = JSON.parse(line);
        const edge = OntologyEdgeSchema.parse(rawEdge);

        if (!validNodeIds.has(edge.from)) {
          reportError(`Edge ${edge.edgeId} 'from' reference ${edge.from} does not exist.`);
        }
        if (!validNodeIds.has(edge.to)) {
          reportError(`Edge ${edge.edgeId} 'to' reference ${edge.to} does not exist.`);
        }

        const edgeWithoutHash = removeIntegrityHash(edge);
        const computedHash = hashObject(edgeWithoutHash);
        if (computedHash !== edge.integrity.hash) {
           reportError(`Hash mismatch in edge ${edge.edgeId}`);
        }

        // Poset enforcement: a refinement-family edge that was hand-edited or
        // imported from a malformed source can violate axiom 3 even if its
        // hash and references look valid. Re-run the same check that
        // `node link` enforces preventively.
        const sourceLevel = nodeAbstractionById.get(edge.from);
        const targetLevel = nodeAbstractionById.get(edge.to);
        if (sourceLevel && targetLevel) {
          const direction = validateEdgeDirection({
            sourceLevel,
            targetLevel,
            edgeType: edge.type,
          });
          if (!direction.ok) {
            reportError(`Edge ${edge.edgeId} violates abstraction poset: ${direction.reason}`);
          }
        }

        validEdges.push(edge);
      } catch (err: unknown) {
        const reason = summarizeError(err);
        corruptEdgeLines.push({ lineNumber: i + 1, reason });
        console.error(`✖ Edge line is schema-corrupt at edges.jsonl:${i + 1}`);
        console.error(`  ${reason}`);
        reportError(`Edge line is schema-corrupt at edges.jsonl:${i + 1}`);
      }
    }
  }

  const totalEdgeLines = validEdges.length + corruptEdgeLines.length;
  if (totalEdgeLines !== state.edgeCount) {
    reportError(`Edge count mismatch: state declares ${state.edgeCount}, found ${totalEdgeLines}`);
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
    reportError(`Failed to parse models registry: ${errorMessage(err)}`);
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
    reportError(`Failed to parse processors registry: ${errorMessage(err)}`);
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
