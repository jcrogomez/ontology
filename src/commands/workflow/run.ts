import * as fs from "node:fs";
import * as path from "node:path";
import { errorMessage } from "../../core/errors.js";
import { loadWorkflowGraphFromFile } from "../../runtime/workflow/graph-load.js";
import {
  runWorkflow,
  type RunWorkflowOptions,
  type WorkflowResult,
} from "../../runtime/workflow/executor.js";
import type { LlmProvider } from "../../runtime/llm/types.js";

// `onto workflow run` — Phase ζ v0.
//
// Load a workflow graph JSON, run it against an input file, and
// emit a summary + trace. The CLI surface mirrors the
// WORKFLOW_RUNTIME_SPEC §3.5 contract.

export interface WorkflowRunOptions {
  /** Path to the input file whose contents seed the workflow. */
  input: string;
  /** Maximum total node visits. Default 100. */
  maxSteps?: number;
  /** Where to write the JSON trace. When omitted, the trace is suppressed in human mode and embedded in --json output. */
  trace?: string;
  provider?: string;
  model?: string;
  ollamaHost?: string;
  /** Validate the graph + input and report; no LLM dispatch. */
  dryRun?: boolean;
  json?: boolean;
}

export async function workflowRunCommand(
  graphFile: string,
  options: WorkflowRunOptions,
): Promise<void> {
  const cwd = process.cwd();
  const graphPath = path.isAbsolute(graphFile)
    ? graphFile
    : path.resolve(cwd, graphFile);
  if (!fs.existsSync(graphPath)) {
    fail(`workflow graph not found: ${graphPath}`, options.json);
    return;
  }
  const inputPath = path.isAbsolute(options.input)
    ? options.input
    : path.resolve(cwd, options.input);
  if (!fs.existsSync(inputPath)) {
    fail(`input file not found: ${inputPath}`, options.json);
    return;
  }

  let loaded;
  try {
    loaded = loadWorkflowGraphFromFile(graphPath);
  } catch (err) {
    fail(`graph load failed: ${errorMessage(err)}`, options.json);
    return;
  }

  const initialInput = fs.readFileSync(inputPath, "utf-8");

  const provider = options.provider as LlmProvider | undefined;
  const runOptions: RunWorkflowOptions = {};
  if (options.maxSteps !== undefined) runOptions.maxSteps = options.maxSteps;
  if (provider !== undefined) runOptions.provider = provider;
  if (options.model !== undefined) runOptions.model = options.model;
  if (options.ollamaHost !== undefined) runOptions.ollamaHost = options.ollamaHost;
  if (options.dryRun) runOptions.dryRun = true;

  let result: WorkflowResult;
  try {
    result = await runWorkflow(loaded, initialInput, runOptions);
  } catch (err) {
    fail(`workflow run failed: ${errorMessage(err)}`, options.json);
    return;
  }

  if (options.trace) {
    const absTrace = path.isAbsolute(options.trace)
      ? options.trace
      : path.resolve(cwd, options.trace);
    fs.mkdirSync(path.dirname(absTrace), { recursive: true });
    fs.writeFileSync(absTrace, JSON.stringify(result, null, 2), "utf-8");
  }

  if (options.json) {
    console.log(JSON.stringify({ ok: true, result }, null, 2));
    return;
  }

  printResultHuman(result, graphPath, options.trace);
}

function printResultHuman(
  result: WorkflowResult,
  graphPath: string,
  tracePath: string | undefined,
): void {
  const label = result.verdict === "accept" ? "✓ ACCEPT" : "✗ REJECT";
  console.log(``);
  console.log(`${label}  (workflow: ${path.basename(graphPath)})`);
  console.log(`steps: ${result.stepCount}   wall-clock: ${result.durationMs}ms`);
  if (result.verdict === "reject") {
    console.log(`reason: ${result.reason}`);
  }
  console.log(``);
  console.log(`trace:`);
  for (const v of result.trace) {
    const kindTag = v.kind === "verifier" ? "VER" : v.kind === "terminal" ? "TRM" : "GEN";
    const verdictTag =
      v.verdict !== undefined
        ? ` [verdict=${v.verdict.verdict}${
            "severity" in v.verdict ? `, severity=${v.verdict.severity}` : ""
          }]`
        : "";
    const noteTag =
      v.notes && v.notes.length > 0 ? `  // ${v.notes.join("; ")}` : "";
    console.log(
      `  ${String(v.step).padStart(3)}. ${kindTag}  ${v.nodeId}${verdictTag}  (${v.durationMs}ms)${noteTag}`,
    );
  }
  console.log(``);
  if (result.verdict === "accept") {
    const preview = result.output.slice(0, 300);
    const truncated = result.output.length > 300 ? " …" : "";
    console.log(`output preview:\n${preview}${truncated}`);
    console.log(``);
  }
  if (tracePath) {
    console.log(`full trace written to: ${tracePath}`);
  }
}

function fail(message: string, json: boolean | undefined): void {
  if (json) {
    console.log(JSON.stringify({ ok: false, error: message }, null, 2));
  } else {
    console.error(`✖ ${message}`);
  }
}
