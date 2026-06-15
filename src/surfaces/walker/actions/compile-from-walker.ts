import { runCompilePlan, type CompilePlanRunResult } from "../../../forward/compile/compile-plan-runner.js";
import type { LlmProvider } from "../../../runtime/llm/types.js";

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
  // When true, after parse-validation the artifact is executed in a
  // subprocess with a wall-clock timeout. Non-zero exit / timeout produces
  // a runtime_failed step. Surfaces the same flag the CLI exposes as
  // `--runtime-check`. Off by default — running arbitrary LLM output is
  // an opt-in operational decision.
  runtimeCheck?: boolean;
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
    runtimeCheck: options.runtimeCheck,
    cwd: options.cwd,
  });
}
