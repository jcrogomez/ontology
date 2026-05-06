import type { LlmProvider } from "../../runtime/llm/types.js";

// Parses the tail of a walker command like ":run" or ":compile" into the
// triple (provider, model, ollamaHost) that the underlying actions accept.
//
// Without --model, `:compile ollama` falls through to the adapter's default
// model (`llama3.1:8b` today). On modest hardware that model does not finish
// before undici's 5-minute fetch timeout, so the walker is effectively
// unusable for ollama. The flag closes that gap; --host is included as a
// matched pair for completeness (OLLAMA_HOST env still works as a fallback).
//
// Grammar (loose, command-line style):
//
//   <empty>                          → provider=mock
//   <provider>                       → just the provider
//   <provider> --model <name>        → provider + model
//   <provider> --host <url>          → provider + host
//   <provider> --model <n> --host <h>  (any flag order)
//
// `<provider>` must be `mock` or `ollama` (the same restriction the
// dispatcher enforces). A leading `--flag` without a positional means
// provider=mock (e.g. `:run --model anything` is mock + ignored model).

export interface ProviderArgs {
  provider: LlmProvider;
  model?: string;
  ollamaHost?: string;
}

export type ParseProviderArgsResult =
  | { ok: true; args: ProviderArgs }
  | { ok: false; message: string };

export function parseProviderArgs(rest: string): ParseProviderArgsResult {
  const tokens = rest.trim() === "" ? [] : rest.trim().split(/\s+/);

  let provider: LlmProvider = "mock";
  let model: string | undefined;
  let ollamaHost: string | undefined;
  let i = 0;

  // Optional leading positional: the provider.
  if (tokens.length > 0 && !tokens[0].startsWith("--")) {
    const p = tokens[0];
    if (p !== "mock" && p !== "ollama") {
      return { ok: false, message: `unsupported provider: ${p} (try mock or ollama)` };
    }
    provider = p;
    i = 1;
  }

  while (i < tokens.length) {
    const tok = tokens[i];
    if (tok === "--model") {
      const v = tokens[i + 1];
      if (v === undefined || v.startsWith("--")) {
        return { ok: false, message: "--model requires a value" };
      }
      model = v;
      i += 2;
      continue;
    }
    if (tok === "--host") {
      const v = tokens[i + 1];
      if (v === undefined || v.startsWith("--")) {
        return { ok: false, message: "--host requires a value" };
      }
      ollamaHost = v;
      i += 2;
      continue;
    }
    return { ok: false, message: `unexpected argument: ${tok}` };
  }

  return { ok: true, args: { provider, model, ollamaHost } };
}
