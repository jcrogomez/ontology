// `onto execute <nodes...>` — the governed EXECUTOR loop over real machinery.
//
// This is the live wiring of src/runtime/executor: it loads the graph + model
// registry, resolves a capability ladder from a premise (default: $0/local —
// never paid), and runs the topological walk driving the pure policy over the
// real runRegenerate. It writes ONLY nodes that pass the behaviour gate, and
// reports each node as closed / extraction-gap / capacity-ceiling /
// blocked-upstream / unverified-no-fixture / infra-error.
//
// It introduces NO new verification semantics — the gates are runRegenerate's.
// What it adds is the DECISION: which lever to pull, when to climb the model
// ladder, and the honest classification of a node it could not close.

import { runRegenerate } from "./regenerate.js";
import { loadEdges, loadModelsRegistry } from "../../kernel/core/project/load.js";
import { runExecutor, type ExecutorConfig } from "../../runtime/executor/runner.js";
import {
  DEFAULT_PREMISE,
  resolveLadder,
  type ModelPremise,
} from "../../runtime/executor/model-ladder.js";
import { formatReport, type ExecReport } from "../../runtime/executor/report.js";

export interface ExecuteCommandOptions {
  /** Run the full loop (regen + gates + decisions) but never write. */
  dryRun?: boolean;
  /** Hard backstop on attempts per node (default 8). */
  maxAttempts?: number;
  /** Allow paid models into the ladder (default: $0 — paid excluded). */
  allowPaid?: boolean;
  behaviorFixturesDir?: string;
  ollamaHost?: string;
  json?: boolean;
}

export async function runExecutorLive(
  nodeIds: string[],
  options: ExecuteCommandOptions,
  cwd: string = process.cwd(),
): Promise<ExecReport> {
  const edges = loadEdges(cwd);
  const registry = loadModelsRegistry(cwd);

  // The $0/local default forbids paid; --allow-paid opts the human into the
  // paid frontier rung explicitly (the executor never escalates to paid on its own).
  const premise: ModelPremise = options.allowPaid
    ? { forbid: { provider: ["mock"] }, order: ["tier", "cost", "locality"] }
    : DEFAULT_PREMISE;

  const ladder = resolveLadder(premise, registry);

  const config: ExecutorConfig = {
    focalIds: nodeIds,
    ladder,
    maxAttemptsPerNode: options.maxAttempts,
    write: !options.dryRun,
    behaviorFixturesDir: options.behaviorFixturesDir,
    ollamaHost: options.ollamaHost,
  };

  return runExecutor(config, {
    edges,
    regenerate: (id, opts) => runRegenerate(id, opts, cwd),
  });
}

export async function executeCommand(
  nodeIds: string[],
  options: ExecuteCommandOptions,
): Promise<void> {
  const report = await runExecutorLive(nodeIds, options, process.cwd());
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatReport(report));
  }
  // Only a machine failure is a non-zero exit. A G-gap or capacity ceiling is a
  // legitimate, honestly-reported outcome — not a command error.
  if (report.infraError > 0) process.exitCode = 1;
}
