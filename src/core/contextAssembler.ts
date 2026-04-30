import type { PromptGraph } from './promptGraph.js';

export interface IsolatedContext {
  canonRules: Record<string, any>[];
  domainEntities: Record<string, any>[];
  parentContext?: Record<string, any>;
  lineagePrompts: string[];
}

export async function assembleContextForNode(
  graph: PromptGraph,
  targetNodeId: string,
  loadArtifact: (ref: string) => Promise<any>
): Promise<IsolatedContext> {
  const ancestors = graph.getAncestors(targetNodeId);
  const context: IsolatedContext = {
    canonRules: [],
    domainEntities: [],
    lineagePrompts: []
  };

  for (const node of ancestors) {
    context.lineagePrompts.push(node.promptText);

    if (node.hierarchyLevel === 'canon' && node.artifacts.oslRef) {
      try {
        const artifact = await loadArtifact(node.artifacts.oslRef);
        context.canonRules.push(artifact);
      } catch (e) {
        // Log or handle missing artifact
      }
    } else if (node.hierarchyLevel === 'domain' && node.artifacts.oslRef) {
      try {
        const artifact = await loadArtifact(node.artifacts.oslRef);
        context.domainEntities.push(artifact);
      } catch (e) {
        // Log or handle missing artifact
      }
    }
  }

  return context;
}
