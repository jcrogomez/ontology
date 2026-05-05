import { loadPersistedRun } from "../../core/runs/persist.js";

export interface RunsShowOptions {
  json?: boolean;
}

export async function runsShowCommand(id: string, options: RunsShowOptions): Promise<void> {
  const run = loadPersistedRun(id);
  if (!run) {
    console.error(`✖ Run not found: ${id}`);
    process.exit(1);
  }

  if (options.json) {
    console.log(JSON.stringify(run, null, 2));
    return;
  }

  console.log(`=== ONTOLOGY RUN ${run.id} ===`);
  console.log(`Kind:       ${run.kind}`);
  console.log(`CreatedAt:  ${new Date(run.createdAt * 1000).toISOString()}`);
  console.log(`Duration:   ${run.duration_ms} ms`);
  console.log("");
  console.log(`Input:`);
  console.log(`  promptHash:    ${run.input.promptHash}`);
  if (run.input.contextHash) {
    console.log(`  contextHash:   ${run.input.contextHash}`);
  }
  if (run.input.targetNodeId) {
    console.log(`  targetNodeId:  ${run.input.targetNodeId}`);
  }
  if (run.input.branch) {
    console.log(`  branch:        ${run.input.branch}`);
  }
  console.log(`  task:          ${run.input.task}`);
  console.log("");
  console.log(`Model:`);
  console.log(`  provider:      ${run.model.provider}`);
  console.log(`  model:         ${run.model.model}`);
  if (run.model.host) {
    console.log(`  host:          ${run.model.host}`);
  }
  console.log("");
  console.log(`Output:`);
  const text = run.output.text.length > 500 ? run.output.text.slice(0, 500) + "..." : run.output.text;
  console.log(text);
  if (run.validation) {
    console.log("");
    console.log(`Validation:`);
    console.log(`  OK:         ${run.validation.ok}`);
    console.log(`  Score:      ${run.validation.score}`);
    console.log(`  Violations: ${run.validation.violations.length}`);
    console.log(`  Warnings:   ${run.validation.warnings.length}`);
  }
  console.log("");
  console.log(`Hash:       ${run.hash}`);
}
