import type { LlmProvider } from "../../../runtime/llm/types.js";

// Parses the tail of `:workflow` into the options workflowFromWalker accepts.
//
// Grammar (command-line style, flags in any order):
//
//   <graphFile> --input <file> [provider] [--model <m>] [--host <h>] [--propose-update]
//
// The first positional is the graph file (required); a second positional, if
// it names a known provider, selects the dispatch provider (default mock —
// safe + offline, same default as :run/:compile). `--propose-update` routes
// an ACCEPTED run through the §3.6 path: node_update proposal on the focal.

export interface WorkflowArgs {
  graphFile: string;
  inputFile: string;
  provider?: LlmProvider;
  model?: string;
  ollamaHost?: string;
  proposeUpdate?: boolean;
}

export type ParseWorkflowArgsResult =
  | { ok: true; args: WorkflowArgs }
  | { ok: false; message: string };

const PROVIDERS = new Set(["mock", "ollama", "anthropic", "gemini"]);

export function parseWorkflowArgs(rest: string): ParseWorkflowArgsResult {
  const tokens = rest.trim() === "" ? [] : rest.trim().split(/\s+/);
  const positionals: string[] = [];
  let inputFile: string | undefined;
  let model: string | undefined;
  let ollamaHost: string | undefined;
  let proposeUpdate = false;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === "--input") {
      inputFile = tokens[++i];
      if (inputFile === undefined) return { ok: false, message: "--input needs a file path" };
      continue;
    }
    if (t === "--model") {
      model = tokens[++i];
      if (model === undefined) return { ok: false, message: "--model needs a name" };
      continue;
    }
    if (t === "--host") {
      ollamaHost = tokens[++i];
      if (ollamaHost === undefined) return { ok: false, message: "--host needs a url" };
      continue;
    }
    if (t === "--propose-update") {
      proposeUpdate = true;
      continue;
    }
    if (t.startsWith("--")) {
      return { ok: false, message: `unknown flag: ${t}` };
    }
    positionals.push(t);
  }

  if (positionals.length === 0) {
    return { ok: false, message: "usage: :workflow <graph.json> --input <file> [provider] [--model X] [--propose-update]" };
  }
  const graphFile = positionals[0];
  let provider: LlmProvider | undefined;
  if (positionals.length >= 2) {
    if (!PROVIDERS.has(positionals[1])) {
      return { ok: false, message: `unknown provider: ${positionals[1]} (expected mock, ollama, anthropic, or gemini)` };
    }
    provider = positionals[1] as LlmProvider;
  }
  if (positionals.length > 2) {
    return { ok: false, message: `unexpected argument: ${positionals[2]}` };
  }
  if (inputFile === undefined) {
    return { ok: false, message: "--input <file> is required" };
  }

  return {
    ok: true,
    args: {
      graphFile,
      inputFile,
      ...(provider !== undefined ? { provider } : {}),
      ...(model !== undefined ? { model } : {}),
      ...(ollamaHost !== undefined ? { ollamaHost } : {}),
      ...(proposeUpdate ? { proposeUpdate } : {}),
    },
  };
}
