import { Ollama } from 'ollama';

export function createOllamaClient() {
  const host = process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434';
  return new Ollama({ host });
}
