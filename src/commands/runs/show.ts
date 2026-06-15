import { loadPersistedRun } from "../../kernel/core/runs/persist.js";
import { box, kvLines } from "../../kernel/core/render/box.js";
import { bold, dim, color } from "../../kernel/core/render/style.js";

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

  const summary = kvLines([
    ["Run ID",      run.id],
    ["Kind",        color(run.kind, "magenta")],
    ["CreatedAt",   new Date(run.createdAt * 1000).toISOString()],
    ["Duration",    `${run.duration_ms} ms`],
  ]);

  const inputPairs: [string, string][] = [
    ["promptHash",    dim(run.input.promptHash)],
  ];
  if (run.input.contextHash) inputPairs.push(["contextHash", dim(run.input.contextHash)]);
  if (run.input.targetNodeId) inputPairs.push(["targetNodeId", run.input.targetNodeId]);
  if (run.input.branch) inputPairs.push(["branch", color(run.input.branch, "cyan")]);
  inputPairs.push(["task", color(run.input.task, "yellow")]);
  const inputLines = [bold("Input"), ...kvLines(inputPairs).map((l) => `  ${l}`)];

  const modelPairs: [string, string][] = [
    ["provider",  run.model.provider === "ollama" ? color(run.model.provider, "blueBright") : color(run.model.provider, "gray")],
    ["model",     run.model.model],
  ];
  if (run.model.host) modelPairs.push(["host", run.model.host]);
  const modelLines = [bold("Model"), ...kvLines(modelPairs).map((l) => `  ${l}`)];

  const outputText = run.output.text.length > 500
    ? run.output.text.slice(0, 500) + dim("…(truncated)")
    : run.output.text;
  const outputLines = [bold("Output"), ...outputText.split("\n").map((l) => `  ${l}`)];

  const sections: (string | null)[] = [...summary, null, ...inputLines, null, ...modelLines, null, ...outputLines];

  if (run.validation) {
    const v = run.validation;
    const validationLines = [
      bold("Validation"),
      ...kvLines([
        ["OK",          v.ok ? color("yes", "green") : color("no", "red")],
        ["Score",       String(v.score)],
        ["Violations",  v.violations.length === 0 ? dim("0") : color(String(v.violations.length), "red")],
        ["Warnings",    v.warnings.length === 0 ? dim("0") : color(String(v.warnings.length), "yellow")],
      ]).map((l) => `  ${l}`),
    ];
    sections.push(null, ...validationLines);
  }

  console.log(box(sections, {
    title: bold(`RUN  ${run.id}`),
    footer: dim(run.hash.slice(0, 16)),
  }));
}
