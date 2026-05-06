import { loadEdges, loadNodeById } from "../../core/project/load.js";
import { computeCompilePlan } from "../../runtime/graph/compile-plan.js";

export interface CompilePlanOptions {
  json?: boolean;
}

// `onto compile --plan <nodeId>`
//
// Read-only preview of the topological order in which a future `onto compile`
// run would dispatch the focal node and its dependency closure. No artifact
// is generated; no event is emitted. The same helper backs the walker's
// `:plan` command, so CLI scripts and the TUI agree on the order.
export async function compilePlanCommand(focalId: string, options: CompilePlanOptions): Promise<void> {
  const focal = loadNodeById(focalId);
  if (!focal) {
    failWith(`Node not found: ${focalId}`, options.json);
    return;
  }

  const edges = loadEdges();
  const plan = computeCompilePlan(focalId, edges);

  if (options.json) {
    if (plan.ok) {
      console.log(JSON.stringify({
        ok: true,
        focal: plan.focalId,
        steps: plan.steps,
        closure: plan.closure,
      }, null, 2));
    } else {
      console.log(JSON.stringify({
        ok: false,
        reason: plan.reason,
        focal: plan.focalId,
        partialSteps: plan.partialSteps,
        unresolved: plan.unresolved,
      }, null, 2));
    }
    if (!plan.ok) process.exit(1);
    return;
  }

  console.log(`=== ONTOLOGY COMPILE PLAN ===`);
  console.log(`Focal:  ${focalId}`);
  if (!plan.ok) {
    console.error(`✖ Cannot compute plan: ${plan.reason}`);
    if (plan.reason === "cycle") {
      console.error(`  Unresolved nodes (cycle): ${plan.unresolved.join(", ")}`);
      console.error(`  Sequenced before the cycle: ${plan.partialSteps.length} step(s)`);
    }
    process.exit(1);
  }

  console.log(`Steps:  ${plan.steps.length}`);
  console.log(``);
  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i];
    const marker = step.nodeId === focalId ? "*" : " ";
    const depsTag = step.dependsOn.length > 0 ? `  depends on ${step.dependsOn.length} edge(s)` : "";
    console.log(` ${marker} ${String(i + 1).padStart(2, " ")}. ${step.nodeId}${depsTag}`);
  }
}

function failWith(msg: string, json?: boolean): void {
  if (json) {
    console.log(JSON.stringify({ ok: false, error: msg }));
  } else {
    console.error(`✖ ${msg}`);
  }
  process.exit(1);
}
