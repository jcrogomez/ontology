import * as fs from "node:fs";
import * as path from "node:path";
import { getOntologyPaths } from "./paths.js";
import { readJson, readJsonl } from "../fs/json.js";
import {
  OntologyStateSchema,
  OntologyNodeSchema,
  OntologyEventSchema,
  OntologyEdgeSchema,
  OntologyModelSchema,
  OntologyProcessorSchema,
  type OntologyState,
  type OntologyNode,
  type OntologyEvent,
  type OntologyEdge,
  type OntologyModel,
  type OntologyProcessor
} from "../../schemas/ontology.js";
import { z } from "zod";

export function assertOntologyProject(): void {
  const paths = getOntologyPaths();
  if (!fs.existsSync(paths.ontologyDir)) {
    throw new Error(".ontology directory not found. Run 'onto init' first.");
  }
  if (!fs.existsSync(paths.statePath)) {
    throw new Error("Ontology state not found. Run 'onto init' first.");
  }
}

export function loadState(): OntologyState {
  const paths = getOntologyPaths();
  if (!fs.existsSync(paths.statePath)) {
    throw new Error(`Missing required file: .ontology/state.json`);
  }
  const raw = readJson<unknown>(paths.statePath);
  return OntologyStateSchema.parse(raw);
}

export function loadNodes(): OntologyNode[] {
  const paths = getOntologyPaths();
  if (!fs.existsSync(paths.nodesDir)) {
    throw new Error(`Missing required directory: .ontology/nodes`);
  }
  const files = fs.readdirSync(paths.nodesDir).filter(f => f.endsWith(".json"));
  const nodes: OntologyNode[] = [];
  for (const file of files) {
    const raw = readJson<unknown>(path.join(paths.nodesDir, file));
    nodes.push(OntologyNodeSchema.parse(raw));
  }
  nodes.sort((a, b) => {
    if (a.coordinates.time !== b.coordinates.time) {
      return a.coordinates.time - b.coordinates.time;
    }
    return a.id.localeCompare(b.id);
  });
  return nodes;
}

export function loadNodeById(id: string): OntologyNode | null {
  const paths = getOntologyPaths();
  const nodePath = path.join(paths.nodesDir, `${id}.json`);
  if (!fs.existsSync(nodePath)) {
    return null;
  }
  const raw = readJson<unknown>(nodePath);
  return OntologyNodeSchema.parse(raw);
}

export function loadEvents(): OntologyEvent[] {
  const paths = getOntologyPaths();
  if (!fs.existsSync(paths.eventsPath)) {
    throw new Error(`Missing required file: .ontology/events.jsonl`);
  }
  const raw = readJsonl<unknown>(paths.eventsPath);
  return raw.map(e => OntologyEventSchema.parse(e));
}

export function loadEdges(): OntologyEdge[] {
  const paths = getOntologyPaths();
  if (!fs.existsSync(paths.edgesPath)) {
    throw new Error(`Missing required file: .ontology/edges.jsonl`);
  }
  const raw = readJsonl<unknown>(paths.edgesPath);
  return raw.map(e => OntologyEdgeSchema.parse(e));
}

export function loadModelsRegistry(): { models: OntologyModel[] } {
  const paths = getOntologyPaths();
  if (!fs.existsSync(paths.modelsRegistryPath)) {
    throw new Error(`Missing required file: .ontology/models/registry.json`);
  }
  const schema = z.object({ models: z.array(OntologyModelSchema) });
  const raw = readJson<unknown>(paths.modelsRegistryPath);
  return schema.parse(raw);
}

export function loadProcessorsRegistry(): { processors: OntologyProcessor[] } {
  const paths = getOntologyPaths();
  if (!fs.existsSync(paths.processorsRegistryPath)) {
    throw new Error(`Missing required file: .ontology/processors/registry.json`);
  }
  const schema = z.object({ processors: z.array(OntologyProcessorSchema) });
  const raw = readJson<unknown>(paths.processorsRegistryPath);
  return schema.parse(raw);
}
