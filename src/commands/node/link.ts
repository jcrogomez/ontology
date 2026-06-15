import { loadNodeById, assertOntologyProject } from "../../kernel/core/project/load.js";
import { EdgeTypeSchema } from "../../kernel/schemas/ontology.js";
import { validateEdgeDirection } from "../../kernel/graph/poset.js";
import { createEdge } from "../../kernel/core/edges/create-edge.js";
import { z } from "zod";

export interface NodeLinkCommandOptions {
  from: string;
  to: string;
  type: string;
  json?: boolean;
}

export async function nodeLinkCommand(options: NodeLinkCommandOptions): Promise<void> {
  const cwd = process.cwd();
  // assertOntologyProject calls process.exit(1) directly when the project is
  // missing, so we don't bother with a try/catch around it. JSON mode users
  // will see the brutalist message in stderr; that's an acceptable contract
  // for the missing-project case.
  assertOntologyProject(cwd);

  const handleError = (msg: string) => {
    if (options.json) {
      console.log(JSON.stringify({ ok: false, error: msg }));
    } else {
      console.error(`✖ ${msg}`);
    }
    process.exit(1);
  };

  // Reject self-loops up front. The current edge type vocabulary has no
  // semantically valid self-edge; a node should not "depend_on" or "refine"
  // itself, and downstream traversal would have to special-case the loop.
  if (options.from === options.to) {
    handleError(`Self-loops are not allowed: ${options.from} cannot link to itself`);
  }

  const fromNode = loadNodeById(options.from, cwd);
  if (!fromNode) {
    handleError(`Source node not found: ${options.from}`);
  }

  const toNode = loadNodeById(options.to, cwd);
  if (!toNode) {
    handleError(`Target node not found: ${options.to}`);
  }

  let edgeType: z.infer<typeof EdgeTypeSchema>;
  try {
    edgeType = EdgeTypeSchema.parse(options.type);
  } catch {
    handleError(`Invalid edge type: "${options.type}". Expected one of: ${EdgeTypeSchema.options.join(", ")}`);
    return;
  }

  // Reject inversions of the abstraction poset for refinement-family edges.
  // The check is preventive here; `onto validate` re-runs it across all
  // edges so existing graphs cannot drift into an invalid state silently.
  // fromNode and toNode are guaranteed defined past their handleError checks
  // because handleError process.exit(1)s before falling through.
  const directionResult = validateEdgeDirection({
    sourceLevel: fromNode!.coordinates.abstraction,
    targetLevel: toNode!.coordinates.abstraction,
    edgeType,
  });
  if (!directionResult.ok) {
    handleError(directionResult.reason);
  }

  const result = createEdge({
    from: options.from,
    to: options.to,
    type: edgeType,
  });

  if (!result.ok) {
    if (result.reason === "duplicate") {
      handleError(`Edge already exists: ${options.from} --${edgeType}--> ${options.to}`);
    } else {
      handleError(`Failed to create edge`);
    }
    return;
  }

  if (options.json) {
    console.log(JSON.stringify({ ok: true, edge: result.edge, event: result.event }));
  } else {
    console.log(`=== ONTOLOGY EDGE CREATED ===

Edge:     ${result.edge.edgeId}
From:     ${result.edge.from}
To:       ${result.edge.to}
Type:     ${result.edge.type}
Branch:   ${result.edge.branch}

Next:
  onto validate
  onto inspect`);
  }
}
