import type { LlmAdapter, LlmRequest, LlmResponse, LlmModelHandle } from "./types.js";

export function createMockLlmAdapter(): LlmAdapter {
  return {
    provider: "mock",

    async health(): Promise<{ ok: boolean; message?: string }> {
      return { ok: true, message: "Mock LLM adapter ready." };
    },

    async listModels(): Promise<LlmModelHandle[]> {
      return [
        {
          id: "mock_default",
          provider: "mock",
          name: "deterministic-mock-model",
          tier: "fast",
          multimodal: false,
          temperatureDefault: 0,
        },
      ];
    },

    async generate(request: LlmRequest): Promise<LlmResponse> {
      const model = request.model || "mock_default";

      if (request.json === true) {
        // Identity-functor extension for semantic_parse: when the
        // caller is asking to extract JSON from a prompt (e.g. `onto
        // ingest` with a fixture file), look for an embedded JSON
        // object and return it verbatim. This mirrors the code_sketch
        // identity behavior below: for tests, mock = identity. For
        // other tasks, fall through to the original {ok, task, echo}
        // shape so legacy callers see the same wrapping they always
        // have.
        if (request.task === "semantic_parse") {
          const extracted = extractFirstJsonObject(request.prompt);
          if (extracted !== undefined) {
            return {
              text: JSON.stringify(extracted),
              json: extracted,
              model,
              provider: "mock",
            };
          }
        }

        const payload = {
          ok: true,
          task: request.task,
          echo: request.prompt,
        };

        return {
          text: JSON.stringify(payload),
          json: payload,
          model,
          provider: "mock",
        };
      }

      // For task=code_sketch the mock acts as the IDENTITY functor: it returns
      // the prompt verbatim, no [mock:...] prefix. This makes the mock provider
      // a degenerate-but-valid case of axiom 6 (compiler functor): one-node
      // compilation where the prompt IS the artifact. Real Ollama (or any
      // other provider) performs a non-identity transformation. Both are
      // mathematically valid functors. See examples/hello-world/ for the
      // canonical demo using this contract.
      if (request.task === "code_sketch") {
        return {
          text: request.prompt,
          model,
          provider: "mock",
        };
      }

      return {
        text: `[mock:${request.task}] ${request.prompt}`,
        model,
        provider: "mock",
      };
    },
  };
}

// Find the first balanced JSON object in `text`, parse it, and return
// the value. Returns undefined if no parseable JSON object is found.
// Used by the semantic_parse identity path so tests can fixture-drive
// `onto ingest` without a real LLM. Also strips a leading markdown
// fence (```json ... ```), which mirrors the production ingest
// command's fence stripper.
function extractFirstJsonObject(text: string): unknown {
  const stripped = text
    .replace(/```(?:json)?\s*/gi, "")
    .replace(/\s*```/g, "");
  // Scan for a top-level '{' and walk balanced braces, ignoring brace
  // characters inside string literals. This is a small heuristic —
  // good enough to extract a JSON fixture embedded in a larger
  // prompt; not a general JSON parser.
  for (let start = 0; start < stripped.length; start++) {
    if (stripped[start] !== "{") continue;
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < stripped.length; i++) {
      const ch = stripped[i];
      if (inString) {
        if (escape) {
          escape = false;
        } else if (ch === "\\") {
          escape = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(stripped.slice(start, i + 1));
          } catch {
            // Try the next '{' — this one was not a valid object.
            break;
          }
        }
      }
    }
  }
  return undefined;
}
