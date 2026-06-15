import { listPersistedRuns } from "../../../kernel/core/runs/persist.js";
import { renderTable } from "../../../kernel/core/render/table.js";
import { bold, dim, color } from "../../../kernel/core/render/style.js";
import type { PersistedRun } from "../../../kernel/schemas/ontology.js";

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

  console.log(bold("=== ONTOLOGY RUNS ==="));
  if (filtered.length === 0) {
    console.log(dim("(no runs persisted)"));
    return;
  }
  console.log(dim(`${filtered.length} run${filtered.length === 1 ? "" : "s"}`));
  console.log("");

  const providerColor = (p: string): string => {
    if (p === "ollama") return color(p, "blueBright");
    if (p === "mock") return color(p, "gray");
    return p;
  };

  console.log(renderTable<PersistedRun>(filtered, [
    { header: "Run ID",     render: (r) => (r as PersistedRun).id },
    { header: "Kind",       render: (r) => color((r as PersistedRun).kind, "magenta") },
    { header: "Provider",   render: (r) => providerColor((r as PersistedRun).model.provider) },
    { header: "Model",      render: (r) => (r as PersistedRun).model.model, maxWidth: 24 },
    { header: "Target",     render: (r) => (r as PersistedRun).input.targetNodeId ?? dim("-") },
    { header: "Duration",   render: (r) => `${(r as PersistedRun).duration_ms}ms`, align: "right" },
  ]));
}
