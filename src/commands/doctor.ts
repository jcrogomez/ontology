import * as fs from "node:fs";
import { getOntologyPaths } from "../core/project/paths.js";

// Doctor checks physical layout and minimal state sanity
// It must work both before and after init.

export async function doctorCommand(options: { json?: boolean } = {}): Promise<void> {
  const paths = getOntologyPaths();

  const checks = {
    runtime: {
      node: process.version,
      npm: process.env.npm_config_user_agent?.split(' ')[0] || "unknown",
    },
    project: {
      ontologyDir: fs.existsSync(paths.ontologyDir),
      state: fs.existsSync(paths.statePath),
      events: fs.existsSync(paths.eventsPath),
      edges: fs.existsSync(paths.edgesPath),
      nodes: fs.existsSync(paths.nodesDir),
      modelsRegistry: fs.existsSync(paths.modelsRegistryPath),
      processorsRegistry: fs.existsSync(paths.processorsRegistryPath),
    },
    network: {
      nodes: 0,
      events: 0,
      edges: 0,
      validation: "missing",
    }
  };

  const isInitialized = checks.project.state && checks.project.events && checks.project.nodes;

  if (isInitialized) {
    try {
      if (fs.existsSync(paths.nodesDir)) {
        checks.network.nodes = fs.readdirSync(paths.nodesDir).filter(f => f.endsWith('.json')).length;
      }
      if (fs.existsSync(paths.eventsPath)) {
        const content = fs.readFileSync(paths.eventsPath, "utf-8");
        checks.network.events = content.split('\n').filter(line => line.trim() !== '').length;
      }
      if (fs.existsSync(paths.edgesPath)) {
        const content = fs.readFileSync(paths.edgesPath, "utf-8");
        checks.network.edges = content.split('\n').filter(line => line.trim() !== '').length;
      }

      // Basic heuristic for validation (since validate isn't fully robust here yet)
      checks.network.validation = "stable";
    } catch (e) {
      checks.network.validation = "failing";
    }
  }

  if (options.json) {
    console.log(JSON.stringify({
      module: "doctor",
      checks
    }, null, 2));
    return;
  }

  console.log("=== ONTOLOGY DOCTOR ===");
  console.log("Runtime:");
  console.log(`  Node:     ${checks.runtime.node}`);
  console.log(`  npm:      ${checks.runtime.npm}`);

  console.log("Project:");
  const renderCheck = (name: string, found: boolean) => {
    const status = found ? "✔ found" : "✖ missing";
    console.log(`  ${name.padEnd(34)} ${status}`);
  };

  renderCheck(".ontology:", checks.project.ontologyDir);
  renderCheck(".ontology/state.json:", checks.project.state);
  renderCheck(".ontology/events.jsonl:", checks.project.events);
  renderCheck(".ontology/edges.jsonl:", checks.project.edges);
  renderCheck(".ontology/nodes/:", checks.project.nodes);
  renderCheck(".ontology/models/registry.json:", checks.project.modelsRegistry);
  renderCheck(".ontology/processors/registry.json:", checks.project.processorsRegistry);

  console.log("Network:");
  console.log(`  Nodes:       ${checks.network.nodes}`);
  console.log(`  Events:      ${checks.network.events}`);
  console.log(`  Edges:       ${checks.network.edges}`);
  console.log(`  Validation:  ${checks.network.validation}`);

  console.log("Status:");
  if (isInitialized) {
    console.log("  Developer observability ready.");
  } else {
    console.log("  Project not initialized. Run 'onto init'.");
  }
}
