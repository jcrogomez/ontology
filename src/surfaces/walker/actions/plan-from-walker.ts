import { loadEdges } from "../../../kernel/core/project/load.js";
import { computeCompilePlan, type CompilePlan } from "../../../kernel/graph/compile-plan.js";

export interface PlanFromWalkerOptions {
  focalId: string;
  cwd?: string;
}

// Walker action: synchronously compute the compile plan for the focal node.
// Pure thin wrapper around the kernel helper. Read-only — never writes the
// graph or emits events. The walker uses the result to render a preview
// panel (CompilePlanPanel).
export function planFromWalker(options: PlanFromWalkerOptions): CompilePlan {
  const cwd = options.cwd ?? process.cwd();
  const edges = loadEdges(cwd);
  return computeCompilePlan(options.focalId, edges);
}
