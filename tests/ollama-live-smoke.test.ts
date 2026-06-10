import { describe, it, expect } from "vitest";

import { dispatchLlmRequest } from "../src/runtime/llm/dispatcher.js";
import { createOllamaAdapter } from "../src/runtime/llm/ollama/adapter.js";
import {
  probeOllama,
  smallestInstalledModel,
  type OllamaProbeResult,
} from "./helpers/ollama-probe.js";

// Live smoke against a LOCAL Ollama daemon — the $0 mitigation for "adapter
// regressions only surface in manual runs" (CI is mock-only by design; a
// live generation is infeasible there). Opt-in by environment variable:
//
//   npm run test:smoke:ollama        # sets ONTOLOGY_LIVE_OLLAMA=1
//
// Semantics of the gate:
//   - ONTOLOGY_LIVE_OLLAMA unset  → the whole suite SKIPS (regular `vitest
//     run` and CI never touch the network).
//   - ONTOLOGY_LIVE_OLLAMA=1      → opting in means you EXPECT Ollama up:
//     an unreachable daemon is a loud failure, not a skip. The probe
//     fast-fails in 1.5 s instead of stalling to the vitest timeout.
//
// Scope: daemon reachability, adapter health(), model discovery, and ONE
// real end-to-end generation through dispatchLlmRequest with the smallest
// installed model. Deliberately no JSON-mode assertion — 7B-class JSON is
// known-flaky (~50%, see ROADMAP) and would make a weekly smoke noisy.

const GATED_IN = process.env.ONTOLOGY_LIVE_OLLAMA === "1";
const probe: OllamaProbeResult = GATED_IN
  ? await probeOllama()
  : { up: false, host: "(not probed)", models: [] };

describe.skipIf(!GATED_IN)("Ollama live smoke (ONTOLOGY_LIVE_OLLAMA=1)", () => {
  it("daemon answers /api/tags within 1.5s", () => {
    expect(
      probe.up,
      `Ollama did not answer at ${probe.host} — is the daemon running? (ollama serve)`,
    ).toBe(true);
  });

  it.skipIf(!probe.up)("at least one model is installed", () => {
    expect(
      probe.models.length,
      `No models installed at ${probe.host} — pull one, e.g. \`ollama pull qwen2.5-coder:3b\``,
    ).toBeGreaterThan(0);
  });

  it.skipIf(!probe.up)("adapter health() reports ok", async () => {
    const adapter = createOllamaAdapter();
    const health = await adapter.health!();
    expect(health.ok, health.message ?? "").toBe(true);
  });

  it.skipIf(!probe.up)("adapter listModels() discovers the installed models", async () => {
    const adapter = createOllamaAdapter();
    const models = await adapter.listModels!();
    expect(models.length).toBe(probe.models.length);
    const names = models.map((m) => m.name).sort();
    expect(names).toEqual(probe.models.map((m) => m.name).sort());
    for (const m of models) {
      expect(m.provider).toBe("ollama");
    }
  });

  it.skipIf(!probe.up || smallestInstalledModel(probe) === undefined)(
    "end-to-end dispatch: one real generation returns non-empty text",
    async () => {
      const model = smallestInstalledModel(probe)!;
      const response = await dispatchLlmRequest(
        {
          task: "semantic_parse",
          prompt: "Reply with exactly one word: pong",
          model,
          temperature: 0,
          maxTokens: 16,
        },
        { provider: "ollama" },
      );
      expect(response.provider).toBe("ollama");
      expect(response.text.trim().length).toBeGreaterThan(0);
      expect(response.usage?.evalDurationMs).toBeGreaterThan(0);
    },
    // Cold model load on the 8 GB reference machine can take minutes;
    // the point is catching adapter regressions, not benchmarking.
    300_000,
  );
});
