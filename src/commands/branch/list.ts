// `onto branch list` — read-only enumeration of the branches present in
// the project, with per-branch node counts.
//
// Wraps `listBranches` from the fibration library (PR #111). The walker
// surface `:branch list` already exposed this; the CLI was the gap. Edges
// are not consulted: a branch is defined by the existence of at least one
// node carrying that branch label (see branch-fiber.ts).

import { loadNodes } from "../../kernel/core/project/load.js";
import { listBranches } from "../../runtime/fibration/branch-fiber.js";

export interface BranchListOptions {
  json?: boolean;
}

export async function branchListCommand(options: BranchListOptions = {}): Promise<void> {
  const nodes = loadNodes();
  const branches = listBranches({ nodes, edges: [] });

  const counts = new Map<string, number>();
  for (const n of nodes) {
    const b = n.coordinates.branch;
    counts.set(b, (counts.get(b) ?? 0) + 1);
  }
  const rows = branches.map((name) => ({ name, nodeCount: counts.get(name) ?? 0 }));

  if (options.json) {
    console.log(JSON.stringify({ branches: rows, totalNodes: nodes.length }, null, 2));
    return;
  }

  console.log(`=== ONTOLOGY BRANCHES ===`);
  console.log("");
  console.log(`Branches: ${branches.length}   Total nodes: ${nodes.length}`);
  if (rows.length === 0) {
    console.log("");
    console.log(`(no branches yet — create a node with onto node create to register one)`);
    return;
  }
  console.log("");
  const nameWidth = Math.max(...rows.map((r) => r.name.length));
  for (const r of rows) {
    const padded = r.name.padEnd(nameWidth);
    const noun = r.nodeCount === 1 ? "node" : "nodes";
    console.log(`  ${padded}   ${r.nodeCount} ${noun}`);
  }
}
