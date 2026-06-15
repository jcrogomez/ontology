import * as fs from "node:fs";
import { getOntologyPaths } from "../../kernel/core/project/paths.js";
import { loadModelsRegistry } from "../../kernel/core/project/load.js";
import { createMockLlmAdapter } from "../../runtime/llm/mock.js";
import { createOllamaAdapter } from "../../runtime/llm/ollama/adapter.js";
import { createAnthropicAdapter } from "../../runtime/llm/anthropic/adapter.js";

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

  // Anthropic is opt-in via ANTHROPIC_API_KEY. We skip the health probe
  // when the key is missing so an unconfigured environment doesn't
  // produce a noisy "unavailable" line that's really "you didn't set it
  // up yet". A missing key surfaces as `not_configured` in JSON output.
  const hasAnthropicKey = Boolean(process.env.ANTHROPIC_API_KEY);
  let anthropicHealth: { ok: boolean; message?: string } | null = null;
  if (hasAnthropicKey) {
    try {
      const adapter = createAnthropicAdapter();
      anthropicHealth = adapter.health
        ? await adapter.health()
        : { ok: false, message: "No health method" };
    } catch (err: unknown) {
      anthropicHealth = {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

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
        anthropic: hasAnthropicKey
          ? {
              available: anthropicHealth?.ok ?? false,
              message: anthropicHealth?.message,
            }
          : { available: false, message: "not_configured" },
      },
      environment: {
        OLLAMA_HOST: ollamaHost,
        ANTHROPIC_API_KEY: hasAnthropicKey ? "set" : "not set",
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
  const anthropicStatus = hasAnthropicKey
    ? anthropicHealth?.ok
      ? "available"
      : `unavailable${anthropicHealth?.message ? ` (${anthropicHealth.message})` : ""}`
    : "not configured (ANTHROPIC_API_KEY unset)";
  const ollamaHostText = ollamaHost === null ? "not set" : ollamaHost;
  const anthropicKeyText = hasAnthropicKey ? "set" : "not set";

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
    "  anthropic:",
    `    ${anthropicStatus}`,
    "Environment:",
    `  OLLAMA_HOST: ${ollamaHostText}`,
    `  ANTHROPIC_API_KEY: ${anthropicKeyText}`,
    "Status:",
    "  Model runtime observable.",
  ].filter(Boolean).join("\n");

  console.log(output);
}
