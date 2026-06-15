import { removeEdge } from "../../kernel/core/edges/remove-edge.js";
import { errorMessage } from "../../kernel/core/errors.js";

export interface EdgeRemoveCommandOptions {
  json?: boolean;
}

export async function edgeRemoveCommand(
  edgeId: string,
  options: EdgeRemoveCommandOptions = {},
): Promise<void> {
  try {
    const { event, removed } = removeEdge({ edgeId });

    if (options.json) {
      console.log(JSON.stringify({
        ok: true,
        edgeId: removed.edgeId,
        from: removed.from,
        to: removed.to,
        type: removed.type,
        eventId: event.eventId,
      }));
      return;
    }

    console.log(`=== ONTOLOGY EDGE REMOVED ===
Edge:    ${removed.edgeId}
From:    ${removed.from}
To:      ${removed.to}
Type:    ${removed.type}
Event:   ${event.eventId}`);
  } catch (err) {
    if (options.json) {
      console.log(JSON.stringify({ ok: false, error: errorMessage(err) }));
    } else {
      console.error(`✖ Error removing edge: ${errorMessage(err)}`);
    }
    process.exit(1);
  }
}
