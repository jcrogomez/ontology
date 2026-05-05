import { listPersistedRuns } from "../../core/runs/persist.js";

export interface RunsListOptions {
  kind?: string;
  json?: boolean;
}

export async function runsListCommand(options: RunsListOptions): Promise<void> {
  const all = listPersistedRuns();

  let filtered = all;
  if (options.kind) {
    if (options.kind !== "prompt" && options.kind !== "context") {
      console.error(`✖ Invalid run kind: ${options.kind}`);
      process.exit(1);
    }
    filtered = all.filter(r => r.kind === options.kind);
  }

  if (options.json) {
    const summary = filtered.map(r => ({
      id: r.id,
      kind: r.kind,
      createdAt: r.createdAt,
      provider: r.model.provider,
      model: r.model.model,
      targetNodeId: r.input.targetNodeId,
      duration_ms: r.duration_ms,
      validated: r.validation !== null,
    }));
    console.log(JSON.stringify({ runs: summary }, null, 2));
    return;
  }

  console.log("=== ONTOLOGY RUNS ===");
  if (filtered.length === 0) {
    console.log("(no runs persisted)");
    return;
  }
  console.log(`Count: ${filtered.length}`);
  console.log("");
  for (const run of filtered) {
    const target = run.input.targetNodeId ?? "-";
    console.log(`${run.id}  ${run.kind.padEnd(7)}  ${run.model.provider.padEnd(8)}  ${run.model.model.padEnd(20)}  ${target}`);
  }
}
