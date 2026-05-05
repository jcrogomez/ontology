import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";

describe("CLI: onto node link", () => {
  let projectDir: string;
  const cliPath = path.resolve(process.cwd(), "dist/cli.js");

  beforeAll(() => {
    // Build the project first to ensure dist/cli.js is available
    spawnSync("npm", ["run", "build"], { encoding: "utf8" });

    projectDir = createTempProject();
    spawnSync("node", [cliPath, "init"], { cwd: projectDir, encoding: "utf8" });

    // Create a node to link to
    spawnSync("node", [cliPath, "node", "create", "--level", "domain", "--kind", "definition", "--prompt", "Target node"], { cwd: projectDir, encoding: "utf8" });
  });

  afterAll(() => {
    cleanupTempProject(projectDir);
  });

  const getNodes = () => {
    const nodesDir = path.join(projectDir, ".ontology", "nodes");
    return fs.readdirSync(nodesDir).filter(f => f.endsWith(".json")).map(f => {
      return JSON.parse(fs.readFileSync(path.join(nodesDir, f), "utf8"));
    });
  };

  const getEdges = () => {
    const edgesPath = path.join(projectDir, ".ontology", "edges.jsonl");
    if (!fs.existsSync(edgesPath)) return [];
    return fs.readFileSync(edgesPath, "utf8").split("\n").filter(l => l.trim()).map(l => JSON.parse(l));
  };

  const getEvents = () => {
    const eventsPath = path.join(projectDir, ".ontology", "events.jsonl");
    return fs.readFileSync(eventsPath, "utf8").split("\n").filter(l => l.trim()).map(l => JSON.parse(l));
  };

  const getState = () => {
    const statePath = path.join(projectDir, ".ontology", "state.json");
    return JSON.parse(fs.readFileSync(statePath, "utf8"));
  };

  it("node link fails for missing from node", () => {
    const res = spawnSync("node", [cliPath, "node", "link", "--from", "node_missing", "--to", "node_0000_canon", "--type", "documents"], { cwd: projectDir, encoding: "utf8" });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("Source node not found");
  });

  it("node link fails for missing to node", () => {
    const res = spawnSync("node", [cliPath, "node", "link", "--from", "node_0000_canon", "--to", "node_missing", "--type", "documents"], { cwd: projectDir, encoding: "utf8" });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("Target node not found");
  });

  it("node link fails for invalid edge type", () => {
    const nodes = getNodes();
    const targetNode = nodes.find(n => n.id !== "node_0000_canon")!;
    const res = spawnSync("node", [cliPath, "node", "link", "--from", "node_0000_canon", "--to", targetNode.id, "--type", "invalid_type"], { cwd: projectDir, encoding: "utf8" });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("Invalid edge type");
  });

  it("node link creates typed edge", () => {
    const nodes = getNodes();
    const targetNode = nodes.find(n => n.id !== "node_0000_canon")!;

    const initialState = getState();
    const initialEdgeCount = initialState.edgeCount;
    const initialEventCount = initialState.eventCount;

    const res = spawnSync("node", [cliPath, "node", "link", "--from", "node_0000_canon", "--to", targetNode.id, "--type", "documents"], { cwd: projectDir, encoding: "utf8" });
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("ONTOLOGY EDGE CREATED");

    const edges = getEdges();
    expect(edges.length).toBe(initialEdgeCount + 1);

    const newEdge = edges[edges.length - 1];
    expect(newEdge.from).toBe("node_0000_canon");
    expect(newEdge.to).toBe(targetNode.id);
    expect(newEdge.type).toBe("documents");
    expect(newEdge.edgeId).toMatch(/^edge_[a-f0-9]{8}$/);
    expect(newEdge.integrity.hash).toBeDefined();

    // node link increments edgeCount, eventCount, and updates lastEventId
    const newState = getState();
    expect(newState.edgeCount).toBe(initialEdgeCount + 1);
    expect(newState.eventCount).toBe(initialEventCount + 1);
    expect(newState.lastEventId).toMatch(/^evt_[a-f0-9]{8}$/);
    expect(newState.lastEventId).toBe(newEdge.createdByEventId);
  });

  it("node link rejects duplicate edge", () => {
    const nodes = getNodes();
    const targetNode = nodes.find(n => n.id !== "node_0000_canon")!;

    const res = spawnSync("node", [cliPath, "node", "link", "--from", "node_0000_canon", "--to", targetNode.id, "--type", "documents"], { cwd: projectDir, encoding: "utf8" });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("Edge already exists");
  });

  it("node link appends edge_created event", () => {
    const nodes = getNodes();
    const targetNode = nodes.find(n => n.id !== "node_0000_canon")!;

    // Create a new distinct edge
    const res = spawnSync("node", [cliPath, "node", "link", "--from", targetNode.id, "--to", "node_0000_canon", "--type", "depends_on"], { cwd: projectDir, encoding: "utf8" });
    expect(res.status).toBe(0);

    const events = getEvents();
    const lastEvent = events[events.length - 1];
    expect(lastEvent.eventType).toBe("edge_created");
    expect(lastEvent.payload.action).toBe("edge_created");
    expect(lastEvent.payload.from).toBe(targetNode.id);
    expect(lastEvent.payload.to).toBe("node_0000_canon");
    expect(lastEvent.payload.type).toBe("depends_on");
    expect(lastEvent.payload.edgeId).toMatch(/^edge_[a-f0-9]{8}$/);
  });


  it("node link does not mutate existing nodes", () => {
    const nodes = getNodes();
    for (const node of nodes) {
      if (node.id === "node_0000_canon") {
        expect(node.graph.parentId).toBeNull();
      } else {
        expect(node.graph.parentId).toBe("node_0000_canon");
      }
      expect(node.id).toBeDefined();
    }
  });


  it("node link validates after creation", () => {
    const res = spawnSync("node", [cliPath, "validate"], { cwd: projectDir, encoding: "utf8" });
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("NETWORK KERNEL IS STABLE");
  });

  it("node link --json outputs parseable JSON", () => {
    const nodes = getNodes();
    const targetNode = nodes.find(n => n.id !== "node_0000_canon")!;

    const res = spawnSync("node", [cliPath, "node", "link", "--from", "node_0000_canon", "--to", targetNode.id, "--type", "mutates", "--json"], { cwd: projectDir, encoding: "utf8" });
    expect(res.status).toBe(0);

    const jsonOutput = JSON.parse(res.stdout);
    expect(jsonOutput.ok).toBe(true);
    expect(jsonOutput.edge).toBeDefined();
    expect(jsonOutput.edge.type).toBe("mutates");
    expect(jsonOutput.event).toBeDefined();
    expect(jsonOutput.event.eventType).toBe("edge_created");
  });
});
