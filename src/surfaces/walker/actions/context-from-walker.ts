// Walker action: assemble the focal node's context (presheaf) and return
// the structured result for in-TUI display. Mirrors `onto run context`'s
// assembly path but stops short of dispatching to a model — purely a
// preview of "what does this node *see*".
//
// Surfaces the same `ContextAssemblyOutput` the dispatcher uses internally,
// so a future hardening pass can compare the walker's preview directly
// with the run record's contextHash for free.

import { assembleContext } from "../../../forward/context/assembler.js";
import type { ContextAssemblyOutput } from "../../../forward/context/types.js";

export interface ContextFromWalkerResult {
  ok: boolean;
  output?: ContextAssemblyOutput;
  message?: string;
}

export function contextFromWalker(focalId: string, cwd?: string): ContextFromWalkerResult {
  try {
    // The "strict" mode is what the dispatcher uses for `:run` — keep them
    // aligned so the preview matches what a real dispatch would assemble.
    const output = assembleContext({ targetNodeId: focalId, mode: "strict" }, cwd);
    return { ok: true, output };
  } catch (err: unknown) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
