// Fast-fail probe for a local Ollama daemon. Used by the live tests to
// decide skip-vs-run at collection time instead of stalling until the
// 30 s vitest timeout when the daemon is absent or mid-load.
//
// The probe hits `/api/tags` (cheap, never triggers a model load) with a
// short AbortSignal timeout, and returns the installed models so callers
// can pick a model that actually exists locally — never relying on the
// registry's preferred list being pulled on this machine.

export interface OllamaInstalledModel {
  name: string;
  /** Bytes on disk, as reported by /api/tags. */
  size: number;
}

export interface OllamaProbeResult {
  up: boolean;
  host: string;
  models: OllamaInstalledModel[];
}

export async function probeOllama(timeoutMs = 1500): Promise<OllamaProbeResult> {
  const host = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
  try {
    const res = await fetch(`${host}/api/tags`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return { up: false, host, models: [] };
    const body = (await res.json()) as {
      models?: Array<{ name?: unknown; size?: unknown }>;
    };
    const models = (body.models ?? [])
      .filter((m) => typeof m.name === "string")
      .map((m) => ({
        name: m.name as string,
        size: typeof m.size === "number" ? m.size : Number.MAX_SAFE_INTEGER,
      }));
    return { up: true, host, models };
  } catch {
    return { up: false, host, models: [] };
  }
}

/**
 * The cheapest LOCALLY-INSTALLED CHAT model — smallest on-disk size. On the
 * 8 GB reference machine this is what keeps the smoke fast and load-safe.
 *
 * Filters:
 *   - Embedding-only models (nomic-embed-text, bge, …) reject `/api/chat`
 *     with `does not support chat`; /api/tags does not expose capabilities,
 *     so filter them by name.
 *   - CLOUD models (`<name>:cloud` / `<name>-cloud`, surfaced once the user
 *     runs `ollama signin`) are NOT installed locally: /api/tags reports them
 *     with size 0, so they sort FIRST and would be picked — but they execute
 *     remotely (slow, metered) and some require a paid subscription (a real
 *     403 the live test hit). Exclude them by the cloud tag AND by size 0
 *     (not on disk) so the live test only ever routes to a model that is
 *     genuinely present locally.
 */
export function smallestInstalledModel(
  probe: OllamaProbeResult,
): string | undefined {
  return [...probe.models]
    .filter((m) => !/embed|bge|minilm/i.test(m.name))
    .filter((m) => !/[:-]cloud$/i.test(m.name) && m.size > 0)
    .sort((a, b) => a.size - b.size)[0]?.name;
}
