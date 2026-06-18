import { describe, it, expect } from "vitest";
import { smallestInstalledModel, type OllamaProbeResult } from "./helpers/ollama-probe.js";

// Unit tests for the live-test model picker. The cloud filter was added after
// `ollama signin` surfaced cloud models in /api/tags (size 0), which sorted
// first and made the live dispatcher test route to a subscription-gated cloud
// model (a real 403). REGEN_ORACLE_REFINE addendum.

const probe = (models: Array<{ name: string; size: number }>): OllamaProbeResult => ({
  up: true,
  host: "http://127.0.0.1:11434",
  models,
});

describe("smallestInstalledModel", () => {
  it("picks the smallest LOCAL model by on-disk size", () => {
    const pick = smallestInstalledModel(
      probe([
        { name: "qwen2.5-coder:7b", size: 4_680_000_000 },
        { name: "llama3.2:3b", size: 2_020_000_000 },
        { name: "qwen2.5-coder:3b", size: 1_930_000_000 },
      ]),
    );
    expect(pick).toBe("qwen2.5-coder:3b");
  });

  it("excludes embedding-only models", () => {
    const pick = smallestInstalledModel(
      probe([
        { name: "nomic-embed-text:latest", size: 270_000_000 },
        { name: "llama3.2:3b", size: 2_020_000_000 },
      ]),
    );
    expect(pick).toBe("llama3.2:3b");
  });

  it("excludes cloud models — they are not installed locally and may be gated", () => {
    // Cloud models report size 0 (not on disk) and sort first; they must NOT
    // be picked (remote, metered, sometimes subscription-only).
    const pick = smallestInstalledModel(
      probe([
        { name: "glm-5.2:cloud", size: 0 },
        { name: "qwen3-coder:480b-cloud", size: 0 },
        { name: "gpt-oss:120b-cloud", size: 0 },
        { name: "qwen2.5-coder:7b", size: 4_680_000_000 },
      ]),
    );
    expect(pick).toBe("qwen2.5-coder:7b");
  });

  it("returns undefined when only cloud / embedding models are present", () => {
    expect(
      smallestInstalledModel(
        probe([
          { name: "glm-5.2:cloud", size: 0 },
          { name: "nomic-embed-text:latest", size: 270_000_000 },
        ]),
      ),
    ).toBeUndefined();
  });
});
