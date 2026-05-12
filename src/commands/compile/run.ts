import { loadNodeById } from "../../core/project/load.js";
import { runCompilePlan } from "../../runtime/compile/compile-plan-runner.js";
import type { LlmProvider } from "../../runtime/llm/types.js";

export interface CompileRunOptions {
  provider?: string;        // "mock" (default) or "ollama"
  model?: string;
  ollamaHost?: string;
  json?: boolean;
  // Opt-in: after parse-check, execute the compiled artifact under a
  // subprocess timeout. Non-zero exit / timeout fails the compile with
  // runtime_failed. Off by default — running arbitrary LLM output has
  // operational consequences.
  runtimeCheck?: boolean;
  runtimeCheckTimeoutMs?: number;
  // Restrict the compile to a single Grothendieck fiber. When set, the
  // plan only walks edges whose endpoints both live on the named branch.
  // The focal must itself be on the branch; otherwise the command exits
  // 1 rather than silently retargeting.
  branch?: string;
  // Write the focal node's compiled artifact to this path instead of the
  // default `.ontology/artifacts/generated/<nodeId>.<ext>`. Relative
  // paths resolve against cwd; missing parent directories are created.
  // The Legend "regenerate this file from intent" loop is the primary
  // caller — upstream artifacts still land under generated/.
  target?: string;
  // Required to overwrite an existing file at --target. Default-deny
  // protects an interactive caller from silently destroying their
  // work; Legend's verify-homeomorphism flow knows it wants overwrite
  // and passes --force explicitly.
  force?: boolean;
  // Open-world validation: unsatisfied `requires` tokens produce a
  // warning instead of a hard gate failure. Use when the focal's
  // contract references external dependencies (stdlib, pip, npm)
  // that no other node provides — common for ingest-derived graphs.
  openWorld?: boolean;
}

// `onto compile <nodeId>`
//
// Walks the topological compile plan rooted at the focal and compiles each
// step into an artifact under .ontology/artifacts/generated/. Each step
// emits a compilation_run event; each step's response is persisted as a
// PersistedRun for audit. The focal's artifact path is reported at the end.
//
// This is the "structure-preserving functor" from the canon (axiom 6) made
// concrete: the graph's topology determines compile order; each node's
// prompt becomes its artifact via a model dispatch; the kernel guarantees
// every artifact ties back to a hashed run, a node, and an event.
export async function compileRunCommand(focalId: string, options: CompileRunOptions): Promise<void> {
  // When --provider is given, it's a global override that forces every step
  // through the same provider. When omitted, compileNode routes per node via
  // node.model.ref (default "mock_default", so legacy chains behave as before).
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

  const focal = loadNodeById(focalId);
  if (!focal) {
    failWith(`Node not found: ${focalId}`, options.json);
    return;
  }

  if (options.force && options.target === undefined) {
    failWith(`--force has no effect without --target. Pass --target <path> to redirect the focal artifact.`, options.json);
    return;
  }

  const result = await runCompilePlan({
    focalId,
    provider,
    model: options.model,
    ollamaHost: options.ollamaHost,
    runtimeCheck: options.runtimeCheck,
    runtimeCheckTimeoutMs: options.runtimeCheckTimeoutMs,
    branch: options.branch,
    targetPath: options.target,
    force: options.force,
    openWorld: options.openWorld,
  });

  if (!result.ok) {
    if (options.json) {
      console.log(JSON.stringify({
        ok: false,
        reason: result.reason,
        error: result.message,
        completedSteps: result.completedSteps ?? [],
      }, null, 2));
    } else {
      console.error(`✖ ${result.message}`);
      if (result.completedSteps && result.completedSteps.length > 0) {
        console.error(`  Completed steps before failure:`);
        for (const s of result.completedSteps) {
          if (s.status === "ok" && s.artifact) {
            console.error(`    ✓ ${s.nodeId}  →  ${s.artifact.relativePath}`);
          } else {
            console.error(`    ✖ ${s.nodeId}  ${s.reason ?? ""}`);
          }
        }
      }
    }
    process.exit(1);
  }

  if (options.json) {
    console.log(JSON.stringify({
      ok: true,
      focal: result.focalId,
      steps: result.steps.map(s => ({
        nodeId: s.nodeId,
        status: s.status,
        runId: s.runId,
        cached: s.cached,
        artifact: s.artifact ? { path: s.artifact.relativePath, bytes: s.artifact.bytesWritten } : null,
      })),
      focalArtifact: {
        path: result.focalArtifact.relativePath,
        absolutePath: result.focalArtifact.absolutePath,
        extension: result.focalArtifact.extension,
        bytes: result.focalArtifact.bytesWritten,
      },
    }, null, 2));
    return;
  }

  console.log(`=== ONTOLOGY COMPILE ===`);
  console.log(`Focal:     ${result.focalId}`);
  if (options.branch) console.log(`Branch:    ${options.branch}`);
  if (options.target) console.log(`Target:    ${options.target}`);
  console.log(`Provider:  ${provider ?? "per-node (model.ref)"}`);
  console.log(`Steps:     ${result.steps.length}`);
  console.log(``);
  for (let i = 0; i < result.steps.length; i++) {
    const s = result.steps[i];
    const marker = s.nodeId === result.focalId ? "*" : " ";
    const cachedTag = s.cached ? " (cached)" : "";
    console.log(` ${marker} ${String(i + 1).padStart(2, " ")}. ${s.nodeId}${cachedTag}  →  ${s.artifact!.relativePath}`);
  }
  console.log(``);
  console.log(`Focal artifact: ${result.focalArtifact.relativePath}`);
  console.log(`Bytes:          ${result.focalArtifact.bytesWritten}`);
}

function failWith(msg: string, json?: boolean): void {
  if (json) {
    console.log(JSON.stringify({ ok: false, error: msg }));
  } else {
    console.error(`✖ ${msg}`);
  }
  process.exit(1);
}
