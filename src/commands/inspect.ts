import * as fs from "node:fs";
import * as path from "node:path";
import { getOntologyPaths } from "../core/project/paths.js";
import { readJson, readJsonl } from "../core/fs/json.js";
import type {
  OntologyState,
  OntologyNode,
  OntologyEvent,
  OntologyEdge,
  OntologyModel,
  OntologyProcessor,
} from "../schemas/ontology.js";

// Inspect is observational only. It must never mutate the network.

export async function inspectCommand(): Promise<void> {
  const paths = getOntologyPaths();

  if (!fs.existsSync(paths.ontologyDir)) {
    console.error("✖ .ontology directory not found. Run 'onto init' first.");
    process.exit(1);
  }

  const state = readJson<OntologyState>(paths.statePath);
  const rootNode = readJson<OntologyNode>(path.join(paths.nodesDir, `${state.rootNodeId}.json`));
  const events = readJsonl<OntologyEvent>(paths.eventsPath);
  const edges = readJsonl<OntologyEdge>(paths.edgesPath);

  const modelsRegistry = readJson<{ models: OntologyModel[] }>(paths.modelsRegistryPath);
  const processorsRegistry = readJson<{ processors: OntologyProcessor[] }>(paths.processorsRegistryPath);

  const canonText = rootNode.inputs
    .filter((i) => i.type === "text" && i.role === "mathematical_canon")
    .map((i) => (i as { type: "text", value: string }).value)
    .join("\n") || "Canon input not found.";

  // Grab the first line of the canon text to show in the display (or a summarized axiom)
  const canonDisplay = canonText.split('\n').find(line => line.trim().length > 0) || "";

  console.log(`=== ONTOLOGY PROJECT INSPECT ===

Project:        ${state.projectName}
Schema:         ${state.schemaVersion}
Branch:         ${state.activeBranch}
Root node:      ${state.rootNodeId}
Root label:     ${rootNode.label}
Nodes:          ${state.nodeCount}
Edges:          ${edges.length}
Events:         ${events.length}
Models:         ${modelsRegistry.models.length}
Processors:     ${processorsRegistry.processors.length}

Canon:
  ${canonDisplay}

Status:
  Network kernel initialized.
  Integrity validation available.
  Compilation not enabled yet.
`);
}
