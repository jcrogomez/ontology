import { assembleContext } from "../../runtime/context/assembler.js";

export async function contextAssembleCommand(
  nodeId: string,
  options: { json?: boolean; branch?: string; time?: string; mode?: string }
): Promise<void> {
  const cwd = process.cwd();

  const result = assembleContext({
    targetNodeId: nodeId,
    branch: options.branch,
    time: options.time ? parseInt(options.time, 10) : undefined,
    mode: options.mode as any
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
  console.log(` Target Prompt:`);
  console.log(`  ${nodes[nodes.length - 1].prompt.raw}`);
}
