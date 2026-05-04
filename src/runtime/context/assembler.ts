import { OntologyNode, OntologyEdge } from "../../schemas/ontology.js";
import { loadNodeById, loadState, loadEdges } from "../../core/project/load.js";
import { ContextAssemblyInput, ContextAssemblyOutput } from "./types.js";

function cleanPrefix(text: string): string {
  return text.replace(/^\d+\.\s*/, "");
}

export function assembleContext(input: ContextAssemblyInput, cwd = process.cwd()): ContextAssemblyOutput {
  // Future extension: temporal slicing will filter visible nodes by logical time.
  // const time = input.time;

  const state = loadState(cwd);
  const mode = input.mode || "strict";

  if (mode !== "strict") {
    throw new Error(`Unsupported context assembly mode: ${mode}`);
  }

  const targetNodeId = input.targetNodeId;
  const targetNode = loadNodeById(targetNodeId, cwd);

  if (!targetNode) {
    throw new Error(`Target node not found: ${targetNodeId}`);
  }

  const branch = input.branch || state.activeBranch || "main";

  if (targetNode.coordinates.branch && targetNode.coordinates.branch !== branch) {
    throw new Error(`Branch mismatch for node ${targetNodeId}: expected ${branch}, received ${targetNode.coordinates.branch}`);
  }

  const nodes: OntologyNode[] = [targetNode];
  let currentNode = targetNode;

  while (currentNode.graph.parentId !== null) {
    const parentId = currentNode.graph.parentId;
    const parentNode = loadNodeById(parentId, cwd);

    if (!parentNode) {
      throw new Error(`Missing ancestor node: ${parentId} required by ${currentNode.id}`);
    }

    if (parentNode.coordinates.branch && parentNode.coordinates.branch !== branch) {
      throw new Error(`Branch mismatch for node ${parentNode.id}: expected ${branch}, received ${parentNode.coordinates.branch}`);
    }

    nodes.push(parentNode);
    currentNode = parentNode;
  }

  if (currentNode.id !== state.rootNodeId) {
    throw new Error(`Context path does not terminate at root node: expected ${state.rootNodeId}, received ${currentNode.id}`);
  }

  // Reverse to get topological order: canon -> ...ancestors -> target
  nodes.reverse();

  const warnings: string[] = [];
  const edgeContext: { edges: OntologyEdge[]; nodeIds: string[] } = {
    edges: [],
    nodeIds: []
  };

  if (input.includeEdges) {
    const allowedEdgeTypes = input.edgeTypes || [
      "depends_on",
      "validates_against",
      "uses_token",
      "documents",
      "tests"
    ];

    const edges = loadEdges(cwd);
    const contextNodeIds = new Set(nodes.map(n => n.id));
    const matchingEdges = edges.filter((e: OntologyEdge) => allowedEdgeTypes.includes(e.type));

    const neighborIds = new Set<string>();
    const validEdges: OntologyEdge[] = [];

    for (const edge of matchingEdges) {
      if (contextNodeIds.has(edge.from) || contextNodeIds.has(edge.to)) {
        validEdges.push(edge);
        if (!contextNodeIds.has(edge.from)) neighborIds.add(edge.from);
        if (!contextNodeIds.has(edge.to)) neighborIds.add(edge.to);
      }
    }

    const newNodes: OntologyNode[] = [];
    for (const neighborId of neighborIds) {
      const neighborNode = loadNodeById(neighborId, cwd);
      if (neighborNode) {
        if (neighborNode.coordinates.branch && neighborNode.coordinates.branch !== branch) {
          warnings.push(`Ignored neighbor node ${neighborId} due to branch mismatch`);
        } else {
          newNodes.push(neighborNode);
          edgeContext.nodeIds.push(neighborId);
        }
      }
    }

    // Add unique neighbor nodes
    for (const n of newNodes) {
      nodes.push(n);
    }

    // Edges that connect to valid context nodes (both ends must now be in context, but wait, the prompt says "edges que conectan con los nodes en contexto", is it all validEdges?)
    // Actually the criteria is "edges cuyo type esté en edgeTypes" that connect to context nodes.
    // However, if an edge connects to a neighbor we rejected due to branch mismatch, should we include the edge?
    // Let's filter edges to those where both ends are in the final node set.
    const finalNodeIds = new Set(nodes.map(n => n.id));
    edgeContext.edges = validEdges.filter(e => finalNodeIds.has(e.from) && finalNodeIds.has(e.to));
  }

  const rootCanon = nodes[0];
  let canon = "";

  if (rootCanon.rules && rootCanon.rules.length > 0) {
    canon = cleanPrefix(rootCanon.rules[0]);
  } else {
    const canonInput = rootCanon.inputs.find(
      (i) => i.type === "text" && i.role === "mathematical_canon"
    );
    if (canonInput && canonInput.type === "text") {
      canon = canonInput.value;
    }
  }

  const constraints: string[] = [];
  for (const node of nodes) {
    if (node.rules && node.rules.length > 0) {
      for (const rule of node.rules) {
        constraints.push(cleanPrefix(rule));
      }
    }
  }

  const promptBuilder: string[] = [];
  promptBuilder.push(`ONTOLOGY CONTEXT PACKAGE`);
  promptBuilder.push(`Mode: strict`);
  promptBuilder.push(`Branch: ${branch}`);
  promptBuilder.push(`Target: ${targetNodeId}`);
  promptBuilder.push(``);
  promptBuilder.push(`Canon:`);
  promptBuilder.push(`${canon}`);
  promptBuilder.push(``);
  promptBuilder.push(`Constraints:`);
  constraints.forEach((c, i) => {
    promptBuilder.push(`${i + 1}. ${c}`);
  });
  promptBuilder.push(``);
  promptBuilder.push(`Path:`);
  for (const node of nodes) {
    promptBuilder.push(`- ${node.id} :: ${node.label}`);
  }
  promptBuilder.push(``);
  promptBuilder.push(`Target Prompt:\n${targetNode.prompt.raw || ""}`);

  const result: ContextAssemblyOutput = {
    mode: "strict",
    targetNodeId,
    branch,
    nodes,
    canon,
    constraints,
    prompt: promptBuilder.join("\n")
  };

  if (input.includeEdges) {
    result.warnings = warnings;
    result.edgeContext = edgeContext;
  }

  return result;
}
