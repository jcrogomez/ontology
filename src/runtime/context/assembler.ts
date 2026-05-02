import { OntologyNode } from "../../schemas/ontology.js";
import { loadNodeById } from "../../core/project/load.js";
import { ContextAssemblyInput, ContextAssemblyOutput } from "./types.js";

function cleanPrefix(text: string): string {
  return text.replace(/^\d+\.\s*/, "");
}

export function assembleContext(input: ContextAssemblyInput, cwd = process.cwd()): ContextAssemblyOutput {
  const mode = input.mode || "strict";

  if (mode !== "strict") {
    throw new Error(`Unsupported context assembly mode: ${mode}`);
  }

  const targetNodeId = input.targetNodeId;
  const targetNode = loadNodeById(targetNodeId, cwd);

  if (!targetNode) {
    throw new Error(`Target node not found: ${targetNodeId}`);
  }

  const branch = input.branch || targetNode.coordinates.branch || "main";

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

  // Reverse to get topological order: canon -> ...ancestors -> target
  nodes.reverse();

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
  promptBuilder.push(`Target Prompt:`);
  promptBuilder.push(targetNode.prompt.raw || "");

  return {
    mode: "strict",
    targetNodeId,
    branch,
    nodes,
    canon,
    constraints,
    prompt: promptBuilder.join("\n")
  };
}
