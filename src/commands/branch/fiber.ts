// `onto branch fiber <name>` — render the Grothendieck fiber p^{-1}(b)
// of a given branch: the induced subgraph of nodes with
// `coordinates.branch === name`, together with the edges whose endpoints
// both live in that subgraph.
//
// Wraps `computeBranchFiber` (PR #111). Read-only; no proposal is created
// and no node is materialised. For the design of fibers and cartesian
// lifts see runtime/fibration/branch-fiber.ts.

import { loadNodes, loadEdges } from "../../core/project/load.js";
import {
  computeBranchFiber,
  listBranches,
} from "../../runtime/fibration/branch-fiber.js";

export interface BranchFiberOptions {
  json?: boolean;
}

export async function branchFiberCommand(
  name: string,
  options: BranchFiberOptions = {},
): Promise<void> {
  const nodes = loadNodes();
  const known = listBranches({ nodes, edges: [] });
  if (!known.includes(name)) {
    const hint = known.length > 0
      ? ` Known branches: ${known.join(", ")}.`
      : " The project has no branches yet.";
    failWith(`No such branch: "${name}".${hint}`, options.json);
    return;
  }

  const edges = loadEdges();
  const fiber = computeBranchFiber({ nodes, edges }, name);

  if (options.json) {
    console.log(JSON.stringify({
      branch: fiber.branch,
      size: fiber.size,
      nodes: fiber.nodes.map((n) => n.id),
      edges: fiber.edges.map((e) => ({
        edgeId: e.edgeId,
        type: e.type,
        from: e.from,
        to: e.to,
      })),
    }, null, 2));
    return;
  }

  console.log(`=== ONTOLOGY BRANCH FIBER ===`);
  console.log(`Branch:   ${fiber.branch}`);
  console.log(`Nodes:    ${fiber.size.nodes}`);
  console.log(`Edges:    ${fiber.size.edges}`);

  if (fiber.size.nodes > 0) {
    console.log("");
    console.log("Nodes:");
    for (const n of fiber.nodes) {
      console.log(`  ${n.id}`);
    }
  }
  if (fiber.size.edges > 0) {
    console.log("");
    console.log("Edges:");
    for (const e of fiber.edges) {
      console.log(`  ${e.from}  --[${e.type}]-->  ${e.to}`);
    }
  }
}

function failWith(msg: string, json?: boolean): void {
  if (json) {
    console.log(JSON.stringify({ ok: false, error: msg }));
  } else {
    console.error(`✖ ${msg}`);
  }
  process.exit(1);
}
