import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";

describe("Model CLI commands", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempProject();
  });

  afterEach(() => {
    cleanupTempProject(tempDir);
  });

  const runCli = (args: string[]) => {
    const cliPath = path.resolve(__dirname, "../dist/cli.js");
    return spawnSync(process.execPath, [cliPath, ...args], {
      cwd: tempDir,
      encoding: "utf-8",
      env: { ...process.env, OLLAMA_HOST: "" } // ensure not running a real ollama unexpectedly if we want to simulate unavailable, but wait, the tests shouldn't require Ollama running so it doesn't matter, we let it fail or succeed
    });
  };

  it("onto model doctor works before init", () => {
    const res = runCli(["model", "doctor"]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("=== ONTOLOGY MODEL DOCTOR ===");
    expect(res.stdout).toContain("registry.json: missing");
    expect(res.stdout).toContain("mock:");
    expect(res.stdout).toContain("available");
    expect(res.stdout).toContain("ollama:");
  });

  it("onto model doctor --json outputs parseable JSON before init", () => {
    const res = runCli(["model", "doctor", "--json"]);
    expect(res.status).toBe(0);
    const parsed = JSON.parse(res.stdout);
    expect(parsed.registry.modelsRegistryPath).toBe("missing");
    expect(parsed.providers.mock.available).toBe(true);
    expect(parsed.status.modelRuntimeObservable).toBe(true);
  });

  it("onto model doctor works after init", () => {
    runCli(["init"]);
    const res = runCli(["model", "doctor"]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("=== ONTOLOGY MODEL DOCTOR ===");
    expect(res.stdout).toContain("registry.json: found");
    expect(res.stdout).toContain("modelCount: ");
  });

  it("onto model list reads registry after init", () => {
    runCli(["init"]);
    const res = runCli(["model", "list"]);
    expect(res.status).toBe(0);
    // There might not be models in init but it shouldn't fail
    // If there are default models they will be listed
  });

  it("onto model list --json outputs parseable JSON", () => {
    runCli(["init"]);
    const res = runCli(["model", "list", "--json"]);
    expect(res.status).toBe(0);
    const parsed = JSON.parse(res.stdout);
    expect(Array.isArray(parsed.models)).toBe(true);
  });

  it("onto model list --provider mock works before init", () => {
    const res = runCli(["model", "list", "--provider", "mock"]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("mock_default");
    expect(res.stdout).toContain("deterministic-mock-model");
  });

  it("onto model list --provider mock --json outputs parseable JSON", () => {
    const res = runCli(["model", "list", "--provider", "mock", "--json"]);
    expect(res.status).toBe(0);
    const parsed = JSON.parse(res.stdout);
    expect(Array.isArray(parsed.models)).toBe(true);
    expect(parsed.models[0].id).toBe("mock_default");
  });

  it("onto model list --provider ollama soft-fails or returns models", () => {
    const res = runCli(["model", "list", "--provider", "ollama"]);
    if (res.status === 0) {
      // Ollama is running
      expect(res.stdout.length).toBeGreaterThan(0);
    } else {
      // Ollama not running
      expect(res.status).toBe(1);
      expect(res.stderr).toContain("Ollama unavailable:");
    }
  });

  it("onto model list --provider ollama --json soft-fails or returns parseable JSON", () => {
    const res = runCli(["model", "list", "--provider", "ollama", "--json"]);
    if (res.status === 0) {
      const parsed = JSON.parse(res.stdout);
      expect(Array.isArray(parsed.models)).toBe(true);
    } else {
      expect(res.status).toBe(1);
      const parsed = JSON.parse(res.stdout);
      expect(parsed.available).toBe(false);
      expect(parsed.provider).toBe("ollama");
      expect(Array.isArray(parsed.models)).toBe(true);
    }
  });
});
