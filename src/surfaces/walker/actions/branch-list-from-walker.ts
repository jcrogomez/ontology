// Walker action: list distinct branches in the current network.
//
// Wraps `listBranches` from the fibration library (Bootstrap 0.9, PR #111)
// so the walker can render the branch projection without owning its own
// loader. The CLI surface for branches is still future work; until then
// this is the only entry point users have to the `BranchProjection` view.

import { loadNodes } from "../../../kernel/core/project/load.js";
import { listBranches } from "../../../runtime/fibration/branch-fiber.js";

export interface BranchListResult {
  ok: boolean;
  branches: string[];
  // The total node count surfaces alongside the branch list so the user can
  // sanity-check that branches account for every node. A common author
  // mistake is creating a node on the wrong branch — seeing the count helps.
  nodeCount: number;
  message?: string;
}

export function branchListFromWalker(cwd?: string): BranchListResult {
  try {
    const nodes = loadNodes(cwd);
    const branches = listBranches({ nodes, edges: [] });
    return { ok: true, branches, nodeCount: nodes.length };
  } catch (err: unknown) {
    return {
      ok: false,
      branches: [],
      nodeCount: 0,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
