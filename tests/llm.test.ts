import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { MockLLMProvider } from '../src/llm/ollamaProvider.js';
import { OSLViewSchema } from '../src/schemas/index.js';

describe('LLM Provider', () => {
  it('MockLLMProvider returns valid deterministic fixture for OSL view', async () => {
    const provider = new MockLLMProvider();

    const result = await provider.generateStructuredOutput({
      model: 'test-model',
      system: 'Generate an ontology specification language view.',
      prompt: 'Ide main view osl',
      schema: OSLViewSchema,
    });

    expect(result.id).toBe('IdeMainView');
    expect(result.domainEntities).toContain('Workspace');
  });

  it('MockLLMProvider falls back on unsupported prompts', async () => {
    const provider = new MockLLMProvider();

    await expect(
      provider.generateStructuredOutput({
        model: 'test-model',
        system: 'System',
        prompt: 'Unsupported prompt',
        schema: z.object({ value: z.string() })
      })
    ).rejects.toThrow(/MockLLMProvider does not have a deterministic fixture/);
  });
});
