# Model Runtime Surface

The Model Runtime Surface defines how Ontology interacts with external and internal large language models (LLMs). It provides a structured, predictable, and observable boundary between deterministic intention graphs and probabilistic model execution.

## Core Concepts

### LlmAdapter

The `LlmAdapter` is the fundamental interface for model execution. All model providers must implement this strict boundary. Adapters are responsible for taking an assembled context prompt and returning a deterministic response format containing the text output and optionally parsed JSON. Adapters must never mutate the `.ontology` graph; their sole responsibility is execution and transformation of the response.

## Dispatcher Support (Multi-Provider)

Currently, the `dispatchLlmRequest` router supports both the `mock` and `ollama` providers.
If an unsupported provider is requested, the dispatcher will throw an error: `Unsupported LLM provider: <provider>`.

As a result, commands like `run prompt --provider ollama` are **Implemented**. However, `run context --provider ollama` remains **Planned / Not yet implemented** (not yet connected).

The multi-provider dispatcher supports:
- **mock**: deterministic and CI-safe (Implemented).
- **ollama**: local model execution. Since Ollama is local and may not be available, failures are handled explicitly and loudly (Implemented).

Regardless of the provider used, **provider execution must never mutate `.ontology`**. All execution is isolated from the semantic state.

### Provider: mock

The `mock` provider is a crucial component of the Bootstrap runtime. It acts as a strictly deterministic, pure-function adapter that simulates model execution without external dependencies. It is heavily utilized during CI and deterministic validations. The mock provider never performs network calls and returns hardcoded, structurally valid outputs depending on the inputs provided.

### Provider: ollama (Isolated Adapter)

The `ollama` provider acts as the bridge to local Ollama deployments. Currently implemented as an isolated adapter, it communicates with the local Ollama API to execute prompts.

**Key constraints and planned capabilities for Ollama execution:**
- **Local Availability:** Ollama is local and may be unavailable.
- **Graceful Failure:** The command must fail gracefully if Ollama is not running.
- **Model Selection:** The `--model` flag permits selecting a specific local model.
- **Host Selection:** The `--ollama-host` flag allows selecting a specific host for the Ollama connection.
- **Read-Only / No Mutation:** Executing `run prompt` with Ollama must not read from or mutate `.ontology`. All executions remain purely read-only and side-effect free concerning the semantic state.

### dispatchLlmRequest

The `dispatchLlmRequest` function acts as the central router for model execution. It takes an execution request, determines the requested provider (`mock`, `ollama`), and routes the execution to the appropriate `LlmAdapter`. It strictly validates the incoming options using explicit union types and throws an error if an unsupported or unknown provider is requested.

## Architectural Principles

### Why run remains read-only

Models may speak. Only explicit graph commands may mutate `.ontology`. Mutation requires explicit graph commands/events. This keeps model output separate from semantic truth until validated. The deterministic graph is isolated from probabilistic text generation. Model execution remains a distinct phase from semantic state mutation.

### Why model doctor/list comes before run --provider ollama

Provider observability must precede provider execution. The system should be able to inspect model availability, registry state, and environment configuration before routing execution to a local provider. Implementing observability commands (like `doctor` and `list` for models) ensures the environment is healthy and explicitly defined before attempting to run non-deterministic, hardware-dependent models.
