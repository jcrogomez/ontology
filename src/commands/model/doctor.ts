import * as fs from "node:fs";
import { getOntologyPaths } from "../../core/project/paths.js";
import { loadModelsRegistry } from "../../core/project/load.js";
import { createMockLlmAdapter } from "../../runtime/llm/mock.js";
import { createOllamaAdapter } from "../../runtime/llm/ollama/adapter.js";

export async function modelDoctorCommand(options: { json?: boolean }) {
  const paths = getOntologyPaths(process.cwd());
  const registryExists = fs.existsSync(paths.modelsRegistryPath);

  let modelCount = 0;
  if (registryExists) {
    try {
      const registry = loadModelsRegistry(process.cwd());
      modelCount = registry.models.length;
    } catch {
      // Ignore parse errors for doctor
    }
  }

  const mockAdapter = createMockLlmAdapter();
  const mockHealth = mockAdapter.health ? await mockAdapter.health() : { ok: true };

  const ollamaAdapter = createOllamaAdapter();
  const ollamaHealth = ollamaAdapter.health ? await ollamaAdapter.health() : { ok: false, message: "No health method" };

  const ollamaHost = process.env.OLLAMA_HOST ?? null;

  if (options.json) {
    const output = {
      registry: {
        modelsRegistryPath: registryExists ? "found" : "missing",
        modelCount,
      },
      providers: {
        mock: {
          available: mockHealth.ok,
          models: 1, // hardcoded per requirements
        },
        ollama: {
          available: ollamaHealth.ok,
          models: 0, // hardcoded per requirements as we don't query it
          message: ollamaHealth.message,
        },
      },
      environment: {
        OLLAMA_HOST: ollamaHost,
      },
      status: {
        modelRuntimeObservable: true,
      },
    };
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  const registryText = registryExists ? "found" : "missing";
  const mockStatus = mockHealth.ok ? "available" : "unavailable";
  const ollamaStatus = ollamaHealth.ok ? "available" : "unavailable";
  const ollamaHostText = ollamaHost === null ? "not set" : ollamaHost;

  const output = [
    "=== ONTOLOGY MODEL DOCTOR ===",
    "Registry:",
    `  .ontology/models/registry.json: ${registryText}`,
    registryExists ? `  modelCount: ${modelCount}` : null,
    "Providers:",
    "  mock:",
    `    ${mockStatus}`,
    "  ollama:",
    `    ${ollamaStatus}`,
    "Environment:",
    `  OLLAMA_HOST: ${ollamaHostText}`,
    "Status:",
    "  Model runtime observable.",
  ].filter(Boolean).join("\n");

  console.log(output);
}
