import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createTempProject, cleanupTempProject } from './helpers/temp-project.js';
import { nodeListCommand } from '../src/surfaces/commands/node/list.js';
import { nodeShowCommand } from '../src/surfaces/commands/node/show.js';
import { OntologyNode } from '../src/kernel/schemas/ontology.js';

describe('Node Observability Commands', () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tmpDir = createTempProject();
    originalCwd = process.cwd();
    process.chdir(tmpDir);

    // Mock console.log and console.error
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
      throw new Error(`Process exited with code ${code}`);
    });

    // Create minimal mock .ontology project
    const ontologyDir = path.join(tmpDir, '.ontology');
    fs.mkdirSync(ontologyDir);
    fs.writeFileSync(path.join(ontologyDir, 'state.json'), JSON.stringify({
      initialized: true,
      schemaVersion: "0.1.0",
      projectName: "Test Project",
      rootNodeId: "node_0000_canon",
      activeBranch: "main",
      nodeCount: 1,
      edgeCount: 0,
      eventCount: 0,
      lastEventId: "evt_0000",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }));

    const nodesDir = path.join(ontologyDir, 'nodes');
    fs.mkdirSync(nodesDir);

    const mockCanonNode: OntologyNode = {
      id: "node_0000_canon",
      label: "Ontology Mathematical Canon",
      kind: "canon",
      status: "frozen",
      coordinates: {
        abstraction: "canon",
        time: 0,
        branch: "main",
        plane: "semantic",
        manifestation: "intent"
      },
      inputs: [],
      prompt: { variables: {}, language: "es" },
      model: { ref: "mock_default" },
      processors: { pre: [], post: [] },
      context: {
        provides: [
          { key: "MathematicalCanon", nodeType: "canon" },
          { key: "CanonRules", nodeType: "canon" }
        ],
        requires: [],
        forbids: [],
        optional: []
      },
      graph: { parentId: null, orbitOf: null },
      rules: [
        "Ontology is a typed, temporal, directed graph enriched with a partial order of abstraction.",
        "Prompts act as rewrite rules that expand subgraphs."
      ],
      technical: {},
      outputs: { files: [] },
      validation: { errors: [], warnings: [] },
      integrity: {
        frozen: true,
        hash: "mock_hash_123",
        schemaVersion: "0.1.0"
      }
    };

    fs.writeFileSync(path.join(nodesDir, 'node_0000_canon.json'), JSON.stringify(mockCanonNode, null, 2));
  });

  afterEach(() => {
    process.chdir(originalCwd);
    cleanupTempProject(tmpDir);
    vi.restoreAllMocks();
  });

  it('nodeListCommand prints canon after init', async () => {
    await nodeListCommand();

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("ID"));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("node_0000_canon"));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("Ontology Mathematical Canon"));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("frozen"));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("canon"));
  });

  it('nodeListCommand prevents column concatenation for long values', async () => {
    // Create a node with long values that might concatenate
    const ontologyDir = path.join(tmpDir, '.ontology');
    const nodesDir = path.join(ontologyDir, 'nodes');

    const mockLongNode: OntologyNode = {
      id: "node_0001_long_id",
      label: "Long Node Label",
      kind: "definition",
      status: "draft",
      coordinates: {
        abstraction: "domain",
        time: 1,
        branch: "main",
        plane: "semantic",
        manifestation: "intent"
      },
      inputs: [],
      prompt: { variables: {}, language: "es" },
      model: { ref: "mock_default" },
      processors: { pre: [], post: [] },
      context: { provides: [], requires: [], forbids: [], optional: [] },
      graph: { parentId: "node_0000_canon", orbitOf: null },
      rules: [],
      technical: {},
      outputs: { files: [] },
      validation: { errors: [], warnings: [] },
      integrity: {
        frozen: false,
        hash: "mock_hash_456",
        schemaVersion: "0.1.0"
      }
    };

    fs.writeFileSync(path.join(nodesDir, 'node_0001_long_id.json'), JSON.stringify(mockLongNode, null, 2));

    await nodeListCommand();

    const logCalls = vi.mocked(console.log).mock.calls;
    const outputString = logCalls.map(args => args.join(' ')).join('\n');

    // After the visual rewrite columns are: ID Kind Level Status Manifestation Label.
    // Verify adjacent columns are separated by whitespace, not concatenated.
    expect(outputString).toMatch(/definition\s+domain/);
    expect(outputString).toMatch(/domain\s+draft/);
  });

  it('nodeListCommand json returns { nodes: [...] }', async () => {
    await nodeListCommand({ json: true });

    const logCall = vi.mocked(console.log).mock.calls[0][0];
    const parsed = JSON.parse(logCall as string);

    expect(parsed).toHaveProperty('nodes');
    expect(parsed.nodes).toHaveLength(1);
    expect(parsed.nodes[0]).toMatchObject({
      id: "node_0000_canon",
      label: "Ontology Mathematical Canon",
      kind: "canon",
      status: "frozen",
      abstraction: "canon",
      plane: "semantic",
      manifestation: "intent",
      time: 0,
      branch: "main"
    });
  });

  it('nodeShowCommand prints canon after init', async () => {
    await nodeShowCommand("node_0000_canon");

    // After the visual rewrite the output is a single Unicode-framed card
    // emitted via one `console.log` call. Assert the semantically-load-bearing
    // strings are present, not the legacy column padding.
    const allLogs = vi.mocked(console.log).mock.calls.map(c => c.join(' ')).join('\n');
    expect(allLogs).toContain("node_0000_canon");
    expect(allLogs).toContain("Ontology Mathematical Canon");
    expect(allLogs).toContain("canon");
    expect(allLogs).toContain("frozen");
    expect(allLogs).toContain("Provides");
    expect(allLogs).toContain("- MathematicalCanon");
    expect(allLogs).toContain("Rules");
    // Canon rules in the card must not carry a double "1. 1." prefix —
    // node show strips the leading "N." from each rule before printing.
    expect(allLogs).not.toMatch(/1\.\s+1\.\s+Ontology is a typed/);
  });

  it('nodeShowCommand json returns { node: ... }', async () => {
    await nodeShowCommand("node_0000_canon", { json: true });

    const logCall = vi.mocked(console.log).mock.calls[0][0];
    const parsed = JSON.parse(logCall as string);

    expect(parsed).toHaveProperty('node');
    expect(parsed.node.id).toBe("node_0000_canon");
    expect(parsed.node.kind).toBe("canon");
    expect(parsed.node.rules).toHaveLength(2);
  });

  it('nodeShowCommand missing node fails', async () => {
    await expect(nodeShowCommand("node_missing")).rejects.toThrow('Process exited with code 1');
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("✖ Node not found: node_missing"));
  });
});
