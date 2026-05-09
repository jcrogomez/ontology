import {
  loadProjectRegistry,
  partitionByLiveness,
  projectsByRecency,
} from "../../core/projects/registry.js";

export interface ProjectsListOptions {
  json?: boolean;
}

export async function projectsListCommand(options: ProjectsListOptions = {}): Promise<void> {
  const registry = loadProjectRegistry();
  const sorted = projectsByRecency(registry);
  const { live, stale } = partitionByLiveness({ ...registry, projects: sorted });

  if (options.json) {
    console.log(JSON.stringify({ live, stale }, null, 2));
    return;
  }

  if (live.length === 0 && stale.length === 0) {
    console.log("=== ONTOLOGY PROJECTS ===");
    console.log("(no projects registered yet — `onto init` registers a project automatically)");
    return;
  }

  console.log("=== ONTOLOGY PROJECTS ===");
  console.log("");

  if (live.length > 0) {
    console.log(`Live (${live.length}):`);
    for (const p of live) {
      console.log(`  ${p.name}`);
      console.log(`    path:           ${p.path}`);
      console.log(`    last opened:    ${p.lastOpenedAt}`);
      if (p.rootNodeId) console.log(`    root:           ${p.rootNodeId}`);
    }
  }

  if (stale.length > 0) {
    if (live.length > 0) console.log("");
    console.log(`Stale (${stale.length}) — .ontology/ not found at the recorded path:`);
    for (const p of stale) {
      console.log(`  ${p.name}  (${p.path})`);
    }
    console.log("");
    console.log(`Drop a stale entry with:  onto projects forget <name|path>`);
  }
}
