import { loadNodes } from "../../core/project/load.js";
import { runCompilePlan } from "../../runtime/compile/compile-plan-runner.js";
import type { LlmProvider } from "../../runtime/llm/types.js";
import type { OntologyNode } from "../../schemas/ontology.js";

export interface CompileRunBatchOptions {
  // Compile every artifact-bearing node (manifestation === "code"). Mutually
  // exclusive with --nodes; either one must be provided.
  allArtifacts?: boolean;
  // Comma-separated explicit focal ids. Mutually exclusive with --all-artifacts.
  nodes?: string;
  provider?: string;
  model?: string;
  ollamaHost?: string;
  runtimeCheck?: boolean;
  runtimeCheckTimeoutMs?: number;
  branch?: string;
  // Open-world validation passthrough — see compileRun for semantics.
  openWorld?: boolean;
  // Max-output-tokens override applied uniformly to every focal.
  maxTokens?: number;
  json?: boolean;
}

interface BatchFocalResult {
  focalId: string;
  ok: boolean;
  // Present when ok.
  artifactPath?: string;
  bytesWritten?: number;
  steps?: number;
  cacheHits?: number;
  // Present when failed.
  reason?: string;
  message?: string;
}

// `onto compile run-batch [--all-artifacts | --nodes <ids>]`
//
// Project Legend Phase β-1 (Layer 1 — multi-file orchestration). Walks a
// batch of focal nodes and runs the topological compile plan for each.
// Plans are computed independently per focal, but the per-run persisted-
// run cache makes shared upstream walks cheap on the second-and-later
// focal — when two focals share an upstream node, the second focal's
// step for that upstream is a cache hit, not a new model dispatch.
//
// Failure policy: continue past per-focal failures. The whole batch
// only exits non-zero when every focal failed; partial success returns 0
// and the human-readable report flags the failed entries. This matches
// what Legend's verify-homeomorphism pipeline needs: regenerate every
// artifact, report a per-node verdict, do not let one bad node stop the
// rest of the report.
export async function compileRunBatchCommand(options: CompileRunBatchOptions): Promise<void> {
  if (!options.allArtifacts && !options.nodes) {
    failWith("compile run-batch requires --all-artifacts or --nodes <ids>", options.json);
    return;
  }
  if (options.allArtifacts && options.nodes) {
    failWith("compile run-batch: --all-artifacts and --nodes are mutually exclusive", options.json);
    return;
  }

  let provider: LlmProvider | undefined;
  if (options.provider !== undefined) {
    if (
      options.provider !== "mock" &&
      options.provider !== "ollama" &&
      options.provider !== "anthropic"
    ) {
      failWith(`Unsupported provider: ${options.provider} (try mock, ollama, or anthropic)`, options.json);
      return;
    }
    provider = options.provider as LlmProvider;
  }

  const allNodes = loadNodes();
  const focals = resolveFocals(options, allNodes);
  if (!focals.ok) {
    failWith(focals.message, options.json);
    return;
  }

  if (focals.ids.length === 0) {
    if (options.json) {
      console.log(JSON.stringify({
        ok: true,
        allSucceeded: true,
        anySucceeded: false,
        focalCount: 0,
        okCount: 0,
        failedCount: 0,
        results: [],
        message: focals.emptyReason,
      }, null, 2));
    } else {
      console.log(`No focals matched. ${focals.emptyReason}`);
    }
    return;
  }

  const results: BatchFocalResult[] = [];
  for (const focalId of focals.ids) {
    const r = await runCompilePlan({
      focalId,
      provider,
      model: options.model,
      ollamaHost: options.ollamaHost,
      runtimeCheck: options.runtimeCheck,
      runtimeCheckTimeoutMs: options.runtimeCheckTimeoutMs,
      branch: options.branch,
      openWorld: options.openWorld,
      maxTokens: options.maxTokens,
    });
    if (!r.ok) {
      results.push({
        focalId,
        ok: false,
        reason: r.reason,
        message: r.message,
      });
      continue;
    }
    const cacheHits = r.steps.filter((s) => s.cached).length;
    results.push({
      focalId,
      ok: true,
      artifactPath: r.focalArtifact.relativePath,
      bytesWritten: r.focalArtifact.bytesWritten,
      steps: r.steps.length,
      cacheHits,
    });
  }

  const okCount = results.filter((r) => r.ok).length;
  const failedCount = results.length - okCount;
  // §4.5 — JSON booleans now agree with the exit code. `ok` ≡ "the CLI
  // exited 0" (which is the continue-then-aggregate policy: any focal
  // success is enough). `allSucceeded` and `anySucceeded` cover the
  // two semantically distinct questions that downstream parsers
  // actually ask. An empty batch trivially `allSucceeded` (no failures
  // by vacuous truth), to keep `ok ⇔ exit 0` total over all inputs.
  const allSucceeded = failedCount === 0;
  const anySucceeded = okCount > 0;

  if (options.json) {
    console.log(JSON.stringify({
      // `ok` ⇔ exit code 0: empty batch passes vacuously, non-empty
      // requires at least one success.
      ok: results.length === 0 || anySucceeded,
      allSucceeded,
      anySucceeded,
      focalCount: results.length,
      okCount,
      failedCount,
      results,
    }, null, 2));
  } else {
    console.log(`=== ONTOLOGY COMPILE BATCH ===`);
    if (options.branch) console.log(`Branch:    ${options.branch}`);
    console.log(`Provider:  ${provider ?? "per-node (model.ref)"}`);
    console.log(`Focals:    ${results.length}  (ok=${okCount}, failed=${failedCount})`);
    console.log(``);
    for (const r of results) {
      if (r.ok) {
        const cacheTag = r.cacheHits ? `  (${r.cacheHits}/${r.steps} cached)` : "";
        console.log(` ✓ ${r.focalId}  →  ${r.artifactPath}${cacheTag}`);
      } else {
        console.log(` ✖ ${r.focalId}  ${r.reason}: ${r.message}`);
      }
    }
  }

  // Exit non-zero only when every focal failed; partial success is still
  // a useful report, not a hard error.
  if (failedCount === results.length) process.exit(1);
}

