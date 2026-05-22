import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import {
  OntologyEdgeSchema,
  OntologyEventSchema,
  OntologyNodeSchema,
  OntologyStateSchema,
} from "../src/schemas/ontology.js";

const CLI = path.resolve(__dirname, "..", "src", "cli.ts");
const REPO_ROOT = path.resolve(__dirname, "..");

// Tiny fixture: a 2-file source tree where a.ts imports b.ts, and a
// 3-node ontology where node_a / node_b have outputs.files[0] pointing
// at those files. The materializer should infer one depends_on edge and
// apply it cleanly.
function writeFixture(workRoot: string): {
  ontologyDir: string;
  sourceRoot: string;
} {
  const sourceRoot = path.join(workRoot, "src");
  fs.mkdirSync(sourceRoot, { recursive: true });
  fs.writeFileSync(
    path.join(sourceRoot, "a.ts"),
    "import { hello } from './b.js';\nexport const greeting = hello();\n",
    "utf-8",
  );
  fs.writeFileSync(
    path.join(sourceRoot, "b.ts"),
    "export function hello() { return 'hi'; }\n",
    "utf-8",
  );

  const ontologyDir = path.join(workRoot, ".ontology");
  fs.mkdirSync(path.join(ontologyDir, "nodes"), { recursive: true });

  const canon = {
    id: "node_0000_canon",
    label: "canon",
    kind: "canon",
    status: "draft",
    coordinates: {
      abstraction: "canon",
      time: 0,
      branch: "main",
      plane: "semantic",
      manifestation: "intent",
      domain: undefined,
    },
    inputs: [],
    prompt: { raw: "canon", variables: {}, language: "es" },
    model: { ref: "mock_default" },
    processors: { pre: [], post: [] },
    context: { requires: [], provides: [], forbids: [], optional: [] },
    graph: { parentId: null, orbitOf: null },
    rules: [],
    technical: {},
    outputs: { files: [] },
    validation: { errors: [], warnings: [] },
    integrity: {
      frozen: false,
      hash: "h:canon",
      schemaVersion: "0.1.0",
    },
  };
  const nodeA = {
    ...canon,
    id: "node_0001_a",
    label: "a",
    kind: "definition",
    coordinates: { ...canon.coordinates, abstraction: "unit", time: 1 },
    context: {
      requires: [],
      provides: [{ key: "greeting", nodeType: "definition" }],
      forbids: [],
      optional: [],
    },
    graph: { parentId: "node_0000_canon", orbitOf: null },
    outputs: { files: ["src/a.ts"] },
    integrity: { ...canon.integrity, hash: "h:a" },
  };
  const nodeB = {
    ...canon,
    id: "node_0002_b",
    label: "b",
    kind: "definition",
    coordinates: { ...canon.coordinates, abstraction: "unit", time: 2 },
    context: {
      requires: [],
      provides: [{ key: "hello", nodeType: "definition" }],
      forbids: [],
      optional: [],
    },
    graph: { parentId: "node_0000_canon", orbitOf: null },
    outputs: { files: ["src/b.ts"] },
    integrity: { ...canon.integrity, hash: "h:b" },
  };

  for (const n of [canon, nodeA, nodeB]) {
    fs.writeFileSync(
      path.join(ontologyDir, "nodes", `${n.id}.json`),
      JSON.stringify(n, null, 2),
      "utf-8",
    );
  }

  const initEvent = {
    eventId: "evt_init",
    sequence: 0,
    timestamp: "2026-01-01T00:00:00.000Z",
    eventType: "system_init",
    branch: "main",
    previousEventId: null,
    payload: {},
  };
  fs.writeFileSync(
    path.join(ontologyDir, "events.jsonl"),
    JSON.stringify(initEvent) + "\n",
    "utf-8",
  );
  fs.writeFileSync(path.join(ontologyDir, "edges.jsonl"), "", "utf-8");

  const state = {
    initialized: true,
    schemaVersion: "0.1.0",
    projectName: "fixture",
    rootNodeId: "node_0000_canon",
    activeBranch: "main",
    nodeCount: 3,
    edgeCount: 0,
    eventCount: 1,
    lastEventId: "evt_init",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  fs.writeFileSync(
    path.join(ontologyDir, "state.json"),
    JSON.stringify(state, null, 2),
    "utf-8",
  );

  return { ontologyDir, sourceRoot };
}

function runCli(args: string[], cwd: string): {
  stdout: string;
  stderr: string;
  status: number | null;
} {
  const result = spawnSync(
    "npx",
    ["tsx", CLI, ...args],
    {
      cwd,
      encoding: "utf-8",
      env: { ...process.env, FORCE_COLOR: "0" },
    },
  );
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status,
  };
}

