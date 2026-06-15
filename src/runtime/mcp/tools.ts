// Read-only MCP tool handlers over the intent graph.
//
// Each tool is a thin wrapper around an existing PURE read function from the
// kernel/runtime — no new domain logic lives here. The whole surface is
// read-only by construction: there is intentionally NO tool that creates a
// node, stages a proposal, applies a mutation, or compiles. This mirrors the
// canon's "models may speak; only explicit graph commands may mutate" rule —
// an MCP client (a reviewer, or another model) can READ the declared intent to
// judge whether it is benign or clumsy, but cannot change the graph.
//
// Handlers take (args, cwd) and return plain JSON-serialisable data, or throw.
// The server factory (server.ts) wraps each handler: a thrown error becomes a
// tool result with isError=true rather than crashing the process.

import { z } from "zod";
import {
  loadNodes,
  loadNodeById,
  loadEdges,
  loadEvents,
} from "../../kernel/core/project/load.js";
import {
  listPersistedRuns,
  loadPersistedRun,
  verifyPersistedRun,
} from "../../kernel/core/runs/persist.js";
import { queryNodes } from "../query/representable.js";
import { QueryShapeSchema, type QueryShape } from "../query/types.js";
import {
  getNeighbors,
  findShortestPath,
  extractSubgraph,
  type EdgeDirection,
} from "../../kernel/graph/traversal.js";
import { assembleContext } from "../../forward/context/assembler.js";
import { checkTranslatorCache } from "../legend/translator.js";
import { EdgeTypeSchema, type OntologyNode, type OntologyEdge } from "../../kernel/schemas/ontology.js";

// A registrable tool definition. `inputShape` is a Zod raw shape (object of
// field schemas) consumed directly by McpServer.registerTool; the SDK builds
// the JSON Schema advertised to clients and parses incoming args from it.
export interface OntologyTool {
  name: string;
  title: string;
  description: string;
  inputShape: z.ZodRawShape;
  handler: (args: Record<string, unknown>, cwd: string) => unknown;
}

// ── shared helpers ─────────────────────────────────────────────────────────

// Compact node projection for list/query results — enough to orient and to
// decide which node to `get_node` in full, without dumping every contract.
function summarizeNode(n: OntologyNode) {
  return {
    id: n.id,
    label: n.label,
    kind: n.kind,
    status: n.status,
    abstraction: n.coordinates.abstraction,
    manifestation: n.coordinates.manifestation,
    plane: n.coordinates.plane,
    branch: n.coordinates.branch,
    parentId: n.graph.parentId,
  };
}

function summarizeEdge(e: OntologyEdge) {
  return { edgeId: e.edgeId, from: e.from, to: e.to, type: e.type, branch: e.branch };
}

// Shared optional `edgeTypes` field for traversal tools.
const edgeTypesField = z
  .array(EdgeTypeSchema)
  .optional()
  .describe("Restrict traversal to these edge types (omit for all types).");

// ── tool definitions ───────────────────────────────────────────────────────

