import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runCli } from "./helpers/run-cli.js";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";

describe("CLI Observability", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanupTempProject(tmpDir);
  });

  it("onto doctor works before init", () => {
    const result = runCli(tmpDir, ["doctor"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Project not initialized");
  });

  it("onto doctor --json outputs parseable JSON before init", () => {
    const result = runCli(tmpDir, ["doctor", "--json"]);
    expect(result.status).toBe(0);
    expect(() => JSON.parse(result.stdout)).not.toThrow();
    const parsed = JSON.parse(result.stdout);
    expect(parsed.module).toBe("doctor");
    expect(parsed.checks.network.nodes).toBe(0);
  });

  describe("after init", () => {
    beforeEach(() => {
      const initResult = runCli(tmpDir, ["init"]);
      expect(initResult.status).toBe(0);
    });

    it("onto doctor works after init", () => {
      const result = runCli(tmpDir, ["doctor"]);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Developer observability ready.");
      expect(result.stdout).toContain("Nodes:");
    });

    it("onto inspect --json outputs parseable JSON", () => {
      const result = runCli(tmpDir, ["inspect", "--json"]);
      expect(result.status).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
      const parsed = JSON.parse(result.stdout);
      expect(parsed).toHaveProperty("nodeCount");
      expect(parsed).toHaveProperty("eventCount");
    });

    it("onto node list works after init", () => {
      const result = runCli(tmpDir, ["node", "list"]);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("ID");
      expect(result.stdout).toContain("node_0000_canon");
    });

    it("onto node list --json outputs parseable JSON", () => {
      const result = runCli(tmpDir, ["node", "list", "--json"]);
      expect(result.status).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
      const parsed = JSON.parse(result.stdout);
      expect(parsed).toHaveProperty("nodes");
      expect(Array.isArray(parsed.nodes)).toBe(true);
      expect(parsed.nodes.length).toBeGreaterThan(0);
    });

    it("onto node show node_0000_canon works after init", () => {
      const result = runCli(tmpDir, ["node", "show", "node_0000_canon"]);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("ID:");
      expect(result.stdout).toContain("node_0000_canon");
    });

    it("onto node show node_0000_canon --json outputs parseable JSON", () => {
      const result = runCli(tmpDir, ["node", "show", "node_0000_canon", "--json"]);
      expect(result.status).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
      const parsed = JSON.parse(result.stdout);
      expect(parsed).toHaveProperty("node");
      expect(parsed.node.id).toBe("node_0000_canon");
    });

    it("onto events tail works after init", () => {
      const result = runCli(tmpDir, ["events", "tail"]);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Sequence");
      expect(result.stdout).toContain("system_init");
    });

    it("onto events tail --json outputs parseable JSON", () => {
      const result = runCli(tmpDir, ["events", "tail", "--json"]);
      expect(result.status).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
      const parsed = JSON.parse(result.stdout);
      expect(parsed.module).toBe("events tail");
      expect(Array.isArray(parsed.events)).toBe(true);
    });
  });
});