describe("onto graph materialize-edges (CLI)", () => {
  let workRoot: string;

  beforeEach(() => {
    workRoot = fs.mkdtempSync(path.join(os.tmpdir(), "onto-materialize-"));
  });

  afterEach(() => {
    fs.rmSync(workRoot, { recursive: true, force: true });
  });

  it("clones the source ontology and applies the inferred edge", () => {
    const { ontologyDir, sourceRoot } = writeFixture(workRoot);
    const destDir = path.join(workRoot, ".ontology.with-edges");

    // Use REPO_ROOT as cwd so npx tsx finds the runtime; pass absolute
    // ontology paths so the fixture is self-contained.
    const result = runCli(
      [
        "graph",
        "materialize-edges",
        ontologyDir,
        destDir,
        "--source-root",
        sourceRoot,
        "--json",
      ],
      workRoot,
    );
    expect(result.status).toBe(0);

    const parsed = JSON.parse(result.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.summary.inferred).toBeGreaterThan(0);
    expect(parsed.summary.resolved).toBeGreaterThan(0);
    expect(parsed.summary.appliedEdges).toBe(parsed.summary.resolved);
    expect(parsed.summary.appliedEvents).toBe(parsed.summary.resolved);

    // The destination must be valid: state.json + edges.jsonl + events.jsonl
    // all parse, and the new edges show up.
    const state = OntologyStateSchema.parse(
      JSON.parse(fs.readFileSync(path.join(destDir, "state.json"), "utf-8")),
    );
    expect(state.edgeCount).toBe(parsed.summary.resolved);
    expect(state.eventCount).toBe(1 + parsed.summary.resolved);

    const edgeLines = fs
      .readFileSync(path.join(destDir, "edges.jsonl"), "utf-8")
      .split("\n")
      .filter((l) => l.trim().length > 0);
    expect(edgeLines.length).toBe(parsed.summary.resolved);
    for (const line of edgeLines) {
      OntologyEdgeSchema.parse(JSON.parse(line));
    }

    const eventLines = fs
      .readFileSync(path.join(destDir, "events.jsonl"), "utf-8")
      .split("\n")
      .filter((l) => l.trim().length > 0);
    expect(eventLines.length).toBe(1 + parsed.summary.resolved);
    for (const line of eventLines) {
      OntologyEventSchema.parse(JSON.parse(line));
    }

    // Nodes file count must be preserved unchanged.
    const nodeFiles = fs.readdirSync(path.join(destDir, "nodes"));
    expect(nodeFiles.length).toBe(3);
    for (const f of nodeFiles) {
      OntologyNodeSchema.parse(
        JSON.parse(
          fs.readFileSync(path.join(destDir, "nodes", f), "utf-8"),
        ),
      );
    }
  });

  it("refuses to clobber an existing destination", () => {
    const { ontologyDir, sourceRoot } = writeFixture(workRoot);
    const destDir = path.join(workRoot, ".ontology.with-edges");
    fs.mkdirSync(destDir);

    const result = runCli(
      [
        "graph",
        "materialize-edges",
        ontologyDir,
        destDir,
        "--source-root",
        sourceRoot,
        "--json",
      ],
      workRoot,
    );
    expect(result.status).not.toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toMatch(/already exists/);
  });

  it("does not mutate the source ontology dir", () => {
    const { ontologyDir, sourceRoot } = writeFixture(workRoot);
    const destDir = path.join(workRoot, ".ontology.with-edges");

    const sourceStateBefore = fs.readFileSync(
      path.join(ontologyDir, "state.json"),
      "utf-8",
    );
    const sourceEdgesBefore = fs.readFileSync(
      path.join(ontologyDir, "edges.jsonl"),
      "utf-8",
    );

    runCli(
      [
        "graph",
        "materialize-edges",
        ontologyDir,
        destDir,
        "--source-root",
        sourceRoot,
        "--json",
      ],
      workRoot,
    );

    expect(fs.readFileSync(path.join(ontologyDir, "state.json"), "utf-8")).toBe(
      sourceStateBefore,
    );
    expect(fs.readFileSync(path.join(ontologyDir, "edges.jsonl"), "utf-8")).toBe(
      sourceEdgesBefore,
    );
  });
});
