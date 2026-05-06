import type { OntologyNode } from "../../schemas/ontology.js";
import type { LlmProvider } from "../llm/types.js";
import { loadEdges, loadNodeById } from "../../core/project/load.js";
import { computeCompilePlan, type CompilePlan } from "../graph/compile-plan.js";
import { compileNode, type CompileNodeResult } from "./compile-node.js";
import type { WriteArtifactResult } from "./artifact-writer.js";

// Plan runner: walks the topological compile plan computed by
// computeCompilePlan and dispatches compileNode for each step in order.
//
// Each step's response text is collected into `upstreamArtifacts` keyed by
// node id, so future compileNode versions can thread upstream outputs into
// downstream prompts (today's compileNode v0 receives the map but does not
// inject; the contract is in place for the next iteration).
//
// The runner is the structure-preserving functor in concrete form: each
// graph node maps to a compileNode call; each dependency edge maps to a
// "before" relationship that the topological sort enforces.

export interface CompilePlanRunOptions {
  focalId: string;
  provider?: LlmProvider;
  model?: string;
  ollamaHost?: string;
  cwd?: string;
}

export interface CompilePlanStepResult {
  nodeId: string;
  status: "ok" | "failed";
  // Present when ok; the artifact written for this step.
  artifact?: WriteArtifactResult;
  runId?: string;
  cached?: boolean;
  // Present when failed.
  reason?: string;
}

export type CompilePlanRunResult =
  | {
      ok: true;
      focalId: string;
      plan: CompilePlan;
      steps: CompilePlanStepResult[];
      // Quick lookup for the focal's artifact (the "main" output).
      focalArtifact: WriteArtifactResult;
    }
  | {
      ok: false;
      focalId: string;
      reason: "plan_failed" | "missing_node" | "step_failed";
      message: string;
      // When step_failed, partial successes that landed before the failure.
      completedSteps?: CompilePlanStepResult[];
      // Plan may still be available even on partial failure.
      plan?: CompilePlan;
    };

export async function runCompilePlan(options: CompilePlanRunOptions): Promise<CompilePlanRunResult> {
  const cwd = options.cwd ?? process.cwd();

  // Compute the plan. Any cycle or missing-node failure surfaces here.
  const edges = loadEdges(cwd);
  const plan = computeCompilePlan(options.focalId, edges);
  if (!plan.ok) {
    return {
      ok: false,
      focalId: options.focalId,
      reason: "plan_failed",
      message:
        plan.reason === "cycle"
          ? `Compile aborted: dependency cycle in closure (unresolved: ${plan.unresolved.join(", ")})`
          : `Compile aborted: ${plan.reason}`,
      plan,
    };
  }

  // Walk the plan. Stop on the first step failure; the artifacts already on
  // disk from previous steps stay (they are real, persisted, audit-traceable).
  const steps: CompilePlanStepResult[] = [];
  const upstreamArtifacts: Record<string, string> = {};
  let focalArtifact: WriteArtifactResult | undefined;

  for (const step of plan.steps) {
    const node: OntologyNode | null = loadNodeById(step.nodeId, cwd);
    if (!node) {
      return {
        ok: false,
        focalId: options.focalId,
        reason: "missing_node",
        message: `Node referenced in plan not found on disk: ${step.nodeId}`,
        completedSteps: steps,
        plan,
      };
    }

    const stepResult: CompileNodeResult = await compileNode({
      node,
      provider: options.provider,
      model: options.model,
      ollamaHost: options.ollamaHost,
      cwd,
      upstreamArtifacts,
    });

    if (!stepResult.ok) {
      steps.push({
        nodeId: step.nodeId,
        status: "failed",
        reason: `${stepResult.reason}: ${stepResult.message}`,
      });
      return {
        ok: false,
        focalId: options.focalId,
        reason: "step_failed",
        message: `Compile failed at step ${step.nodeId}: ${stepResult.message}`,
        completedSteps: steps,
        plan,
      };
    }

    steps.push({
      nodeId: step.nodeId,
      status: "ok",
      artifact: stepResult.artifact,
      runId: stepResult.runId,
      cached: stepResult.cached,
    });
    upstreamArtifacts[step.nodeId] = stepResult.response.text;
    if (step.nodeId === options.focalId) {
      focalArtifact = stepResult.artifact;
    }
  }

  // The plan always ends with the focal (or sequencing logic is broken).
  if (!focalArtifact) {
    return {
      ok: false,
      focalId: options.focalId,
      reason: "step_failed",
      message: `Plan completed without producing the focal's artifact (${options.focalId})`,
      completedSteps: steps,
      plan,
    };
  }

  return {
    ok: true,
    focalId: options.focalId,
    plan,
    steps,
    focalArtifact,
  };
}
