import { describe, it, expect } from "vitest";
import { detectAiProvider } from "../src/surfaces/walker/layout/ai-status-bar.js";

// Pure detection-logic coverage for the walker's AI status indicator.
// Render-level tests would require ink-testing-library plumbing for a
// component that's already trivial; the detection function is where
// the actual classification lives, so this is what we pin.

describe("detectAiProvider", () => {
  it("classifies as anthropic when ANTHROPIC_API_KEY is set", () => {
    expect(
      detectAiProvider({ ANTHROPIC_API_KEY: "sk-ant-abc" }),
    ).toEqual({ kind: "anthropic" });
  });

  it("anthropic takes priority over ollama when both env vars are set", () => {
    // The walker shows the highest-priority configured provider —
    // that's the one the registry default would route through in
    // most setups. Per-command --provider overrides this.
    expect(
      detectAiProvider({
        ANTHROPIC_API_KEY: "sk-ant-abc",
        OLLAMA_HOST: "http://127.0.0.1:11434",
      }),
    ).toEqual({ kind: "anthropic" });
  });

  it("ignores an empty ANTHROPIC_API_KEY", () => {
    // An exported-but-empty key (common when a `.env` is loaded
    // without a value) should not count as configured.
    expect(detectAiProvider({ ANTHROPIC_API_KEY: "" })).toEqual({
      kind: "none",
    });
  });

  it("classifies as ollama-local for localhost URLs", () => {
    expect(
      detectAiProvider({ OLLAMA_HOST: "http://localhost:11434" }),
    ).toEqual({ kind: "ollama-local", host: "http://localhost:11434" });
    expect(
      detectAiProvider({ OLLAMA_HOST: "http://127.0.0.1:11434" }),
    ).toEqual({ kind: "ollama-local", host: "http://127.0.0.1:11434" });
    expect(
      detectAiProvider({ OLLAMA_HOST: "127.0.0.1:11434" }),
    ).toEqual({ kind: "ollama-local", host: "127.0.0.1:11434" });
  });

  it("classifies as ollama-cloud for remote URLs", () => {
    expect(
      detectAiProvider({ OLLAMA_HOST: "https://ollama.my-team.example.com" }),
    ).toEqual({
      kind: "ollama-cloud",
      host: "https://ollama.my-team.example.com",
    });
    expect(
      detectAiProvider({ OLLAMA_HOST: "http://10.0.0.5:11434" }),
    ).toEqual({ kind: "ollama-cloud", host: "http://10.0.0.5:11434" });
  });

  it("returns none when neither env var is set", () => {
    expect(detectAiProvider({})).toEqual({ kind: "none" });
  });

  it("returns none when OLLAMA_HOST is empty string", () => {
    expect(detectAiProvider({ OLLAMA_HOST: "" })).toEqual({ kind: "none" });
  });
});
