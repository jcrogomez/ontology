import type { OntologyNode, OntologyEdge } from "../../schemas/ontology.js";
import type { LlmProvider } from "../llm/types.js";
import { loadEdges, loadNodes, loadModelsRegistry } from "../../core/project/load.js";
import { computeCompilePlan, type CompilePlan } from "../graph/compile-plan.js";
import { computeBranchFiber, listBranches } from "../fibration/branch-fiber.js";
import { compileNode, type CompileNodeResult } from "./compile-node.js";
import type { WriteArtifactResult } from "./artifact-writer.js";
import type { UpstreamContextItem } from "./upstream-context.js";

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
  // Forwarded to compileNode. When true, compiled artifacts are executed
  // post parse-check; non-zero exit / timeout produces runtime_failed.
  runtimeCheck?: boolean;
  runtimeCheckTimeoutMs?: number;
  // Restrict the plan to a single Grothendieck fiber. When set, only the
  // edges whose both endpoints live on the named branch are considered;
  // the closure walk cannot leak into another branch and the focal must
  // itself be on the branch. Cross-branch supersedes / refinements are
  // therefore inert under a branch-scoped compile, which is exactly the
  // independence guarantee callers want when one branch ships ahead of
  // another.
  branch?: string;
  // Optional artifact-write target for the focal step. Upstream steps in
  // the plan still write to the default generated/ directory; only the
  // focal node — the one the caller explicitly named — lands at the
  // override path. This mirrors the Legend usage: "regenerate file X
  // from its node and overwrite the source path" is a focal operation;
  // upstream nodes remain in the generated/ tree where their identity
  // hash leads.
  targetPath?: string;
  // Required to overwrite an existing file at `targetPath`. Forwarded
  // to compileNode and ultimately to writeArtifact. Without it, an
  // existing target file fails the focal step with
  // reason="target_exists" before any bytes are written.
  force?: boolean;
  // Open-world validation passthrough — see CompileNodeOptions.
  // Forwarded uniformly to every step in the plan so a plan whose
  // upstream nodes carry external requires (stdlib / pip / npm) is
  // not gated by spurious "missing requirement" failures.
  openWorld?: boolean;
  // Optional max-tokens passthrough — see CompileNodeOptions. Same
  // value applied to every step in the plan.
  maxTokens?: number;
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
      reason:
        | "plan_failed"
        | "missing_node"
        | "step_failed"
        | "missing_branch"
        | "focal_off_branch";
      message: string;
      // When step_failed, partial successes that landed before the failure.
      completedSteps?: CompilePlanStepResult[];
      // Plan may still be available even on partial failure.
      plan?: CompilePlan;
    };

