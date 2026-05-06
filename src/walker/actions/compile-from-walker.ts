import { runCompilePlan, type CompilePlanRunResult } from "../../runtime/compile/compile-plan-runner.js";
import type { LlmProvider } from "../../runtime/llm/types.js";

export interface CompileFromWalkerOptions {
  focalId: string;
  provider?: LlmProvider;
  // Optional model override. When omitted with provider=ollama, the adapter
  // falls back to its default (`llama3.1:8b`) which is slow on modest
  // hardware — pick `llama3.2:3b` or similar from the walker.
  model?: string;
  // Optional ollama host. Falls through to OLLAMA_HOST env then the adapter
  // default (http://127.0.0.1:11434).
  ollamaHost?: string;
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
    model: options.model,
    ollamaHost: options.ollamaHost,
    cwd: options.cwd,
  });
}
