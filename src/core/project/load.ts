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
}
