import * as fs from "node:fs";
import * as path from "node:path";
import { getOntologyPaths } from "../core/project/paths.js";
import { loadState, loadNodeById, loadEvents, loadEdges, loadModelsRegistry, loadProcessorsRegistry } from "../core/project/load.js";
import type { OntologyNode } from "../schemas/ontology.js";

// Inspect is observational only. It must never mutate the network.

export async function inspectCommand(options: { json?: boolean } = {}): Promise<void> {
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

  const state = loadState();
  const rootNodePath = path.join(paths.nodesDir, `${state.rootNodeId}.json`);
  if (!fs.existsSync(rootNodePath)) {
    console.error(`✖ Missing required file: .ontology/nodes/${state.rootNodeId}.json`);
    process.exit(1);
  }
  const rootNode: OntologyNode | null = loadNodeById(state.rootNodeId);
  if (!rootNode) {
    console.error(`✖ Failed to load root node: ${state.rootNodeId}`);
    process.exit(1);
  }

  const events = loadEvents();
  const edges = loadEdges();
  const modelsRegistry = loadModelsRegistry();
  const processorsRegistry = loadProcessorsRegistry();

  // Prefer the first canonical rule for the summary line. Fall back to a non-empty
  // line of the canon text input only if no rule is present.
  let canonDisplay = "Canon rule not found.";
  if (rootNode.rules.length > 0) {
    canonDisplay = rootNode.rules[0];
  } else {
    const canonText = rootNode.inputs
      .flatMap(i => i.type === "text" && (i.role === "mathematical_canon" || i.role === "source_prompt") ? [i.value] : [])
      .join("\n");
    canonDisplay = canonText.split("\n").find(line => line.trim().length > 0) || canonDisplay;
  }

  canonDisplay = canonDisplay.replace(/^\d+\.\s*/, "");

  if (options.json) {
    console.log(JSON.stringify({
      projectName: state.projectName,
      schemaVersion: state.schemaVersion,
      activeBranch: state.activeBranch,
      rootNodeId: state.rootNodeId,
      rootLabel: rootNode.label,
      nodeCount: state.nodeCount,
      edgeCount: edges.length,
      eventCount: events.length,
      modelCount: modelsRegistry.models.length,
      processorCount: processorsRegistry.processors.length,
      canon: canonDisplay,
      status: {
        initialized: true,
        validationAvailable: true,
        compilationEnabled: false
      }
    }, null, 2));
    return;
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
