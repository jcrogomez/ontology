import { assertOntologyProject, loadNodeById } from "../../core/project/load.js";

export async function nodeShowCommand(id: string, options: { json?: boolean } = {}): Promise<void> {
  assertOntologyProject();
  const node = loadNodeById(id);

  if (!node) {
    console.error(`✖ Node not found: ${id}`);
    process.exit(1);
  }

  if (options.json) {
    console.log(JSON.stringify({ node }, null, 2));
    return;
  }

  console.log("=== ONTOLOGY NODE ===\n");
  console.log(`ID:            ${node.id}`);
  console.log(`Label:         ${node.label}`);
  console.log(`Kind:          ${node.kind}`);
  console.log(`Status:        ${node.status}`);
  console.log(`Abstraction:   ${node.coordinates.abstraction}`);
  console.log(`Plane:         ${node.coordinates.plane}`);
  console.log(`Manifestation: ${node.coordinates.manifestation}`);
  console.log(`Time:          ${node.coordinates.time}`);
  console.log(`Branch:        ${node.coordinates.branch}`);
  console.log(`Frozen:        ${node.integrity.frozen}`);
  console.log(`Hash:          ${node.integrity.hash}\n`);

  console.log("Context:");

  const printContextList = (title: string, list: any[]) => {
    console.log(`  ${title}:`);
    if (list.length === 0) {
      console.log("    none");
    } else {
      for (const item of list) {
        if (item.key) {
           console.log(`    - ${item.key}`);
        } else if (item.source) {
           console.log(`    - ${item.source}`);
        } else {
           console.log(`    - ${JSON.stringify(item)}`);
        }
      }
    }
  };

  printContextList("Provides", node.context.provides);
  printContextList("Requires", node.context.requires);
  printContextList("Forbids", node.context.forbids);
  printContextList("Optional", node.context.optional);

  console.log("\nRules:");
  if (node.rules.length === 0) {
    console.log("  none");
  } else {
    node.rules.forEach((rule, idx) => {
      console.log(`  ${idx + 1}. ${rule}`);
    });
  }
}
