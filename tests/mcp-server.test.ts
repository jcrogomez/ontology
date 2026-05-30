import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { ontologyTools, type OntologyTool } from "../src/runtime/mcp/tools.js";
import { createOntologyMcpServer } from "../src/runtime/mcp/server.js";
import { listPersistedRuns } from "../src/core/runs/persist.js";

const CLI_PATH = path.resolve(__dirname, "../dist/cli.js");

// Build a small deterministic fixture project via the compiled CLI (mock
// provider — no LLM). Mirrors the fixture pattern in context-cli.test.ts.
function run(dir: string, args: string[]) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], { cwd: dir, encoding: "utf8" });
}

function toolByName(name: string): OntologyTool {
  const tool = ontologyTools().find((t) => t.name === name);
  if (!tool) throw new Error(`tool not found: ${name}`);
  return tool;
}

describe("MCP server (read-only intent graph)", () => {
  let tempDir: string;
  let nodeId: string;

  beforeAll(() => {
    if (!fs.existsSync(CLI_PATH)) {
      throw new Error("dist/cli.js not found — run `npm run build` before this test.");
    }
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ontology-mcp-test-"));
    run(tempDir, ["init"]);
    const created = run(tempDir, [
      "node", "create",
      "--level", "domain",
      "--kind", "definition",
      "--prompt", "Greeting domain: say hello to the user",
    ]);
    const match = created.stdout.match(/Node:\s+(node_[a-f0-9]+)/);
    nodeId = match ? match[1] : "node_fail";
    run(tempDir, ["node", "link", "--from", "node_0000_canon", "--to", nodeId, "--type", "documents"]);
    // Persist one run so list_runs / verify_run have something to chew on.
    run(tempDir, ["run", "prompt", "--task", "code_sketch", "--prompt", "print('hi')", "--persist"]);
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // ── direct handler coverage ──────────────────────────────────────────────

  it("list_nodes returns the canon + created node", () => {
    const res = toolByName("list_nodes").handler({}, tempDir) as {
      count: number;
      nodes: Array<{ id: string }>;
    };
    expect(res.count).toBeGreaterThanOrEqual(2);
    const ids = res.nodes.map((n) => n.id);
    expect(ids).toContain("node_0000_canon");
    expect(ids).toContain(nodeId);
  });

  it("get_node returns the full node with its prompt", () => {
    const res = toolByName("get_node").handler({ nodeId }, tempDir) as {
      found: boolean;
      node: { id: string; prompt: { raw?: string } };
    };
    expect(res.found).toBe(true);
    expect(res.node.id).toBe(nodeId);
    expect(res.node.prompt.raw).toContain("Greeting domain");
  });

  it("get_node on a missing id returns found:false", () => {
    const res = toolByName("get_node").handler({ nodeId: "node_does_not_exist" }, tempDir) as {
      found: boolean;
    };
    expect(res.found).toBe(false);
  });

  it("inspect_node returns available:false when no translator was generated", () => {
    const res = toolByName("inspect_node").handler({ nodeId }, tempDir) as {
      available: boolean;
      reason?: string;
    };
    expect(res.available).toBe(false);
    expect(res.reason).toBe("no_translator");
  });

  it("query_nodes filters by kind", () => {
    const res = toolByName("query_nodes").handler({ kind: ["definition"] }, tempDir) as {
      count: number;
      nodes: Array<{ id: string }>;
    };
    expect(res.nodes.map((n) => n.id)).toContain(nodeId);
  });

  it("graph_neighbors finds the documents edge out of canon", () => {
    const res = toolByName("graph_neighbors").handler(
      { nodeId: "node_0000_canon", direction: "out" },
      tempDir,
    ) as { count: number; neighbors: Array<{ neighborId: string; edge: { type: string } }> };
    const hit = res.neighbors.find((n) => n.neighborId === nodeId);
    expect(hit).toBeDefined();
    expect(hit?.edge.type).toBe("documents");
  });

  it("assemble_context returns a prompt rooted at the target node", () => {
    const res = toolByName("assemble_context").handler({ nodeId }, tempDir) as {
      targetNodeId: string;
      prompt: string;
    };
    expect(res.targetNodeId).toBe(nodeId);
    expect(typeof res.prompt).toBe("string");
    expect(res.prompt.length).toBeGreaterThan(0);
  });

  it("list_runs and verify_run confirm a persisted run is intact", () => {
    const list = toolByName("list_runs").handler({}, tempDir) as {
      count: number;
      runs: Array<{ id: string }>;
    };
    expect(list.count).toBeGreaterThanOrEqual(1);
    const runId = list.runs[0].id;
    const verify = toolByName("verify_run").handler({ runId }, tempDir) as { ok: boolean };
    expect(verify.ok).toBe(true);
  });

  it("audit_log tails the event log", () => {
    const res = toolByName("audit_log").handler({ tail: 2 }, tempDir) as {
      total: number;
      returned: number;
    };
    expect(res.total).toBeGreaterThan(0);
    expect(res.returned).toBeLessThanOrEqual(2);
  });

  // ── end-to-end over an in-memory MCP transport ───────────────────────────

  it("exposes the tools over MCP and registers ZERO mutation tools", async () => {
    const server = createOntologyMcpServer(tempDir);
    const client = new Client({ name: "test-client", version: "0.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();

    // Every advertised tool is in the known read-only set…
    const readOnly = new Set([
      "list_nodes", "get_node", "inspect_node", "query_nodes", "assemble_context",
      "graph_neighbors", "graph_path", "graph_subgraph",
      "list_runs", "get_run", "verify_run", "audit_log",
    ]);
    for (const name of names) expect(readOnly.has(name)).toBe(true);

    // …and NO tool name hints at a mutation.
    const mutationVerbs = ["create", "update", "remove", "delete", "apply", "propose", "link", "compile", "ingest", "init"];
    for (const name of names) {
      for (const verb of mutationVerbs) expect(name).not.toContain(verb);
    }

    // A round-trip call returns parseable JSON.
    const result = await client.callTool({ name: "list_nodes", arguments: {} });
    const content = (result.content as Array<{ type: string; text: string }>)[0];
    const parsed = JSON.parse(content.text) as { count: number };
    expect(parsed.count).toBeGreaterThanOrEqual(2);

    await client.close();
    await server.close();
  });
});
