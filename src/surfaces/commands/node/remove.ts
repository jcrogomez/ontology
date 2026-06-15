import { removeNode, NodeHasEdgesError } from "../../../kernel/core/nodes/remove-node.js";
import { errorMessage } from "../../../kernel/core/errors.js";

export interface NodeRemoveCommandOptions {
  json?: boolean;
}

export async function nodeRemoveCommand(
  id: string,
  options: NodeRemoveCommandOptions = {},
): Promise<void> {
  try {
    const { event } = removeNode({ id });

    if (options.json) {
      console.log(JSON.stringify({
        ok: true,
        nodeId: id,
        eventId: event.eventId,
      }));
      return;
    }

    console.log(`=== ONTOLOGY NODE REMOVED ===
Node:    ${id}
Event:   ${event.eventId}
(The node's file is gone; its event log entries remain for audit.)`);
  } catch (err) {
    if (err instanceof NodeHasEdgesError) {
      if (options.json) {
        console.log(JSON.stringify({
          ok: false,
          error: err.message,
          incidentEdges: err.edges.map((e) => ({
            edgeId: e.edgeId,
            from: e.from,
            to: e.to,
            type: e.type,
          })),
        }));
      } else {
        console.error(`✖ Cannot remove ${id}: ${err.edges.length} incident edge(s):`);
        for (const e of err.edges) {
          console.error(`  - ${e.edgeId}  ${e.from} --[${e.type}]--> ${e.to}`);
        }
        console.error(`Remove these edges first with: onto edge remove <edgeId>`);
      }
      process.exit(1);
    }
    failWith(`Error removing node ${id}: ${errorMessage(err)}`, options.json);
  }
}

function failWith(msg: string, json?: boolean): void {
  if (json) {
    console.log(JSON.stringify({ ok: false, error: msg }));
  } else {
    console.error(`✖ ${msg}`);
  }
  process.exit(1);
}