export function ontologyTools(): OntologyTool[] {
  return [
    {
      name: "list_nodes",
      title: "List intent nodes",
      description:
        "List every intention node in the graph as a compact summary (id, label, kind, status, coordinates, parent). The starting point for auditing what a project intends to do. Use get_node for the full contract of any one.",
      inputShape: {
        branch: z
          .string()
          .optional()
          .describe("Only return nodes whose coordinates.branch equals this value."),
      },
      handler: (args, cwd) => {
        const branch = args.branch as string | undefined;
        const nodes = loadNodes(cwd);
        const filtered = branch ? nodes.filter((n) => n.coordinates.branch === branch) : nodes;
        return { count: filtered.length, nodes: filtered.map(summarizeNode) };
      },
    },

    {
      name: "get_node",
      title: "Get a node in full",
      description:
        "Return the complete intention node: prompt, rules, the context contract (requires / provides / forbids), literal escape hatch, technical descriptors, and integrity hash. This is the raw declared intent a third party reads to judge whether it is benign or clumsy.",
      inputShape: {
        nodeId: z.string().describe('Node id, e.g. "node_0003".'),
      },
      handler: (args, cwd) => {
        const node = loadNodeById(args.nodeId as string, cwd);
        if (!node) return { found: false, nodeId: args.nodeId };
        return { found: true, node };
      },
    },

    {
      name: "inspect_node",
      title: "Read cached node summary",
      description:
        "Return the Inspector's cached 3–5 sentence human-readable summary of a node (Project Legend δ-1), if present and still fresh. NEVER dispatches an LLM — it is a pure read of the cached translator. Returns available:false when no summary has been generated or the node changed since.",
      inputShape: {
        nodeId: z.string().describe('Node id, e.g. "node_0003".'),
      },
      handler: (args, cwd) => {
        const node = loadNodeById(args.nodeId as string, cwd);
        if (!node) return { available: false, reason: "node_not_found", nodeId: args.nodeId };
        const status = checkTranslatorCache(node);
        if (!status.hit) return { available: false, reason: status.reason, nodeId: node.id };
        return {
          available: true,
          nodeId: node.id,
          text: status.text,
          model: status.model,
          provider: status.provider,
          generatedAt: status.generatedAt,
        };
      },
    },

    {
      name: "query_nodes",
      title: "Query nodes by Hom-profile",
      description:
        "Yoneda search: return every node whose shape matches the given partial Hom-profile. Disjunctive set filters (kind / abstraction / plane / manifestation / status) plus conjunctive contract filters (provides / requires / forbids must all be present) and edge-shape filters (hasIncoming / hasOutgoing). The empty shape matches all nodes.",
      inputShape: QueryShapeSchema.shape,
      handler: (args, cwd) => {
        const shape = QueryShapeSchema.parse(args) as QueryShape;
        const nodes = loadNodes(cwd);
        const edges = loadEdges(cwd);
        const matched = queryNodes(nodes, shape, edges);
        return { count: matched.length, nodes: matched.map(summarizeNode) };
      },
    },

    {
      name: "assemble_context",
      title: "Assemble a node's context",
      description:
        "Compute a node's local context the way the compiler sees it: the refinement-parent path up to canon, the constraints in force, optional edge neighbours, and the rendered prompt. Read-only; never dispatches a model.",
      inputShape: {
        nodeId: z.string().describe("Target node id whose context to assemble."),
        branch: z.string().optional().describe("Branch to assemble within (default: node's branch)."),
        includeEdges: z.boolean().optional().describe("Include edge-neighbour context."),
        edgeTypes: edgeTypesField,
      },
      handler: (args, cwd) => {
        return assembleContext(
          {
            targetNodeId: args.nodeId as string,
            branch: args.branch as string | undefined,
            includeEdges: args.includeEdges as boolean | undefined,
            edgeTypes: args.edgeTypes as OntologyEdge["type"][] | undefined,
          },
          cwd,
        );
      },
    },

    {
      name: "graph_neighbors",
      title: "Direct edge neighbours",
      description:
        "Return the direct neighbours of a node along its typed edges, with the edge and the direction (in/out) relative to the focal node.",
      inputShape: {
        nodeId: z.string().describe("Focal node id."),
        direction: z
          .enum(["in", "out", "both"])
          .optional()
          .describe('Edge direction relative to the focal node (default "both").'),
        edgeTypes: edgeTypesField,
      },
      handler: (args, cwd) => {
        const edges = loadEdges(cwd);
        const neighbors = getNeighbors(args.nodeId as string, edges, {
          direction: args.direction as EdgeDirection | undefined,
          edgeTypes: args.edgeTypes as OntologyEdge["type"][] | undefined,
        });
        return {
          count: neighbors.length,
          neighbors: neighbors.map((nb) => ({
            neighborId: nb.neighborId,
            direction: nb.direction,
            edge: summarizeEdge(nb.edge),
          })),
        };
      },
    },

    {
      name: "graph_path",
      title: "Shortest path between two nodes",
      description:
        "Breadth-first shortest path walking edges from → to (natural direction only). Returns the ordered edge sequence, or found:false when no path exists within maxDepth.",
      inputShape: {
        fromId: z.string().describe("Source node id."),
        toId: z.string().describe("Destination node id."),
        edgeTypes: edgeTypesField,
        maxDepth: z.number().int().positive().optional().describe("Max hops to search (default 10)."),
      },
      handler: (args, cwd) => {
        const edges = loadEdges(cwd);
        const path = findShortestPath(args.fromId as string, args.toId as string, edges, {
          edgeTypes: args.edgeTypes as OntologyEdge["type"][] | undefined,
          maxDepth: args.maxDepth as number | undefined,
        });
        if (path === null) return { found: false, fromId: args.fromId, toId: args.toId };
        return { found: true, hops: path.length, path: path.map(summarizeEdge) };
      },
    },

    {
      name: "graph_subgraph",
      title: "k-hop subgraph around a node",
      description:
        "Return the undirected k-hop neighbourhood around a focal node: the member node ids and the edges among them (boundary edges excluded).",
      inputShape: {
        nodeId: z.string().describe("Focal node id."),
        depth: z.number().int().positive().optional().describe("Hop radius (default 2)."),
        edgeTypes: edgeTypesField,
      },
      handler: (args, cwd) => {
        const edges = loadEdges(cwd);
        const slice = extractSubgraph(args.nodeId as string, edges, {
          depth: args.depth as number | undefined,
          edgeTypes: args.edgeTypes as OntologyEdge["type"][] | undefined,
        });
        return { nodeIds: slice.nodeIds, edges: slice.edges.map(summarizeEdge) };
      },
    },

    {
      name: "list_runs",
      title: "List persisted model runs",
      description:
        "List every persisted model run (the audit record of each LLM dispatch) as a summary: id, kind, target node, model, and creation time. Use get_run for the full record and verify_run to check integrity.",
      inputShape: {},
      handler: (_args, cwd) => {
        const runs = listPersistedRuns(cwd);
        return {
          count: runs.length,
          runs: runs.map((r) => ({
            id: r.id,
            kind: r.kind,
            targetNodeId: r.input.targetNodeId,
            provider: r.model.provider,
            model: r.model.model,
            createdAt: r.createdAt,
            hash: r.hash,
          })),
        };
      },
    },

    {
      name: "get_run",
      title: "Get a persisted run in full",
      description:
        "Return the complete content-addressed run record: input (prompt/context hashes, target node), model, output, validation, and the body hash.",
      inputShape: {
        runId: z.string().describe('Run id, e.g. "run_ab12cd34".'),
      },
      handler: (args, cwd) => {
        const run = loadPersistedRun(args.runId as string, cwd);
        if (!run) return { found: false, runId: args.runId };
        return { found: true, run };
      },
    },

    {
      name: "verify_run",
      title: "Verify run integrity",
      description:
        "Recompute a run's deterministic id (from input + model) and its body hash, and report any divergence from the stored values. ok=true means the record is internally consistent — the byte-level integrity check behind the audit chain.",
      inputShape: {
        runId: z.string().describe('Run id to verify, e.g. "run_ab12cd34".'),
      },
      handler: (args, cwd) => {
        return verifyPersistedRun(args.runId as string, cwd);
      },
    },

    {
      name: "audit_log",
      title: "Read the append-only event log",
      description:
        "Read the temporal event log (events.jsonl): every node/edge mutation, proposal lifecycle, run, compilation, inspection, and verification, in order. Optionally filter by eventType and/or take only the last N events.",
      inputShape: {
        eventType: z
          .string()
          .optional()
          .describe('Only return events of this type, e.g. "compilation_run" or "node_created".'),
        tail: z.number().int().positive().optional().describe("Return only the last N matching events."),
      },
      handler: (args, cwd) => {
        const eventType = args.eventType as string | undefined;
        const tail = args.tail as number | undefined;
        let events = loadEvents(cwd);
        if (eventType) events = events.filter((e) => e.eventType === eventType);
        const total = events.length;
        if (tail && events.length > tail) events = events.slice(-tail);
        return {
          total,
          returned: events.length,
          events: events.map((e) => ({
            eventId: e.eventId,
            sequence: e.sequence,
            timestamp: e.timestamp,
            eventType: e.eventType,
            branch: e.branch,
            payload: e.payload,
          })),
        };
      },
    },
  ];
}
