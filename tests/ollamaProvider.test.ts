import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { initOntologyProject } from '../src/core/init.js';
import {
  MockLLMProvider,
  OllamaLLMProvider
} from '../src/llm/ollamaProvider.js';
import { OSLViewSchema, RenderASTSchema } from '../src/schemas/index.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  delete process.env.ONTOLOGY_OLLAMA_MODEL;

  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

describe('Ollama providers', () => {
  it('returns deterministic structured fixtures in mock mode', async () => {
    const provider = new MockLLMProvider();
    const criticReportSchema = z.object({
      verdict: z.enum(['pass', 'revise', 'fail']),
      summary: z.string(),
      findings: z.array(
        z.object({
          id: z.string(),
          severity: z.enum(['info', 'warning', 'blocking']),
          message: z.string()
        })
      )
    });

    const osl = await provider.structuredGenerate({
      system: 'Generate an IDE main view OSL view.',
      prompt: 'Produce ide main view osl.',
      schema: OSLViewSchema
    });
    const renderAst = await provider.structuredGenerate({
      system: 'Generate an IDE main view Render AST.',
      prompt: 'Produce a Render AST for IDE main view.',
      schema: RenderASTSchema
    });
    const critic = await provider.structuredGenerate({
      system: 'Act as a critic.',
      prompt: 'Write a critic report for IDE main view.',
      schema: criticReportSchema
    });

    expect(osl.id).toBe('IdeMainView');
    expect(renderAst.viewId).toBe('IdeMainView');
    expect(renderAst.nodes[0]?.component).toBe('Screen');
    expect(critic.verdict).toBe('revise');
    expect(critic.findings[0]?.severity).toBe('warning');
  });

  it('surfaces a clear error when Ollama cannot be reached', async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError('fetch failed'));
    const provider = new OllamaLLMProvider({
      baseUrl: 'http://localhost:11434',
      fetch: fetchImplementation,
      model: 'llama3.1'
    });

    await expect(
      provider.structuredGenerate({
        system: 'Return an object.',
        prompt: 'Produce a result.',
        schema: z.object({
          ok: z.boolean()
        })
      })
    ).rejects.toThrow(/Ollama is not running or could not be reached/);
  });

  it('surfaces a clear error when no Ollama model is configured', async () => {
    const provider = new OllamaLLMProvider();

    await expect(
      provider.structuredGenerate({
        system: 'Return an object.',
        prompt: 'Produce a result.',
        schema: z.object({
          ok: z.boolean()
        })
      })
    ).rejects.toThrow(/Ollama model is missing/);
  });

  it('retries once when Ollama returns invalid JSON and succeeds on the second response', async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        createJsonResponse({
          message: {
            content: 'This is not valid JSON.'
          }
        })
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          message: {
            content: '{"status":"ok"}'
          }
        })
      );
    const provider = new OllamaLLMProvider({
      fetch: fetchImplementation,
      model: 'llama3.1'
    });

    const result = await provider.structuredGenerate({
      system: 'Return status only.',
      prompt: 'Produce a status object.',
      schema: z.object({
        status: z.string()
      })
    });

    expect(result).toEqual({
      status: 'ok'
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  it('throws a clear error when the parsed JSON fails schema validation', async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({
        message: {
          content: '{"status":123}'
        }
      })
    );
    const provider = new OllamaLLMProvider({
      fetch: fetchImplementation,
      model: 'llama3.1'
    });

    await expect(
      provider.structuredGenerate({
        system: 'Return status only.',
        prompt: 'Produce a status object.',
        schema: z.object({
          status: z.string()
        })
      })
    ).rejects.toThrow(/schema validation failed/);
  });

  it('uses the default model from ontology.config.yaml when one is not passed explicitly', async () => {
    const root = await createTemporaryDirectory();
    const workspaceRoot = join(root, 'workspace');
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({
        message: {
          content: '{"status":"ok"}'
        }
      })
    );

    await initOntologyProject({
      cwd: root,
      projectName: 'workspace'
    });

    const provider = new OllamaLLMProvider({
      fetch: fetchImplementation,
      root: workspaceRoot
    });

    await provider.structuredGenerate({
      system: 'Return status only.',
      prompt: 'Produce a status object.',
      schema: z.object({
        status: z.string()
      })
    });

    const firstCall = fetchImplementation.mock.calls[0];
    const requestInit = firstCall?.[1];

    expect(firstCall?.[0]).toBe('http://localhost:11434/api/chat');
    expect(requestInit).toBeDefined();
    expect(JSON.parse(String(requestInit?.body)).model).toBe(
      'qwen2.5-coder:3b'
    );
  });
});

function createJsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json'
    }
  });
}

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'onto-ollama-'));
  temporaryDirectories.push(directory);
  return directory;
}
