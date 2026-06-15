// MCP server factory for the Ontology intent graph.
//
// `createOntologyMcpServer(cwd)` builds an McpServer bound to one `.ontology/`
// kernel and registers the read-only tool surface (see tools.ts) plus a couple
// of read-only resources. It performs NO transport I/O — the caller connects a
// transport (stdio for `onto mcp`, in-memory for tests). This keeps the server
// fully testable in-process.
//
// The whole surface is read-only by construction: there are no mutation tools.
// A third party can connect, read the declared intent (prompts, contracts,
// rules, the cached Inspector summaries) and the audit chain (runs, events) to
// judge whether the intent is benign and competent — without ever being able
// to change the graph, and without needing the implementation source.

import * as fs from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getOntologyPaths } from "../../kernel/core/project/paths.js";
import { loadState, loadNodeById } from "../../kernel/core/project/load.js";
import { ontologyTools } from "./tools.js";

export const ONTOLOGY_MCP_NAME = "ontology";
export const ONTOLOGY_MCP_VERSION = "0.4.0";

// Throws (rather than process.exit) when `cwd` is not an Ontology project, so a
// server start fails loudly and a test can observe it.
function assertProjectOrThrow(cwd: string): void {
  const paths = getOntologyPaths(cwd);
  if (!fs.existsSync(paths.statePath)) {
    throw new Error(
      `Not an Ontology project: ${cwd} (no .ontology/state.json). Run 'onto init' there first.`,
    );
  }
}

export function createOntologyMcpServer(cwd: string = process.cwd()): McpServer {
  assertProjectOrThrow(cwd);

  const server = new McpServer({
    name: ONTOLOGY_MCP_NAME,
    version: ONTOLOGY_MCP_VERSION,
  });

  // ── tools (all read-only) ────────────────────────────────────────────────
  for (const tool of ontologyTools()) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputShape,
        // Advertise the read-only contract to clients that honour annotations.
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async (args: Record<string, unknown>) => {
        try {
          const result = tool.handler(args ?? {}, cwd);
          return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return {
            content: [{ type: "text" as const, text: `Error in ${tool.name}: ${message}` }],
            isError: true,
          };
        }
      },
    );
  }

  // ── resources (read-only) ────────────────────────────────────────────────
  server.registerResource(
    "canon",
    "ontology://canon",
    {
      title: "Ontology canon node",
      description: "The frozen canon node (node_0000_canon) holding the system's axioms.",
      mimeType: "application/json",
    },
    async (uri) => {
      const canon = loadNodeById("node_0000_canon", cwd);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(canon ?? { found: false }, null, 2),
          },
        ],
      };
    },
  );

  server.registerResource(
    "overview",
    "ontology://overview",
    {
      title: "Ontology project overview",
      description: "Project state summary: counts, active branch, root node.",
      mimeType: "application/json",
    },
    async (uri) => {
      const state = loadState(cwd);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(state, null, 2),
          },
        ],
      };
    },
  );

  return server;
}
