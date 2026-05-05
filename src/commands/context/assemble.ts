import { assembleContext } from "../../runtime/context/assembler.js";
import { EdgeTypeSchema } from "../../schemas/ontology.js";

export async function contextAssembleCommand(
  nodeId: string,
  options: {
    json?: boolean;
    branch?: string;
    time?: string;
    mode?: string;
    includeEdges?: boolean;
    edgeTypes?: string;
  }
): Promise<void> {
  const cwd = process.cwd();

  let parsedEdgeTypes: string[] | undefined;
  if (options.edgeTypes) {
    parsedEdgeTypes = options.edgeTypes.split(",").map((s) => s.trim());
    for (const type of parsedEdgeTypes) {
      const parseResult = EdgeTypeSchema.safeParse(type);
      if (!parseResult.success) {
        console.error(`✖ Invalid edge type: ${type}`);
        process.exit(1);
      }
    }
  }

  const result = assembleContext({
    targetNodeId: nodeId,
    branch: options.branch,
    time: options.time ? parseInt(options.time, 10) : undefined,
    mode: options.mode as any,
    includeEdges: options.includeEdges,
    edgeTypes: parsedEdgeTypes as any
  }, cwd);

  if (options.json) {
    console.log(JSON.stringify({ context: result }, null, 2));
    return;
  }

  const { mode, branch, targetNodeId, canon, constraints, nodes } = result;

  console.log(`=== ONTOLOGY CONTEXT PACKAGE ===`);
  console.log(` Mode:    ${mode}`);
  console.log(` Branch:  ${branch}`);
  console.log(` Target:  ${targetNodeId}`);
  console.log(``);
  console.log(` Canon:`);
  console.log(`  ${canon}`);
  console.log(``);
  console.log(` Path:`);
  for (const node of nodes) {
    console.log(`  - ${node.id} :: ${node.label}`);
  }
  console.log(``);
  console.log(` Constraints:`);
  constraints.forEach((c, i) => {
    console.log(`  ${i + 1}. ${c}`);
  });
  console.log(``);

  if (result.edgeContext) {
    console.log(` Edge Context:`);
    console.log(`  Enabled: true`);
    console.log(`  Edges:   ${result.edgeContext.edges.length}`);
    console.log(`  Nodes:   ${result.edgeContext.nodeIds.length}`);
    console.log(``);
  }

  const targetNode = nodes.find(n => n.id === nodeId) || nodes[0];
  console.log(` Target Prompt:`);
  console.log(`  ${targetNode.prompt.raw}`);
}
