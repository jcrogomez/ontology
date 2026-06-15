import * as fs from "node:fs";
import { assertOntologyProject, loadModelsRegistry } from "../../kernel/core/project/load.js";
import { createMockLlmAdapter } from "../../runtime/llm/mock.js";
import { createOllamaAdapter } from "../../runtime/llm/ollama/adapter.js";

export async function modelListCommand(options: { provider?: string; json?: boolean }) {
  if (options.provider === "mock") {
    const adapter = createMockLlmAdapter();
    const models = adapter.listModels ? await adapter.listModels() : [];
    if (options.json) {
      console.log(JSON.stringify({ models }, null, 2));
      return;
    }
    for (const model of models) {
      console.log(`- ${model.id} (${model.tier}) - ${model.name}`);
    }
    return;
  }

  if (options.provider === "ollama") {
    const adapter = createOllamaAdapter();
    try {
      const models = adapter.listModels ? await adapter.listModels() : [];
      if (options.json) {
        console.log(JSON.stringify({ models }, null, 2));
        return;
      }
      for (const model of models) {
        console.log(`- ${model.id} (${model.tier}) - ${model.name}`);
      }
      return;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (options.json) {
        console.log(JSON.stringify({
          models: [],
          provider: "ollama",
          available: false,
          message
        }, null, 2));
      } else {
        console.error(`✖ Ollama unavailable: ${message}`);
      }
      process.exit(1);
    }
  }

  // default: local registry
  assertOntologyProject();

  const registry = loadModelsRegistry(process.cwd());
  const models = registry.models;

  if (options.json) {
    console.log(JSON.stringify({ models }, null, 2));
    return;
  }

  for (const model of models) {
    console.log(`- ${model.id} (${model.provider})`);
  }
}