type ResolvedFocals =
  | { ok: true; ids: string[]; emptyReason: string }
  | { ok: false; message: string };

function resolveFocals(
  options: CompileRunBatchOptions,
  allNodes: OntologyNode[],
): ResolvedFocals {
  if (options.nodes) {
    const ids = dedupePreservingOrder(
      options.nodes
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    );
    const byId = new Map(allNodes.map((n) => [n.id, n]));
    const missing = ids.filter((id) => !byId.has(id));
    if (missing.length > 0) {
      return { ok: false, message: `Unknown node id(s): ${missing.join(", ")}` };
    }
    // Pre-resolve filters: surface an actionable error at the top of
    // the batch rather than per-focal failures inside the loop.
    //
    // (§4.3) Non-code-manifestation focals can't produce an artifact —
    // the compile plan would either fail with a generic error or
    // emit something the user did not intend. Refuse upfront.
    const nonCode = ids.filter(
      (id) => byId.get(id)!.coordinates.manifestation !== "code",
    );
    if (nonCode.length > 0) {
      return {
        ok: false,
        message: `Non-code-manifestation focals cannot be compiled: ${nonCode.join(", ")}. Pass nodes whose coordinates.manifestation === "code".`,
      };
    }
    // (§4.4) When --branch is set, every --nodes focal must live on
    // that branch. Otherwise the focal step inside runCompilePlan
    // would fail with `focal_off_branch` per-focal — a worse user
    // experience than catching it at resolve time.
    if (options.branch !== undefined) {
      const offBranch = ids.filter(
        (id) => byId.get(id)!.coordinates.branch !== options.branch,
      );
      if (offBranch.length > 0) {
        return {
          ok: false,
          message: `Focals off the requested branch "${options.branch}": ${offBranch.join(", ")}. Re-run without --branch or pass focals on that branch.`,
        };
      }
    }
    return {
      ok: true,
      ids,
      emptyReason: "(--nodes resolved to an empty list)",
    };
  }
  // --all-artifacts: every code-manifestation node, optionally fibre-restricted.
  let candidates = allNodes.filter(
    (n) => n.coordinates.manifestation === "code",
  );
  if (options.branch !== undefined) {
    candidates = candidates.filter((n) => n.coordinates.branch === options.branch);
  }
  candidates.sort((a, b) => a.id.localeCompare(b.id));
  return {
    ok: true,
    ids: candidates.map((n) => n.id),
    emptyReason: options.branch
      ? `No code-manifestation nodes on branch "${options.branch}".`
      : "No code-manifestation nodes in the project.",
  };
}

function dedupePreservingOrder(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function failWith(msg: string, json?: boolean): void {
  if (json) {
    console.log(JSON.stringify({ ok: false, error: msg }));
  } else {
    console.error(`✖ ${msg}`);
  }
  process.exit(1);
}
