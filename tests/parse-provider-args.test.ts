import { describe, it, expect } from "vitest";
import { parseProviderArgs } from "../src/walker/state/parse-provider-args.js";

describe("parseProviderArgs", () => {
  describe("happy paths", () => {
    it("empty input → mock with no model/host", () => {
      const r = parseProviderArgs("");
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.args).toEqual({ provider: "mock" });
      }
    });

    it("just `mock` → mock with no model/host", () => {
      const r = parseProviderArgs("mock");
      expect(r).toEqual({ ok: true, args: { provider: "mock" } });
    });

    it("just `ollama` → ollama with no model/host", () => {
      const r = parseProviderArgs("ollama");
      expect(r).toEqual({ ok: true, args: { provider: "ollama" } });
    });

    it("ollama with --model", () => {
      const r = parseProviderArgs("ollama --model llama3.2:3b");
      expect(r).toEqual({ ok: true, args: { provider: "ollama", model: "llama3.2:3b" } });
    });

    it("ollama with --host", () => {
      const r = parseProviderArgs("ollama --host http://10.0.0.1:11434");
      expect(r).toEqual({ ok: true, args: { provider: "ollama", ollamaHost: "http://10.0.0.1:11434" } });
    });

    it("ollama with --model and --host (both orders)", () => {
      const a = parseProviderArgs("ollama --model llama3.2:3b --host http://x:11434");
      const b = parseProviderArgs("ollama --host http://x:11434 --model llama3.2:3b");
      expect(a).toEqual({ ok: true, args: { provider: "ollama", model: "llama3.2:3b", ollamaHost: "http://x:11434" } });
      expect(b).toEqual({ ok: true, args: { provider: "ollama", model: "llama3.2:3b", ollamaHost: "http://x:11434" } });
    });

    it("flags without a leading provider default to mock", () => {
      const r = parseProviderArgs("--model anything");
      expect(r).toEqual({ ok: true, args: { provider: "mock", model: "anything" } });
    });

    it("tolerates extra whitespace and tabs", () => {
      const r = parseProviderArgs("   ollama   --model   llama3.2:3b   ");
      expect(r).toEqual({ ok: true, args: { provider: "ollama", model: "llama3.2:3b" } });
    });

    it("preserves leading whitespace from cmd.slice(...) on the empty case", () => {
      // Walker calls parseProviderArgs(cmd.slice("compile".length)), which for
      // bare ":compile" is the empty string and for ":compile " is " ".
      expect(parseProviderArgs(" ")).toEqual({ ok: true, args: { provider: "mock" } });
    });
  });

  describe("rejections", () => {
    it("rejects an unknown provider with a helpful message", () => {
      const r = parseProviderArgs("openai");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toMatch(/unsupported provider: openai/);
    });

    it("rejects --model without a value", () => {
      const r = parseProviderArgs("ollama --model");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toMatch(/--model requires a value/);
    });

    it("rejects --model immediately followed by another flag", () => {
      const r = parseProviderArgs("ollama --model --host x");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toMatch(/--model requires a value/);
    });

    it("rejects --host without a value", () => {
      const r = parseProviderArgs("ollama --host");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toMatch(/--host requires a value/);
    });

    it("rejects unknown flags", () => {
      const r = parseProviderArgs("ollama --temperature 0.7");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toMatch(/unexpected argument/);
    });

    it("rejects extra positional arguments", () => {
      const r = parseProviderArgs("ollama llama3.2:3b");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toMatch(/unexpected argument: llama3\.2:3b/);
    });
  });
});
