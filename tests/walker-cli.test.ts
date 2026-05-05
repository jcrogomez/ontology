import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { runCli } from "./helpers/run-cli.js";

describe("onto walk CLI", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempProject();
    expect(runCli(tempDir, ["init"]).status).toBe(0);
  });

  afterEach(() => {
    cleanupTempProject(tempDir);
  });

  it("exits 1 with a clear message when the node does not exist", () => {
    const result = runCli(tempDir, ["walk", "node_does_not_exist"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Node not found");
  });

  it("exits 1 with a clear message when stdin is not a TTY (test env)", () => {
    // In the spawnSync test environment stdin is piped, never a TTY. The walker
    // refuses to mount and prints a message rather than hanging the test runner.
    const result = runCli(tempDir, ["walk", "node_0000_canon"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("interactive terminal");
  });
});