export async function runCompilePlan(options: CompilePlanRunOptions): Promise<CompilePlanRunResult> {
  const cwd = options.cwd ?? process.cwd();

  // Branch-scoped compile: filter the edge universe to the requested
  // fiber before the plan is computed. computeCompilePlan is pure over
  // an `edges` array, so handing it the fiber's induced subgraph is the
  // entire change — the closure walk, supersedes handling, and
  // contradiction detection all stay verbatim. We resolve nodes here
  // (rather than relying on edge endpoints) so we can validate that the
  // focal is itself on the branch — silently retargeting would surprise
  // anyone running `--branch` in CI.
  let edges = loadEdges(cwd);
  if (options.branch !== undefined) {
    const nodes = loadNodes(cwd);
    const known = listBranches({ nodes, edges: [] });
    if (!known.includes(options.branch)) {
      const hint = known.length > 0 ? ` Known branches: ${known.join(", ")}.` : "";
      return {
        ok: false,
        focalId: options.focalId,
        reason: "missing_branch",
        message: `No such branch: "${options.branch}".${hint}`,
      };
    }
    const focalNode = nodes.find((n) => n.id === options.focalId);
    if (!focalNode) {
      return {
        ok: false,
        focalId: options.focalId,
        reason: "missing_node",
        message: `Focal not found on disk: ${options.focalId}`,
      };
    }
    if (focalNode.coordinates.branch !== options.branch) {
      return {
        ok: false,
        focalId: options.focalId,
        reason: "focal_off_branch",
        message: `Focal ${options.focalId} lives on branch "${focalNode.coordinates.branch}", not "${options.branch}". Re-run without --branch or compile a focal that belongs to the requested fiber.`,
      };
    }
    edges = computeBranchFiber({ nodes, edges }, options.branch).edges;
  }

  // Compute the plan. Any cycle or missing-node failure surfaces here.
  const plan = computeCompilePlan(options.focalId, edges);
  // Load the models registry once. compileNode needs it on the per-node
  // routing path (when no CLI provider override is in play); harmless to
  // pass when the override path is taken.
  const registry = loadModelsRegistry(cwd);
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
  //
  // For each step we thread the DIRECT refinement parents' compiled response
  // text into compileNode (axiom 7 inductive: each compile sees its lineage
  // one hop up; transitivity is preserved because each parent was already
  // compiled with ITS parents in system). Other edge types (depends_on,
  // inherits_from, ...) are NOT threaded into system today — they participate
  // in topological order but not in the per-node refinement context. The
  // full closure remains traceable via events.jsonl + run records.
  //
  // Pre-load every node referenced by the plan into a single map. The
  // previous shape called loadNodeById per step AND once per refinement
  // parent inside collectUpstream, producing O(steps × parents) disk
  // reads on large plans; with the map both sites become hash lookups.
  const allNodes = loadNodes(cwd);
  const nodeById = new Map<string, OntologyNode>(allNodes.map((n) => [n.id, n]));

  const steps: CompilePlanStepResult[] = [];
  const compiledResponses: Map<string, string> = new Map();
  const refinementParents = buildRefinementParentsIndex(edges);
  let focalArtifact: WriteArtifactResult | undefined;

  for (const step of plan.steps) {
    const node = nodeById.get(step.nodeId);
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

    const upstream = collectUpstream(step.nodeId, refinementParents, compiledResponses, nodeById);

    const stepResult: CompileNodeResult = await compileNode({
      node,
      provider: options.provider,
      model: options.model,
      ollamaHost: options.ollamaHost,
      runtimeCheck: options.runtimeCheck,
      runtimeCheckTimeoutMs: options.runtimeCheckTimeoutMs,
      cwd,
      upstream,
      registry,
      // Apply --target only at the focal step. Upstream parents continue
      // to land in the default generated/ tree; mass-redirecting every
      // step would smash multiple artifacts onto a single path.
      targetPath: step.nodeId === options.focalId ? options.targetPath : undefined,
      force: step.nodeId === options.focalId ? options.force : undefined,
      openWorld: options.openWorld,
      maxTokens: options.maxTokens,
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
    compiledResponses.set(step.nodeId, stepResult.response.text);
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

// childId -> sorted list of direct refinement parent ids. Order is by id so
// the upstream context (and therefore contextHash, runId) is stable across
// runs regardless of edges.jsonl ordering on disk.
function buildRefinementParentsIndex(edges: OntologyEdge[]): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const e of edges) {
    if (e.type !== "refines") continue;
    if (!index.has(e.from)) index.set(e.from, []);
    index.get(e.from)!.push(e.to);
  }
  for (const [k, parents] of index) {
    index.set(k, [...parents].sort());
  }
  return index;
}

// Build the upstream context for a step from its refinement parents'
// compiled responses. Skips parents that have not been compiled in this run
// (defensive: shouldn't happen because the plan emits parents before
// children, but a missing entry shouldn't crash the compile). Parent
// records are resolved from the pre-loaded node map rather than re-read
// per call — the runner owns the load to keep the inner loop allocation-free.
function collectUpstream(
  nodeId: string,
  refinementParents: Map<string, string[]>,
  compiledResponses: Map<string, string>,
  nodeById: Map<string, OntologyNode>,
): UpstreamContextItem[] {
  const parents = refinementParents.get(nodeId) ?? [];
  const items: UpstreamContextItem[] = [];
  for (const parentId of parents) {
    const text = compiledResponses.get(parentId);
    if (text === undefined) continue;
    const parent = nodeById.get(parentId);
    items.push({
      nodeId: parentId,
      level: parent?.coordinates.abstraction,
      text,
    });
  }
  return items;
}
