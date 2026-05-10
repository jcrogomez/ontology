import { assertOntologyProject, loadEvents } from "../../core/project/load.js";
import type { OntologyEvent } from "../../schemas/ontology.js";
import { renderTable } from "../../core/render/table.js";
import { bold, dim, color } from "../../core/render/style.js";

// Map common event types to a colour family. Mutations get green, validation
// or persistence orange-ish, system grey. Unknown types fall through plain.
function eventTypeColor(t: string): string {
  if (t.startsWith("compilation_") || t.endsWith("_persisted")) return color(t, "greenBright");
  if (t === "system_init") return color(t, "magenta");
  if (t.includes("_created") || t.includes("_added") || t.includes("_applied")) return color(t, "green");
  if (t.includes("_failed") || t.includes("_rejected") || t.includes("_staled")) return color(t, "red");
  if (t.includes("_updated") || t.includes("_removed") || t.includes("_superseded")) return color(t, "yellow");
  return t;
}

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

  console.log(bold("=== ONTOLOGY EVENTS ==="));
  console.log(dim(`tailing the last ${tailEvents.length} of ${events.length}`));
  console.log("");

  console.log(renderTable<OntologyEvent>(tailEvents, [
    { header: "Seq",       render: (r) => String((r as OntologyEvent).sequence), align: "right" },
    { header: "Event ID",  render: (r) => (r as OntologyEvent).eventId },
    { header: "Type",      render: (r) => eventTypeColor((r as OntologyEvent).eventType) },
    { header: "Branch",    render: (r) => color((r as OntologyEvent).branch, "cyan") },
    { header: "Timestamp", render: (r) => dim((r as OntologyEvent).timestamp) },
  ]));
}
