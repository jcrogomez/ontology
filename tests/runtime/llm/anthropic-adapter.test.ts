import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createAnthropicAdapter } from "../../../src/runtime/llm/anthropic/adapter.js";
import { dispatchLlmRequest } from "../../../src/runtime/llm/dispatcher.js";

// Unit-level coverage for the Anthropic adapter wiring (Project Legend
// γ-0). These tests intentionally do not hit the network — the
// functional round-trip is exercised by the calibration in γ-2 against
// a real ANTHROPIC_API_KEY. Here we pin only:
//
//   1. Adapter construction refuses when no API key is reachable.
//   2. The dispatcher routes provider="anthropic" to the adapter, so a
//      missing key surfaces as the adapter's typed error rather than
//      "Unsupported LLM provider".
//
// Anthropic SDK calls go through `client.messages.create` and
// `client.models.list`; mocking those at the import level adds more
// indirection than the coverage justifies. The smoke test against the
// real API lives in the calibration script.

describe("createAnthropicAdapter", () => {
  let savedKey: string | undefined;

  beforeEach(() => {
    savedKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    if (savedKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = savedKey;
    }
  });

  it("throws a clear error when ANTHROPIC_API_KEY is missing and no apiKey option is passed", () => {
    expect(() => createAnthropicAdapter()).toThrow(/ANTHROPIC_API_KEY/);
  });

  it("constructs with an explicit apiKey option even when the env var is absent", () => {
    // We can't validate the key against the API without a real call,
    // but construction itself should succeed. The adapter only reaches
    // the network on health() / generate() / listModels().
    const adapter = createAnthropicAdapter({ apiKey: "sk-test-fake-not-real" });
    expect(adapter.provider).toBe("anthropic");
    expect(typeof adapter.generate).toBe("function");
    expect(typeof adapter.health).toBe("function");
    expect(typeof adapter.listModels).toBe("function");
  });

  it("dispatcher routes provider=anthropic to the adapter (typed-error surface, not unsupported)", async () => {
    // Without a key, the dispatcher should fail at adapter construction
    // — not with the generic 'Unsupported LLM provider' message that
    // the dispatcher emits for openai/local. This pins the route.
    await expect(
      dispatchLlmRequest(
        { task: "code_sketch", prompt: "ping" },
        { provider: "anthropic" },
      ),
    ).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });

  it("dispatcher with anthropicApiKey override skips the env check at construction time", async () => {
    // Pass a fake key — construction succeeds, the actual generate()
    // call will fail at network time with an auth error from the API.
    // We don't make the network call here; we just verify the
    // construction path does not throw 'ANTHROPIC_API_KEY missing'.
    // Since the request will hit the network we use a try/catch and
    // assert specifically that the failure mode is NOT the env-var
    // missing one.
    let caught: unknown;
    try {
      await dispatchLlmRequest(
        { task: "code_sketch", prompt: "ping" },
        { provider: "anthropic", anthropicApiKey: "sk-test-fake-not-real" },
      );
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
    const msg = caught instanceof Error ? caught.message : String(caught);
    expect(msg).not.toMatch(/ANTHROPIC_API_KEY/);
  });
});
