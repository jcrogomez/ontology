import { assertOntologyProject, loadNodes } from "../../core/project/load.js";

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

  // ID                 Kind       Status     Abstraction   Plane       Label
  const idPad = 18;
  const kindPad = 10;
  const statusPad = 10;
  const abstractionPad = 13;
  const planePad = 11;

  console.log(
    "ID".padEnd(idPad) +
    "Kind".padEnd(kindPad) +
    "Status".padEnd(statusPad) +
    "Abstraction".padEnd(abstractionPad) +
    "Plane".padEnd(planePad) +
    "Label"
  );

  for (const n of nodes) {
    console.log(
      n.id.padEnd(idPad) +
      n.kind.padEnd(kindPad) +
      n.status.padEnd(statusPad) +
      n.coordinates.abstraction.padEnd(abstractionPad) +
      n.coordinates.plane.padEnd(planePad) +
      n.label
    );
  }
}
