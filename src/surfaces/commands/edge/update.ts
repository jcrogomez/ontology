import { updateEdge } from "../../../kernel/core/edges/update-edge.js";
import { EdgeTypeSchema } from "../../../kernel/schemas/ontology.js";
import { errorMessage } from "../../../kernel/core/errors.js";

export interface EdgeUpdateCommandOptions {
  type?: string;
  json?: boolean;
}

export async function edgeUpdateCommand(
  edgeId: string,
  options: EdgeUpdateCommandOptions,
): Promise<void> {
  if (options.type === undefined) {
    fail(`onto edge update requires --type <newType>. Allowed: ${EdgeTypeSchema.options.join(", ")}`, options.json);
    return;
  }
  const typeParse = EdgeTypeSchema.safeParse(options.type);
  if (!typeParse.success) {
    fail(`Invalid --type "${options.type}". Allowed: ${EdgeTypeSchema.options.join(", ")}`, options.json);
    return;
  }

  try {
    const { event, edge } = updateEdge({ edgeId, type: typeParse.data });

    if (options.json) {
      console.log(JSON.stringify({
        ok: true,
        edgeId: edge.edgeId,
        oldType: event.payload.oldType,
        newType: event.payload.newType,
        oldHash: event.payload.oldHash,
        newHash: event.payload.newHash,
        eventId: event.eventId,
      }));
      return;
    }

    console.log(`=== ONTOLOGY EDGE UPDATED ===
Edge:      ${edge.edgeId}
Old type:  ${event.payload.oldType}
New type:  ${event.payload.newType}
Old hash:  ${event.payload.oldHash}
New hash:  ${event.payload.newHash}
Event:     ${event.eventId}`);
  } catch (err) {
    fail(`Error updating edge: ${errorMessage(err)}`, options.json);
  }
}

function fail(msg: string, json?: boolean): void {
  if (json) {
    console.log(JSON.stringify({ ok: false, error: msg }));
  } else {
    console.error(`✖ ${msg}`);
  }
  process.exit(1);
}
