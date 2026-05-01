import * as fs from "node:fs";
import * as path from "node:path";
import { getOntologyPaths } from "./paths.js";
import { OntologyNode, OntologyNodeSchema } from "../../schemas/ontology.js";
import { z } from "zod";

export function assertOntologyProject(cwd = process.cwd()): void {
  const paths = getOntologyPaths(cwd);
  if (!fs.existsSync(paths.statePath)) {
    console.error("✖ Not an Ontology project. Run 'onto init' first.");
    process.exit(1);
  }
}

export function loadNodes(cwd = process.cwd()): OntologyNode[] {
  const paths = getOntologyPaths(cwd);

  if (!fs.existsSync(paths.nodesDir)) {
    return [];
  }

  const files = fs.readdirSync(paths.nodesDir).filter(f => f.endsWith('.json'));
  const nodes: OntologyNode[] = [];

  for (const file of files) {
    const fullPath = path.join(paths.nodesDir, file);
    try {
      const content = fs.readFileSync(fullPath, "utf-8");
      const parsed = JSON.parse(content);
      const node = OntologyNodeSchema.parse(parsed);
      nodes.push(node);
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        const summary = err.issues.slice(0, 3).map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
        console.error(`✖ Failed to parse node ${file}: ${summary}`);
      } else {
        console.error(`✖ Failed to parse node ${file}:`, err instanceof Error ? err.message : String(err));
      }
      process.exit(1);
    }
  }

  return nodes;
}

export function loadNodeById(id: string, cwd = process.cwd()): OntologyNode | null {
  const paths = getOntologyPaths(cwd);
  const fullPath = path.join(paths.nodesDir, `${id}.json`);

  if (!fs.existsSync(fullPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(fullPath, "utf-8");
    const parsed = JSON.parse(content);
    return OntologyNodeSchema.parse(parsed);
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      const summary = err.issues.slice(0, 3).map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
      console.error(`✖ Failed to parse node ${id}: ${summary}`);
    } else {
      console.error(`✖ Failed to parse node ${id}:`, err instanceof Error ? err.message : String(err));
    }
    process.exit(1);
  }
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
