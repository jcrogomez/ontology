import { assertOntologyProject, loadNodes } from "../../core/project/load.js";
import type { OntologyNode } from "../../schemas/ontology.js";
import { renderTable } from "../../core/render/table.js";
import { byKind, byLevel, byManifestation, byStatus, statusGlyph, dim, bold } from "../../core/render/style.js";

export async function nodeListCommand(options: { json?: boolean } = {}): Promise<void> {
  assertOntologyProject();
  const nodes = loadNodes();

  if (options.json) {
    const formattedNodes = nodes.map(n => ({
      id: n.id,
      label: n.label,
      kind: n.kind,
      status: n.status,
      abstraction: n.coordinates.abstraction,
      plane: n.coordinates.plane,
      manifestation: n.coordinates.manifestation,
      time: n.coordinates.time,
      branch: n.coordinates.branch
    }));
    console.log(JSON.stringify({ nodes: formattedNodes }, null, 2));
    return;
  }

  console.log(bold("=== ONTOLOGY NODES ==="));
  console.log(dim(`${nodes.length} node${nodes.length === 1 ? "" : "s"}`));
  console.log("");

  console.log(renderTable<OntologyNode>(nodes, [
    { header: "", render: (r) => statusGlyph((r as OntologyNode).status) },
    { header: "ID", render: (r) => (r as OntologyNode).id },
    { header: "Kind", render: (r) => byKind((r as OntologyNode).kind) },
    { header: "Level", render: (r) => byLevel((r as OntologyNode).coordinates.abstraction) },
    { header: "Status", render: (r) => byStatus((r as OntologyNode).status) },
    { header: "Manifestation", render: (r) => byManifestation((r as OntologyNode).coordinates.manifestation) },
    { header: "Label", render: (r) => (r as OntologyNode).label, maxWidth: 40 },
  ]));
}
