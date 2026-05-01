import { createOllamaClient } from './client.js';

export async function runStructuredOutput(model: string, prompt: string, schema: Record<string, unknown>): Promise<unknown> {
  const ollama = createOllamaClient();
  const response = await ollama.chat({
    model,
    messages: [{ role: 'user', content: prompt }],
    format: schema
  });
  return JSON.parse(response.message.content);
}
