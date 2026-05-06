import { runCompilePlan, type CompilePlanRunResult } from "../../runtime/compile/compile-plan-runner.js";
import type { LlmProvider } from "../../runtime/llm/types.js";

export interface CompileFromWalkerOptions {
  focalId: string;
  provider?: LlmProvider;
  cwd?: string;
}

// Walker action: run the topological compile plan from inside the TUI.
// Mirrors `onto compile run <id>` but wraps it as an async helper the
// walker can kick off via useEffect. The walker stays interactive while
// each step dispatches.
export async function compileFromWalker(options: CompileFromWalkerOptions): Promise<CompilePlanRunResult> {
  return runCompilePlan({
    focalId: options.focalId,
    provider: options.provider,
    cwd: options.cwd,
  });
}
