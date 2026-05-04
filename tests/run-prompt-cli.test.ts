import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const CLI_PATH = join(__dirname, "../src/cli.ts");

function runCli(args: string[]) {
  return spawnSync("npx", ["tsx", CLI_PATH, ...args], { encoding: "utf-8" });
}

describe("onto run prompt", () => {
  it("onto run prompt works with mock", () => {
    const result = runCli([
      "run",
      "prompt",
      "--task",
      "semantic_parse",
      "--prompt",
      "Hello",
      "--provider",
      "mock",
    ]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("=== ONTOLOGY RUN PROMPT ===");
    expect(result.stdout).toContain("Task:      semantic_parse");
    expect(result.stdout).toContain("Provider:  mock");
    expect(result.stdout).toContain("Model:     mock_default");
    expect(result.stdout).toContain("[mock:semantic_parse] Hello");
  });

  it("onto run prompt --json outputs parseable JSON", () => {
    const result = runCli([
      "run",
      "prompt",
      "--task",
      "semantic_parse",
      "--prompt",
      "Hello",
      "--provider",
      "mock",
      "--json",
    ]);

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed).toEqual({
      response: {
        text: "[mock:semantic_parse] Hello",
        model: "mock_default",
        provider: "mock",
      },
    });
  });

  it("onto run prompt defaults to mock", () => {
    const result = runCli(["run", "prompt", "--task", "semantic_parse", "--prompt", "Hello"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Provider:  mock");
    expect(result.stdout).toContain("[mock:semantic_parse] Hello");
  });

  it("onto run prompt fails for unsupported provider", () => {
    const result = runCli([
      "run",
      "prompt",
      "--task",
      "semantic_parse",
      "--prompt",
      "Hello",
      "--provider",
      "openai",
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unsupported LLM provider: openai");
  });

  it("onto run prompt --provider ollama soft-fails or returns response", () => {
    const result = runCli([
      "run",
      "prompt",
      "--task",
      "semantic_parse",
      "--prompt",
      "Hello",
      "--provider",
      "ollama",
    ]);

    if (result.status === 0) {
      expect(result.stdout).toContain("=== ONTOLOGY RUN PROMPT ===");
      expect(result.stdout).toContain("Provider:  ollama");
    } else {
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("✖ Ollama unavailable:");
    }
  });

  it("onto run prompt --provider ollama --json soft-fails or returns parseable JSON", () => {
    const result = runCli([
      "run",
      "prompt",
      "--task",
      "semantic_parse",
      "--prompt",
      "Hello",
      "--provider",
      "ollama",
      "--json",
    ]);

    if (result.status === 0) {
      const parsed = JSON.parse(result.stdout.trim());
      expect(parsed.response.provider).toBe("ollama");
    } else {
      expect(result.status).toBe(1);
      const parsed = JSON.parse(result.stdout.trim());
      expect(parsed).toEqual({
        ok: false,
        provider: "ollama",
        error: expect.any(String),
      });
    }
  });

  it("onto run prompt passes --model to dispatcher", () => {
    const result = runCli([
      "run",
      "prompt",
      "--task",
      "semantic_parse",
      "--prompt",
      "Hello",
      "--provider",
      "ollama",
      "--model",
      "llama3:8b",
      "--json"
    ]);

    if (result.status === 0) {
      const parsed = JSON.parse(result.stdout.trim());
      expect(parsed.response.model).toBe("llama3:8b");
    } else {
      expect(result.status).toBe(1);
      const parsed = JSON.parse(result.stdout.trim());
      expect(parsed.ok).toBe(false);
      expect(parsed.provider).toBe("ollama");
    }
  });

  it("onto run prompt requires task", () => {
    const result = runCli(["run", "prompt", "--prompt", "Hello"]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("✖ Missing required option: --task");
  });

  it("onto run prompt requires prompt", () => {
    const result = runCli(["run", "prompt", "--task", "semantic_parse"]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("✖ Missing required option: --prompt");
  });
});
