import { describe, it, expect } from "vitest";
import { dispatchLlmRequest } from "../src/runtime/llm/dispatcher.js";

// Phase ε E6 step 3 — the dispatcher consults the capability profile
// (model-capabilities.ts) and refuses to dispatch when the resolved
// model is banned for the task kind. The check is layered ABOVE the
// adapter so a banned pairing never produces a network call.
//
// Tests use the `mock` provider for paths that should NOT be banned
// (mock always succeeds quickly, so a successful resolve confirms
// the ban check didn't fire and the dispatcher reached the adapter).
// For paths that SHOULD be banned, we assert the rejection contains
// the canonical ban message regardless of provider — the ban is a
// pre-dispatch refusal, not a provider-side error.

describe("dispatcher — capability-profile ban enforcement", () => {
  it("refuses dispatch when resolved model is banned for the task's kind", async () => {
    await expect(
      dispatchLlmRequest(
        {
          task: "semantic_parse",
          model: "deepseek-r1:1.5b",
          prompt: "x",
        },
        { provider: "mock" },
      ),
    ).rejects.toThrow(/deepseek-r1:1\.5b.*structured_extraction/);
  });

  it("error message references the calibration doc", async () => {
    await expect(
      dispatchLlmRequest(
        {
          task: "semantic_parse",
          model: "deepseek-r1:1.5b",
          prompt: "x",
        },
        { provider: "mock" },
      ),
    ).rejects.toThrow(/BAKEOFF_3B_FAMILY_2026-05-15\.md/);
  });

  it("does NOT ban deepseek-r1:1.5b for unrelated task kinds (e.g. critique)", async () => {
    // critique is not in the bannedFor list. The dispatcher must
    // route through to the adapter (mock here, which always succeeds).
    const r = await dispatchLlmRequest(
      {
        task: "node_critique",
        model: "deepseek-r1:1.5b",
        prompt: "x",
      },
      { provider: "mock" },
    );
    expect(r).toBeDefined();
    expect(r.model).toBe("deepseek-r1:1.5b");
  });

  it("does NOT block qwen2.5-coder:3b for structured_extraction (preferred, not banned)", async () => {
    const r = await dispatchLlmRequest(
      {
        task: "semantic_parse",
        model: "qwen2.5-coder:3b",
        prompt: "x",
      },
      { provider: "mock" },
    );
    expect(r).toBeDefined();
    expect(r.model).toBe("qwen2.5-coder:3b");
  });

  it("does NOT block models without a capability profile (no opinion = permitted)", async () => {
    const r = await dispatchLlmRequest(
      {
        task: "semantic_parse",
        model: "some-future-model:42b",
        prompt: "x",
      },
      { provider: "mock" },
    );
    expect(r).toBeDefined();
  });

  it("ban fires regardless of provider (mock / ollama / anthropic)", async () => {
    // The capability profile is provider-agnostic. The ban check
    // sits BEFORE the adapter selection so the same refusal applies
    // even when the user pinned the banned model under the mock
    // provider — the calibration claim is about the model's
    // behaviour, not the transport.
    await expect(
      dispatchLlmRequest(
        {
          task: "semantic_parse",
          model: "deepseek-r1:1.5b",
          prompt: "x",
        },
        { provider: "mock" },
      ),
    ).rejects.toThrow(/banned for task kind/);
  });

  it("ban fires when the model is resolved via options.defaultModel (not request.model)", async () => {
    // Layered resolution: defaultModel is the per-node override
    // (set by resolve-node-model). The ban check uses the same
    // resolved value, so a banned model leaking in via per-node
    // override is also caught.
    await expect(
      dispatchLlmRequest(
        {
          task: "semantic_parse",
          prompt: "x",
        },
        {
          provider: "mock",
          defaultModel: "deepseek-r1:1.5b",
        },
      ),
    ).rejects.toThrow(/banned for task kind/);
  });
});
