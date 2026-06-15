import { assertOntologyProject, loadEvents } from "../../kernel/core/project/load.js";
import type { OntologyEvent } from "../../kernel/schemas/ontology.js";
import { renderTable } from "../../kernel/core/render/table.js";
import { bold, dim, color } from "../../kernel/core/render/style.js";

// Map common event types to a colour family. Negative-outcome patterns are
// checked first so they win against broader prefixes (e.g. a future
// `compilation_failed` event should render red, not green just because it
// starts with "compilation_"). Exported for unit-level testing of the
// ordering invariant.
export function eventTypeColor(t: string): string {
  if (t.includes("_failed") || t.includes("_rejected") || t.includes("_staled")) return color(t, "red");
  if (t === "system_init") return color(t, "magenta");
  if (t.includes("_created") || t.includes("_added") || t.includes("_applied")) return color(t, "green");
  if (t.includes("_updated") || t.includes("_removed") || t.includes("_superseded")) return color(t, "yellow");
  if (t.startsWith("compilation_") || t.endsWith("_persisted")) return color(t, "greenBright");
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
