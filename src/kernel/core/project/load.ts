import * as fs from "node:fs";
import * as path from "node:path";
import { getOntologyPaths } from "./paths.js";
import {
  OntologyNode,
  OntologyNodeSchema,
  OntologyState,
  OntologyStateSchema,
  OntologyEvent,
  OntologyEventSchema,
  OntologyEdge,
  OntologyEdgeSchema,
  OntologyModel,
  OntologyModelSchema,
  OntologyProcessor,
  OntologyProcessorSchema
} from "../../schemas/ontology.js";
import { z } from "zod";

export function assertOntologyProject(cwd = process.cwd()): void {
  const paths = getOntologyPaths(cwd);
  if (!fs.existsSync(paths.statePath)) {
    console.error("✖ Not an Ontology project. Run 'onto init' first.");
    process.exit(1);
  }
}

export function loadState(cwd = process.cwd()): OntologyState {
  const paths = getOntologyPaths(cwd);
  if (!fs.existsSync(paths.statePath)) {
    throw new Error(`Missing required file: .ontology/state.json`);
  }
  const content = fs.readFileSync(paths.statePath, "utf-8");
  try {
    return OntologyStateSchema.parse(JSON.parse(content));
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      const summary = err.issues.slice(0, 3).map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
      throw new Error(`Failed to parse .ontology/state.json: ${summary}`);
    }
    throw new Error(`Failed to parse .ontology/state.json: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export function loadNodes(cwd = process.cwd()): OntologyNode[] {
  const paths = getOntologyPaths(cwd);

  if (!fs.existsSync(paths.nodesDir)) {
    throw new Error(`Missing required directory: .ontology/nodes`);
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

  return nodes.sort((a, b) => {
    if (a.coordinates.time !== b.coordinates.time) {
      return a.coordinates.time - b.coordinates.time;
    }
    return a.id.localeCompare(b.id);
  });
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
}

export function loadEvents(cwd = process.cwd()): OntologyEvent[] {
  const paths = getOntologyPaths(cwd);
  if (!fs.existsSync(paths.eventsPath)) {
    throw new Error(`Missing required file: .ontology/events.jsonl`);
  }

  const content = fs.readFileSync(paths.eventsPath, "utf-8");
  const lines = content.split('\n').filter(line => line.trim() !== '');
  const events: OntologyEvent[] = [];

  for (let i = 0; i < lines.length; i++) {
    try {
      events.push(OntologyEventSchema.parse(JSON.parse(lines[i])));
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        const summary = err.issues.slice(0, 3).map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
        throw new Error(`Failed to parse event on line ${i + 1} of .ontology/events.jsonl: ${summary}`);
      }
      throw new Error(`Failed to parse event on line ${i + 1} of .ontology/events.jsonl: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return events;
}

export function loadEdges(cwd = process.cwd()): OntologyEdge[] {
  const paths = getOntologyPaths(cwd);
  if (!fs.existsSync(paths.edgesPath)) {
    throw new Error(`Missing required file: .ontology/edges.jsonl`);
  }

  const content = fs.readFileSync(paths.edgesPath, "utf-8");
  const lines = content.split('\n').filter(line => line.trim() !== '');
  const edges: OntologyEdge[] = [];

  for (let i = 0; i < lines.length; i++) {
    try {
      edges.push(OntologyEdgeSchema.parse(JSON.parse(lines[i])));
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        const summary = err.issues.slice(0, 3).map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
        throw new Error(`Failed to parse edge on line ${i + 1} of .ontology/edges.jsonl: ${summary}`);
      }
      throw new Error(`Failed to parse edge on line ${i + 1} of .ontology/edges.jsonl: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return edges;
}

export interface ModelsRegistry {
  models: OntologyModel[];
  /** Optional per-TASK model routing (REGEN_ORACLE_REFINE): maps an LlmTask
   *  (e.g. "code_sketch" for the forward functor F, "semantic_parse"/"inspect"
   *  for the inverse G extraction, "node_critique" for verification) to a model
   *  `id` in `models`. The policy layer between a CLI `--model` override and a
   *  node's own `model.ref`: when a task has a routing entry, that model is used
   *  for the task unless a CLI override is given. Absent → per-node `model.ref`
   *  behaviour is unchanged (no regression). Lets a project put a code-expert on
   *  F and a stronger reasoning model on G — the round-trip's measured neck. */
  routing?: Record<string, string>;
}

export function loadModelsRegistry(cwd = process.cwd()): ModelsRegistry {
  const paths = getOntologyPaths(cwd);
  if (!fs.existsSync(paths.modelsRegistryPath)) {
    throw new Error(`Missing required file: .ontology/models/registry.json`);
  }

  const content = fs.readFileSync(paths.modelsRegistryPath, "utf-8");
  try {
    const parsed = JSON.parse(content);
    const parsedModels = z
      .object({
        models: z.array(OntologyModelSchema),
        routing: z.record(z.string(), z.string()).optional(),
      })
      .parse(parsed);
    return parsedModels;
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      const summary = err.issues.slice(0, 3).map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
      throw new Error(`Failed to parse .ontology/models/registry.json: ${summary}`);
    }
    throw new Error(`Failed to parse .ontology/models/registry.json: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export function loadProcessorsRegistry(cwd = process.cwd()): { processors: OntologyProcessor[] } {
  const paths = getOntologyPaths(cwd);
  if (!fs.existsSync(paths.processorsRegistryPath)) {
    throw new Error(`Missing required file: .ontology/processors/registry.json`);
  }

  const content = fs.readFileSync(paths.processorsRegistryPath, "utf-8");
  try {
    const parsed = JSON.parse(content);
    const parsedProcessors = z.object({ processors: z.array(OntologyProcessorSchema) }).parse(parsed);
    return parsedProcessors;
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      const summary = err.issues.slice(0, 3).map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
      throw new Error(`Failed to parse .ontology/processors/registry.json: ${summary}`);
    }
    throw new Error(`Failed to parse .ontology/processors/registry.json: ${err instanceof Error ? err.message : String(err)}`);
  }
}
