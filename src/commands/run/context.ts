import { assembleContext } from "../../runtime/context/assembler.js";
import { dispatchLlmRequest } from "../../runtime/llm/dispatcher.js";
import type { LlmTask, LlmProvider } from "../../runtime/llm/types.js";

export interface RunContextOptions {
  provider?: string;
  task?: string;
  branch?: string;
  time?: string;
  mode?: string;
  json?: boolean;
}

export async function runContextCommand(id: string, options: RunContextOptions) {
  const provider = (options.provider || "mock") as string;
  const task = (options.task || "semantic_parse") as LlmTask;
  const mode = (options.mode || "strict") as "strict" | "compare" | "propose";
  const branch = options.branch;
  const time = options.time ? parseInt(options.time, 10) : undefined;
  const isJson = !!options.json;

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

  if (isJson) {
    const output = {
      context: contextOutput,
      response: {
        text: llmResponse.text,
        model: llmResponse.model,
        provider: llmResponse.provider,
      },
    };
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
  }
}
