import type { OntologyNode, OntologyEdge } from "../../kernel/schemas/ontology.js";
import { loadNodeById, loadState, loadEdges } from "../../kernel/core/project/load.js";
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

  // Walk parentId pointers up to the canon. The seen set guards against malformed
  // graphs where someone introduced a cycle (which is itself a separate invariant
  // violation, but we refuse to loop forever waiting for it to be fixed).
  const nodes: OntologyNode[] = [targetNode];
  const seen = new Set<string>([targetNode.id]);
  let currentNode = targetNode;

  while (currentNode.graph.parentId !== null) {
    const parentId = currentNode.graph.parentId;
    if (seen.has(parentId)) {
      throw new Error(`Parent cycle detected at node ${parentId} while assembling context for ${targetNodeId}`);
    }
    const parentNode = loadNodeById(parentId, cwd);

    if (!parentNode) {
      throw new Error(`Missing ancestor node: ${parentId} required by ${currentNode.id}`);
    }

    if (parentNode.coordinates.branch && parentNode.coordinates.branch !== branch) {
      throw new Error(`Branch mismatch for node ${parentNode.id}: expected ${branch}, received ${parentNode.coordinates.branch}`);
    }

    seen.add(parentNode.id);
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

  // Structured contract — the requires/provides/forbids tokens that the
  // linker enforces post-generation. Surface them here so the LLM can see
  // the same contract the validator will judge it against, not only the
  // FORBID prose strings already covered by `Constraints:`. Nodes with an
  // empty contract are skipped to keep the prompt compact. The focal is
  // marked with `[target]` so the LLM knows whose contract it is producing.
  //
  // γ-7 (Project Legend signature-invariants pass): `provides` for the
  // FOCAL is rendered as a mandatory-export block separate from the
  // shared contract. The Vibe-Reasoning calibration surfaced that LLMs
  // were renaming captured provides (e.g. `solve_max_fooling_set` →
  // `max_fooling_set`) because "provides:" reads as a hint, not a
  // constraint. The directive language ("MUST export exactly these
  // names ... preserving the exact spelling") catches that class of
  // divergence at the prompt level.
  const contractLines: string[] = [];
  let focalMandatoryExports: string[] = [];
  for (const node of nodes) {
    const provides = (node.context?.provides ?? []).map((p) => p.key);
    const requires = (node.context?.requires ?? []).map((r) => r.source);
    const forbids = (node.context?.forbids ?? []).map((f) => f.source);
    if (node.id === targetNodeId && provides.length > 0) {
      focalMandatoryExports = provides;
    }
    if (provides.length === 0 && requires.length === 0 && forbids.length === 0) continue;
    const marker = node.id === targetNodeId ? " [target]" : "";
    contractLines.push(`- ${node.id}${marker}:`);
    if (provides.length > 0) contractLines.push(`    provides: ${provides.join(", ")}`);
    if (requires.length > 0) contractLines.push(`    requires: ${requires.join(", ")}`);
    if (forbids.length > 0) contractLines.push(`    forbids:  ${forbids.join(", ")}`);
  }
  if (contractLines.length > 0) {
    promptBuilder.push(`Contract (structured intent — enforced post-generation by the validator):`);
    promptBuilder.push(...contractLines);
    promptBuilder.push(``);
  }
  if (focalMandatoryExports.length > 0) {
    promptBuilder.push(`MANDATORY EXPORTS (signature invariants — γ-7):`);
    promptBuilder.push(
      `The compiled output MUST export every one of the following names, preserving the exact spelling. Do not rename, omit, or substitute. Renaming a mandatory export is a contract violation; the verify-homeomorphism gate will report it as divergent_structural.`,
    );
    for (const name of focalMandatoryExports) {
      promptBuilder.push(`  - ${name}`);
    }
    promptBuilder.push(``);
  }

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
