import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runCli } from "./helpers/run-cli.js";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";

describe("Observability System Full Flow", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanupTempProject(tmpDir);
  });

  // Split into smaller tests to prevent timeout due to multiple process spawnSync calls
  it("completes doctor phase", () => {
    const doctorBefore = runCli(tmpDir, ["doctor"]);
    expect(doctorBefore.status).toBe(0);
    expect(doctorBefore.stdout).toContain("Project not initialized. Run 'onto init'.");

    const doctorBeforeJson = runCli(tmpDir, ["doctor", "--json"]);
    expect(doctorBeforeJson.status).toBe(0);
    const parsedDoctorBefore = JSON.parse(doctorBeforeJson.stdout);
    expect(parsedDoctorBefore.checks.network.nodes).toBe(0);
  });

  it("completes inspect and validate phase", () => {
    const initRes = runCli(tmpDir, ["init"]);
    expect(initRes.status).toBe(0);

    const validateRes = runCli(tmpDir, ["validate"]);
    expect(validateRes.status).toBe(0);

    const inspectRes = runCli(tmpDir, ["inspect"]);
    expect(inspectRes.status).toBe(0);
    expect(inspectRes.stdout).toContain("Nodes:");
    expect(inspectRes.stdout).toContain("Network kernel initialized.");

    const inspectJsonRes = runCli(tmpDir, ["inspect", "--json"]);
    expect(inspectJsonRes.status).toBe(0);
    const parsedInspect = JSON.parse(inspectJsonRes.stdout);
    expect(parsedInspect.projectName).toBe("ontology-project");
    expect(parsedInspect.rootNodeId).toBe("node_0000_canon");
    expect(parsedInspect.nodeCount).toBeGreaterThan(0);
  });

  it("completes node and events phase", () => {
    const initRes = runCli(tmpDir, ["init"]);
    expect(initRes.status).toBe(0);

    const nodeListRes = runCli(tmpDir, ["node", "list"]);
    expect(nodeListRes.status).toBe(0);
    expect(nodeListRes.stdout).toContain("node_0000_canon");

    const nodeShowRes = runCli(tmpDir, ["node", "show", "node_0000_canon"]);
    expect(nodeShowRes.status).toBe(0);
    expect(nodeShowRes.stdout).toContain("node_0000_canon");

    const eventsTailRes = runCli(tmpDir, ["events", "tail"]);
    expect(eventsTailRes.status).toBe(0);
    expect(eventsTailRes.stdout).toContain("Sequence");
    expect(eventsTailRes.stdout).toContain("system_init");

    const eventsTailJsonRes = runCli(tmpDir, ["events", "tail", "--json"]);
    expect(eventsTailJsonRes.status).toBe(0);
    const parsedEventsTail = JSON.parse(eventsTailJsonRes.stdout);
    expect(parsedEventsTail.module).toBe("events tail");
    expect(Array.isArray(parsedEventsTail.events)).toBe(true);
    expect(parsedEventsTail.events.length).toBeGreaterThan(0);
  });
});
