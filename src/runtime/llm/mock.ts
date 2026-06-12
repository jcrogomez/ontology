import { createHash } from "node:crypto";
import type {
  LlmAdapter,
  LlmEmbedRequest,
  LlmEmbedResponse,
  LlmRequest,
  LlmResponse,
  LlmModelHandle,
} from "./types.js";

// Deterministic mock embedding: bag-of-words FEATURE HASHING. Each
// lowercase token hashes to one of MOCK_EMBED_DIM buckets; the vector
// counts bucket hits and is L2-normalised. Unlike a hash-of-the-whole-text
// (which would make every pair of texts unrelated), this preserves the one
// property the semantic index actually relies on: texts sharing vocabulary
// have high cosine similarity. That makes the full index → suggest →
// propose pipeline testable at $0 with meaningful assertions.
export const MOCK_EMBED_DIM = 64;

export function mockEmbedText(text: string): number[] {
  const vector = new Array<number>(MOCK_EMBED_DIM).fill(0);
  const tokens = text.toLowerCase().split(/[^a-z0-9_]+/).filter((t) => t.length > 0);
  for (const token of tokens) {
    const digest = createHash("sha256").update(token).digest();
    const bucket = digest.readUInt32BE(0) % MOCK_EMBED_DIM;
    vector[bucket] += 1;
  }
  const norm = Math.sqrt(vector.reduce((acc, v) => acc + v * v, 0));
  return norm === 0 ? vector : vector.map((v) => v / norm);
}

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

    async embed(request: LlmEmbedRequest): Promise<LlmEmbedResponse> {
      return {
        embeddings: request.input.map((text) => mockEmbedText(text)),
        model: request.model || "mock_embed",
        provider: "mock",
      };
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
