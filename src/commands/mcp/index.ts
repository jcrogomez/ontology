// `onto mcp` — start the read-only MCP server over the intent graph on stdio.
//
// A third party (a human reviewer, or another model) connects an MCP client to
// this server and reads the declared intent — nodes, contracts, rules, cached
// Inspector summaries — plus the audit chain (runs, events), to judge whether
// the intent is benign and competent. No mutation tools are exposed; the graph
// cannot be changed through this surface.

import * as path from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createOntologyMcpServer } from "../../runtime/mcp/server.js";

export interface OntoMcpOptions {
  cwd?: string;
}

export async function ontoMcpCommand(options: OntoMcpOptions): Promise<void> {
  const cwd = options.cwd ? path.resolve(options.cwd) : process.cwd();

  // Build the server (throws loudly if cwd is not an Ontology project) and
  // connect it to stdio. stdout is reserved for the MCP protocol stream, so all
  // human-facing logging goes to stderr.
  const server = createOntologyMcpServer(cwd);
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(`✓ ontology MCP server (read-only) serving ${cwd} over stdio`);
}
