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

  if (!fs.existsSync(paths.statePath)) {
    console.error("✖ Ontology state not found. Run 'onto init' first.");
    process.exit(1);
  }

  const requiredPaths = [
    { path: paths.eventsPath, display: ".ontology/events.jsonl", isDir: false },
    { path: paths.edgesPath, display: ".ontology/edges.jsonl", isDir: false },
    { path: paths.nodesDir, display: ".ontology/nodes/", isDir: true },
    { path: paths.modelsRegistryPath, display: ".ontology/models/registry.json", isDir: false },
    { path: paths.processorsRegistryPath, display: ".ontology/processors/registry.json", isDir: false }
  ];

  for (const req of requiredPaths) {
    if (!fs.existsSync(req.path)) {
      const type = req.isDir ? "directory" : "file";
      console.error(`✖ Missing required ${type}: ${req.display}`);
      process.exit(1);
    }
  }

  const state = readJson<OntologyState>(paths.statePath);
  const rootNode = readJson<OntologyNode>(path.join(paths.nodesDir, `${state.rootNodeId}.json`));
  const events = readJsonl<OntologyEvent>(paths.eventsPath);
  const edges = readJsonl<OntologyEdge>(paths.edgesPath);

  const modelsRegistry = readJson<{ models: OntologyModel[] }>(paths.modelsRegistryPath);
  const processorsRegistry = readJson<{ processors: OntologyProcessor[] }>(paths.processorsRegistryPath);

  // Use the first rule of the canon for a clearer summary, fallback to input text if needed.
  let canonDisplay = "Canon rule not found.";
  if (rootNode.rules && rootNode.rules.length > 0) {
    canonDisplay = rootNode.rules[0];
  } else {
    const canonText = rootNode.inputs
      .filter((i) => i.type === "text" && i.role === "mathematical_canon")
      .map((i) => (i as { type: "text", value: string }).value)
      .join("\n");
    canonDisplay = canonText.split('\n').find(line => line.trim().length > 0) || canonDisplay;
  }

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
