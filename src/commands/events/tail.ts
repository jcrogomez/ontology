import { assertOntologyProject, loadEvents } from "../../core/project/load.js";

export async function eventsTailCommand(options: { json?: boolean, limit?: string } = {}): Promise<void> {
  assertOntologyProject();
  const events = loadEvents();

  let limit = 10;
  if (options.limit !== undefined) {
    const parsedLimit = parseInt(options.limit, 10);
    if (!isNaN(parsedLimit) && parsedLimit > 0) {
      limit = parsedLimit;
    }
  }

  const tailEvents = events.slice(-limit);

  if (options.json) {
    console.log(JSON.stringify({
      module: "events tail",
      events: tailEvents
    }, null, 2));
    return;
  }

  const seqPad = 10;
  const idPad = 16;
  const typePad = 22;
  const branchPad = 9;

  console.log(
    "Sequence".padEnd(seqPad) +
    "Event ID".padEnd(idPad) +
    "Type".padEnd(typePad) +
    "Branch".padEnd(branchPad) +
    "Timestamp"
  );

  for (const e of tailEvents) {
    console.log(
      e.sequence.toString().padEnd(seqPad) +
      e.eventId.padEnd(idPad) +
      e.eventType.padEnd(typePad) +
      e.branch.padEnd(branchPad) +
      e.timestamp
    );
  }
}
