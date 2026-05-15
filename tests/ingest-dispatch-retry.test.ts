import { describe, it, expect } from "vitest";
import {
  RETRY_BACKOFF_MS,
  dispatchWithRetry,
  type DispatchFn,
} from "../src/commands/ingest/index.js";
import type { LlmResponse } from "../src/runtime/llm/types.js";

// Phase ε H3 — dispatchWithRetry should:
//   - call the dispatcher once (no sleep) on the first attempt
//   - retry up to RETRY_BACKOFF_MS.length total attempts with the
//     configured sleeps between failures
//   - return the response from whichever attempt succeeds
//   - throw the LAST error when every attempt fails
//
// Tests inject a counting stub dispatcher + an instant sleep so the
// suite runs in <10ms.

function fakeResponse(text: string): LlmResponse {
  return {
    text,
    json: { ok: true },
    model: "test",
    provider: "mock",
  };
}

describe("dispatchWithRetry", () => {
  it("returns on the first attempt when the dispatcher succeeds", async () => {
    let calls = 0;
    const dispatcher: DispatchFn = async () => {
      calls += 1;
      return fakeResponse("ok-first");
    };
    let sleepCalls = 0;
    const sleep = async () => {
      sleepCalls += 1;
    };
    const response = await dispatchWithRetry(
      { task: "semantic_parse", prompt: "x" },
      { provider: "mock" },
      dispatcher,
      sleep,
    );
    expect(response.text).toBe("ok-first");
    expect(calls).toBe(1);
    // First attempt has wait=0 so sleep is not invoked.
    expect(sleepCalls).toBe(0);
  });

  it("retries after a transient failure and returns on a later attempt", async () => {
    let calls = 0;
    const dispatcher: DispatchFn = async () => {
      calls += 1;
      if (calls < 2) throw new Error("fetch failed");
      return fakeResponse("ok-after-1-fail");
    };
    const sleeps: number[] = [];
    const sleep = async (ms: number) => {
      sleeps.push(ms);
    };
    const response = await dispatchWithRetry(
      { task: "semantic_parse", prompt: "x" },
      { provider: "mock" },
      dispatcher,
      sleep,
    );
    expect(response.text).toBe("ok-after-1-fail");
    expect(calls).toBe(2);
    // Exactly one sleep between attempt 1 and attempt 2.
    expect(sleeps).toEqual([RETRY_BACKOFF_MS[1]]);
  });

  it("uses each backoff slot in order across multiple failures", async () => {
    let calls = 0;
    const dispatcher: DispatchFn = async () => {
      calls += 1;
      if (calls < 3) throw new Error("fetch failed");
      return fakeResponse("ok-after-2-fails");
    };
    const sleeps: number[] = [];
    const sleep = async (ms: number) => {
      sleeps.push(ms);
    };
    const response = await dispatchWithRetry(
      { task: "semantic_parse", prompt: "x" },
      { provider: "mock" },
      dispatcher,
      sleep,
    );
    expect(response.text).toBe("ok-after-2-fails");
    expect(calls).toBe(3);
    expect(sleeps).toEqual([RETRY_BACKOFF_MS[1], RETRY_BACKOFF_MS[2]]);
  });

  it("throws the LAST error when every attempt fails", async () => {
    let calls = 0;
    const dispatcher: DispatchFn = async () => {
      calls += 1;
      throw new Error(`attempt-${calls}`);
    };
    const sleep = async () => undefined;
    await expect(
      dispatchWithRetry(
        { task: "semantic_parse", prompt: "x" },
        { provider: "mock" },
        dispatcher,
        sleep,
      ),
    ).rejects.toThrow(`attempt-${RETRY_BACKOFF_MS.length}`);
    expect(calls).toBe(RETRY_BACKOFF_MS.length);
  });

  it("preserves the deterministic-error final message when retries don't help", async () => {
    // Real-world case: invalid model name throws the same error every
    // time; retries don't recover. The wrapper surfaces it cleanly.
    const dispatcher: DispatchFn = async () => {
      throw new Error("invalid model: nope");
    };
    const sleep = async () => undefined;
    await expect(
      dispatchWithRetry(
        { task: "semantic_parse", prompt: "x" },
        { provider: "mock" },
        dispatcher,
        sleep,
      ),
    ).rejects.toThrow("invalid model: nope");
  });
});

describe("RETRY_BACKOFF_MS contract", () => {
  it("opens with 0 so the happy path has no latency overhead", () => {
    expect(RETRY_BACKOFF_MS[0]).toBe(0);
  });

  it("uses monotonically non-decreasing waits", () => {
    for (let i = 1; i < RETRY_BACKOFF_MS.length; i++) {
      expect(RETRY_BACKOFF_MS[i]).toBeGreaterThanOrEqual(RETRY_BACKOFF_MS[i - 1]);
    }
  });

  it("total backoff is bounded — pilot needs recovery not minutes of sleep", () => {
    const total = RETRY_BACKOFF_MS.reduce((a, b) => a + b, 0);
    expect(total).toBeLessThan(30_000); // under 30s
  });
});
