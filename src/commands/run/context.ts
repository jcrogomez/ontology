import { assembleContext } from "../../runtime/context/assembler.js";
import { dispatchLlmRequest } from "../../runtime/llm/dispatcher.js";
import { buildFragment } from "../../runtime/context/presheaf.js";
import { glueFragments } from "../../runtime/context/gluing.js";
import { validateIntent, type IntentValidationResult } from "../../runtime/context/intent-validator.js";
import type { LlmTask, LlmProvider } from "../../runtime/llm/types.js";

export interface RunContextOptions {
  provider?: string;
  task?: string;
  branch?: string;
  time?: string;
  mode?: string;
  json?: boolean;
  validate?: boolean;
}

export async function runContextCommand(id: string, options: RunContextOptions) {
  const provider = (options.provider || "mock") as string;
  const task = (options.task || "semantic_parse") as LlmTask;
  const mode = (options.mode || "strict") as "strict" | "compare" | "propose";
  const branch = options.branch;
  const time = options.time ? parseInt(options.time, 10) : undefined;
  const isJson = !!options.json;
  const isValidate = !!options.validate;

  if (provider !== "mock") {
    throw new Error(`Unsupported LLM provider: ${provider}`);
  }

  const contextOutput = assembleContext({
    targetNodeId: id,
    branch,
    time,
    mode,
  });

  const llmResponse = await dispatchLlmRequest(
    {
      task,
      prompt: contextOutput.prompt,
      json: isJson,
    },
    { provider: provider as LlmProvider }
  );

  let validationResult: IntentValidationResult | undefined;
  if (isValidate) {
    const fragments = contextOutput.nodes.map(buildFragment);
    const glued = glueFragments(fragments);
    validationResult = validateIntent({
      assembled: contextOutput,
      glued,
      candidate: {
        text: llmResponse.text,
        provider: llmResponse.provider,
        model: llmResponse.model,
      },
    });
  }

  if (isJson) {
    const output: any = {
      context: contextOutput,
      response: {
        text: llmResponse.text,
        model: llmResponse.model,
        provider: llmResponse.provider,
      },
    };

    if (isValidate && validationResult) {
      output.validation = {
        ok: validationResult.ok,
        score: validationResult.score,
        violations: validationResult.violations,
        warnings: validationResult.warnings,
      };
    }

    console.log(JSON.stringify(output, null, 2));
  } else {
    let truncatedText = llmResponse.text;
    if (truncatedText.length > 500) {
      truncatedText = truncatedText.substring(0, 500) + "...";
    }

    console.log(`=== ONTOLOGY RUN CONTEXT ===`);
    console.log(`Target:    ${contextOutput.targetNodeId}`);
    console.log(`Task:      ${task}`);
    console.log(`Provider:  ${provider}`);
    console.log(`Model:     ${llmResponse.model}`);
    console.log(``);
    console.log(`Context:`);
    console.log(`  Mode:    ${contextOutput.mode}`);
    console.log(`  Branch:  ${contextOutput.branch}`);
    console.log(`  Nodes:   ${contextOutput.nodes.length}`);
    console.log(``);
    console.log(`Response:\n${truncatedText}`);

    if (isValidate && validationResult) {
      console.log(``);
      console.log(`Validation:`);
      console.log(`  OK:       ${validationResult.ok}`);
      console.log(`  Score:    ${validationResult.score}`);
      console.log(`  Warnings: ${validationResult.warnings.length}`);
      console.log(`  Violations: ${validationResult.violations.length}`);
    }
  }
}
