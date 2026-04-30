import { z } from 'zod';
import { randomUUID } from 'crypto';
import { DiagnosticSchema } from './diagnostics.js';

export const HierarchyLevelSchema = z.enum(['project', 'canon', 'domain', 'task', 'view', 'component']);
export type HierarchyLevel = z.infer<typeof HierarchyLevelSchema>;

export const ArtifactsSchema = z.object({
  oslRef: z.string().optional(),
  astRef: z.string().optional(),
  codeRef: z.string().optional(),
});

export const NodeStatusSchema = z.enum([
  'clean',
  'warning',
  'broken',
  'stale'
]);

export const IntentNodeSchema = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
  hierarchyLevel: HierarchyLevelSchema,
  promptText: z.string(),
  artifacts: ArtifactsSchema,
  diagnostics: z.array(DiagnosticSchema).default([]),
  status: NodeStatusSchema.default('clean'),
  timestamp: z.number(),
  author: z.string().default('developer'),
});

export type IntentNode = z.infer<typeof IntentNodeSchema>;

export const GraphStateSchema = z.object({
  nodes: z.record(z.string(), IntentNodeSchema),
  head: z.string().nullable(),
});

export type GraphState = z.infer<typeof GraphStateSchema>;

export class PromptGraph {
  private state: GraphState;

  constructor(initialState?: GraphState) {
    this.state = initialState ?? { nodes: {}, head: null };
  }

  public addRoot(promptText: string, hierarchyLevel: HierarchyLevel = 'project', author: string = 'developer'): IntentNode {
    const id = randomUUID();
    const node: IntentNode = {
      id,
      parentId: null,
      hierarchyLevel,
      promptText,
      artifacts: {},
      diagnostics: [],
      status: 'clean',
      timestamp: Date.now(),
      author,
    };
    this.state.nodes[id] = node;
    this.state.head = id;
    return node;
  }

  public branch(parentId: string, promptText: string, hierarchyLevel: HierarchyLevel, author: string = 'developer'): IntentNode {
    if (!this.state.nodes[parentId]) {
      throw new Error(`Parent node ${parentId} does not exist in the graph.`);
    }

    const id = randomUUID();
    const node: IntentNode = {
      id,
      parentId,
      hierarchyLevel,
      promptText,
      artifacts: {},
      diagnostics: [],
      status: 'clean',
      timestamp: Date.now(),
      author,
    };

    this.state.nodes[id] = node;
    this.state.head = id;
    return node;
  }

  public updateArtifacts(nodeId: string, artifacts: z.infer<typeof ArtifactsSchema>, diagnostics: z.infer<typeof DiagnosticSchema>[] = []) {
    if (!this.state.nodes[nodeId]) throw new Error(`Node ${nodeId} not found.`);

    this.state.nodes[nodeId].artifacts = { ...this.state.nodes[nodeId].artifacts, ...artifacts };
    this.state.nodes[nodeId].diagnostics = diagnostics;

    let status: z.infer<typeof NodeStatusSchema> = 'clean';
    for (const diag of diagnostics) {
      if (diag.severity === 'error' || diag.severity === 'blocking') {
        status = 'broken';
        break;
      } else if (diag.severity === 'warning') {
        status = 'warning';
      }
    }

    this.state.nodes[nodeId].status = status;
  }

  public getAncestors(nodeId: string): IntentNode[] {
    const lineage: IntentNode[] = [];
    let currentId: string | null = nodeId;

    while (currentId) {
      const currentNode: IntentNode | undefined = this.state.nodes[currentId];
      if (!currentNode) {
        break;
      }
      lineage.unshift(currentNode);
      currentId = currentNode.parentId;
    }
    return lineage;
  }

  public getNode(nodeId: string): IntentNode | undefined {
    return this.state.nodes[nodeId];
  }

  public getHead(): string | null {
    return this.state.head;
  }

  public checkout(nodeId: string): void {
    if (!this.state.nodes[nodeId]) throw new Error(`Node ${nodeId} not found.`);
    this.state.head = nodeId;
  }

  public serialize(): string {
    return JSON.stringify(this.state, null, 2);
  }

  public static deserialize(json: string): PromptGraph {
    const parsed = JSON.parse(json);
    const validState = GraphStateSchema.parse(parsed);
    return new PromptGraph(validState);
  }
}
