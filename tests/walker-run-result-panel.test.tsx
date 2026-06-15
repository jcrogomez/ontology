import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { RunResultPanel } from "../src/surfaces/walker/layout/run-result-panel.js";

describe("RunResultPanel", () => {
  it("renders nothing when state is idle", () => {
    const { lastFrame } = render(<RunResultPanel state={{ kind: "idle" }} />);
    // The component returns null; ink emits an empty frame.
    expect(lastFrame() ?? "").toBe("");
  });

  it("renders a 'dispatching' indicator while running", () => {
    const { lastFrame } = render(<RunResultPanel state={{ kind: "running", provider: "mock" }} />);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("RUN");
    expect(frame).toContain("dispatching to mock");
  });

  it("renders the result with runId, model metadata, and response text", () => {
    const { lastFrame } = render(
      <RunResultPanel
        state={{
          kind: "result",
          runId: "run_abcdef01",
          cached: false,
          provider: "mock",
          model: "mock_default",
          responseText: "the canonical answer",
          durationMs: 12,
        }}
      />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("RUN — run_abcdef01");
    expect(frame).toContain("mock_default");
    expect(frame).toContain("the canonical answer");
    expect(frame).toContain("12ms");
  });

  it("flags cached results", () => {
    const { lastFrame } = render(
      <RunResultPanel
        state={{
          kind: "result",
          runId: "run_abcdef01",
          cached: true,
          provider: "mock",
          model: "mock_default",
          responseText: "x",
          durationMs: 0,
        }}
      />,
    );
    expect(lastFrame() ?? "").toContain("(cached)");
  });

  it("renders an error panel in red on failure", () => {
    const { lastFrame } = render(
      <RunResultPanel state={{ kind: "error", message: "ollama unavailable: connect refused" }} />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("RUN — error");
    expect(frame).toContain("ollama unavailable");
  });

  it("truncates very long responses to 500 chars + ellipsis", () => {
    const long = "x".repeat(600);
    const { lastFrame } = render(
      <RunResultPanel
        state={{
          kind: "result",
          runId: "run_abcdef01",
          cached: false,
          provider: "mock",
          model: "mock_default",
          responseText: long,
          durationMs: 1,
        }}
      />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("..."); // truncation marker
    // The full 600-char string should not be present.
    expect(frame.includes("x".repeat(600))).toBe(false);
  });
});
