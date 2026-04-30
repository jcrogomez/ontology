import { join, resolve } from 'node:path';

import { z } from 'zod';

import type { JsonSchema } from '../utils/json-schema.js';
import type { OntologyConfig } from '../schemas/index.js';
import { OSLViewSchema, OntologyConfigSchema, RenderASTSchema } from '../schemas/index.js';
import { pathExists, readYamlFile } from '../utils/fs.js';
import { toJsonSchema } from '../utils/json-schema.js';
import { validateOrThrow } from '../utils/validation.js';

export const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434';

export interface LLMProviderOptions<T> {
  model: string;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  temperature?: number;
  keepAlive?: string;
}

export interface StructuredGenerateArgs<TSchema extends z.ZodTypeAny> {
  model?: string;
  system: string;
  prompt: string;
  schema: TSchema;
  baseUrl?: string;
  root?: string;
  signal?: AbortSignal;
}

export interface LLMProvider {
  structuredGenerate<TSchema extends z.ZodTypeAny>(
    args: StructuredGenerateArgs<TSchema>
  ): Promise<z.infer<TSchema>>;
}

export interface OllamaProviderOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
  model?: string;
  root?: string;
}

export interface MockLLMProviderOptions {
  root?: string;
}

export class OllamaLLMProvider implements LLMProvider {
  private readonly baseUrl: string | undefined;
  private readonly fetchImplementation: typeof fetch;
  private readonly model: string | undefined;
  private readonly root: string | undefined;

  constructor(options: OllamaProviderOptions = {}) {
    this.baseUrl = options.baseUrl;
    this.fetchImplementation = options.fetch ?? globalThis.fetch;
    this.model = options.model;
    this.root = options.root;
  }

  async structuredGenerate<TSchema extends z.ZodTypeAny>(
    args: StructuredGenerateArgs<TSchema>
  ): Promise<z.infer<TSchema>> {
    return performOllamaStructuredGenerate({
      schema: args.schema,
      system: args.system,
      prompt: args.prompt,
      ...(args.model === undefined ? {} : { model: args.model }),
      ...(args.baseUrl === undefined ? {} : { baseUrl: args.baseUrl }),
      ...(args.root === undefined ? {} : { root: args.root }),
      ...(args.signal === undefined ? {} : { signal: args.signal })
    }, {
      fetchImplementation: this.fetchImplementation,
      ...(this.baseUrl === undefined ? {} : { baseUrl: this.baseUrl }),
      ...(this.model === undefined ? {} : { model: this.model }),
      ...(this.root === undefined ? {} : { root: this.root })
    });
  }
}

export async function generateStructuredOutput<T>(
  options: LLMProviderOptions<T>
): Promise<T> {
  const jsonSchema = toJsonSchema(options.schema, 'OntologyStructuredOutput');
  const response = await fetch(`${DEFAULT_OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: options.model,
      messages: [
        { role: 'system', content: options.system },
        { role: 'user', content: options.prompt }
      ],
      format: jsonSchema,
      options: { temperature: options.temperature ?? 0 },
      keep_alive: options.keepAlive ?? '5m'
    })
  });
  const responseText = await parseOllamaHttpResponse(response, options.model, 'chat');
  const parsed = parseStructuredJson(responseText);
  if (!parsed.success) {
    throw new Error('Failed to parse structured output from LLM.');
  }
  return validateOrThrow(options.schema, parsed.value, 'generated structured output');
}

export class MockLLMProvider implements LLMProvider {
  constructor(_options: MockLLMProviderOptions = {}) {}

  async structuredGenerate<TSchema extends z.ZodTypeAny>(
    args: StructuredGenerateArgs<TSchema>
  ): Promise<z.infer<TSchema>> {
    const fixture = selectMockFixture(`${args.system}\n${args.prompt}`);

    return validateOrThrow(
      args.schema,
      fixture,
      'mock structured output'
    );
  }

  async generateStructuredOutput<T>(
    options: LLMProviderOptions<T>
  ): Promise<T> {
    return this.structuredGenerate({
      ...options,
      model: options.model
    }) as Promise<T>;
  }
}

export async function ollamaStructuredGenerate<TSchema extends z.ZodTypeAny>(
  args: StructuredGenerateArgs<TSchema>
): Promise<z.infer<TSchema>> {
  return performOllamaStructuredGenerate(args, {});
}

async function performOllamaStructuredGenerate<TSchema extends z.ZodTypeAny>(
  args: StructuredGenerateArgs<TSchema>,
  defaults: {
    baseUrl?: string | undefined;
    fetchImplementation?: typeof fetch | undefined;
    model?: string | undefined;
    root?: string | undefined;
  } = {}
): Promise<z.infer<TSchema>> {
  const resolvedRoot = args.root ?? defaults.root;
  const ontologyConfig = await loadOntologyConfig(resolvedRoot);
  const resolvedBaseUrl =
    args.baseUrl ??
    defaults.baseUrl ??
    ontologyConfig?.llm?.baseUrl ??
    process.env.ONTOLOGY_OLLAMA_BASE_URL ??
    DEFAULT_OLLAMA_BASE_URL;
  const resolvedModel =
    args.model ??
    defaults.model ??
    process.env.ONTOLOGY_OLLAMA_MODEL ??
    ontologyConfig?.llm?.pipeline.parser.model;

  if (resolvedModel === undefined || resolvedModel.trim() === '') {
    throw new Error(
      'Ollama model is missing. Pass a model explicitly, set ONTOLOGY_OLLAMA_MODEL, or configure llm.pipeline.parser.model in ontology.config.yaml.'
    );
  }

  const fetchImplementation = defaults.fetchImplementation ?? globalThis.fetch;
  const jsonSchema = toJsonSchema(args.schema, 'OntologyStructuredOutput');
  const basePrompt = buildStructuredPrompt(args.prompt, jsonSchema);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const prompt =
      attempt === 0
        ? basePrompt
        : `${basePrompt}\n\nYour previous response was not valid JSON. Respond with JSON only, without markdown fences or commentary.`;
    const responseText = await requestStructuredContent({
      baseUrl: resolvedBaseUrl,
      fetchImplementation,
      jsonSchema,
      model: resolvedModel,
      prompt,
      signal: args.signal,
      system: args.system
    });
    const parsed = parseStructuredJson(responseText);

    if (parsed.success) {
      const validated = args.schema.safeParse(parsed.value);

      if (validated.success) {
        return validated.data;
      }

      throw new Error(
        `Ollama schema validation failed for model "${resolvedModel}": ${validated.error.issues
          .map((issue) => `${formatPath(issue.path)}: ${issue.message}`)
          .join('; ')}`
      );
    }

    if (attempt === 1) {
      throw new Error(
        `Ollama returned invalid JSON for model "${resolvedModel}" after 2 attempts: ${truncateForError(
          responseText
        )}`
      );
    }
  }

  throw new Error('Unreachable Ollama generation state.');
}

function buildStructuredPrompt(prompt: string, schema: JsonSchema): string {
  return [
    prompt.trim(),
    'Return JSON that matches this schema exactly.',
    JSON.stringify(schema)
  ].join('\n\n');
}

async function requestStructuredContent(input: {
  baseUrl: string;
  fetchImplementation: typeof fetch;
  jsonSchema: JsonSchema;
  model: string;
  prompt: string;
  signal?: AbortSignal | undefined;
  system: string;
}): Promise<string> {
  const chatRequest = {
    model: input.model,
    messages: [
      {
        role: 'system',
        content: input.system
      },
      {
        role: 'user',
        content: input.prompt
      }
    ],
    stream: false,
    format: input.jsonSchema,
    options: {
      temperature: 0
    }
  };

  try {
    const chatResponse = await input.fetchImplementation(
      `${stripTrailingSlash(input.baseUrl)}/api/chat`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(chatRequest),
        ...(input.signal === undefined ? {} : { signal: input.signal })
      }
    );

    if (chatResponse.status === 404) {
      return requestStructuredContentFromGenerate(input);
    }

    return parseOllamaHttpResponse(chatResponse, input.model, 'chat');
  } catch (error) {
    throw toOllamaConnectionError(error, input.baseUrl);
  }
}

async function requestStructuredContentFromGenerate(input: {
  baseUrl: string;
  fetchImplementation: typeof fetch;
  jsonSchema: JsonSchema;
  model: string;
  prompt: string;
  signal?: AbortSignal | undefined;
  system: string;
}): Promise<string> {
  const generateRequest = {
    model: input.model,
    prompt: input.prompt,
    system: input.system,
    stream: false,
    format: input.jsonSchema,
    options: {
      temperature: 0
    }
  };

  try {
    const generateResponse = await input.fetchImplementation(
      `${stripTrailingSlash(input.baseUrl)}/api/generate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(generateRequest),
        ...(input.signal === undefined ? {} : { signal: input.signal })
      }
    );

    return parseOllamaHttpResponse(generateResponse, input.model, 'generate');
  } catch (error) {
    throw toOllamaConnectionError(error, input.baseUrl);
  }
}

async function parseOllamaHttpResponse(
  response: Response,
  model: string,
  endpoint: 'chat' | 'generate'
): Promise<string> {
  const responseText = await response.text();

  if (!response.ok) {
    const serviceError = tryParseJson(responseText);
    const errorMessage = extractRemoteErrorMessage(serviceError, responseText);

    if (isMissingModelMessage(errorMessage)) {
      throw new Error(
        `Ollama model "${model}" is missing. Pull it first or configure a different model.`
      );
    }

    throw new Error(
      `Ollama ${endpoint} request failed with status ${response.status}: ${errorMessage}`
    );
  }

  const parsedEnvelope = tryParseJson(responseText);

  if (parsedEnvelope === undefined || parsedEnvelope === null) {
    throw new Error(
      `Ollama ${endpoint} response was not valid JSON: ${truncateForError(responseText)}`
    );
  }

  if (
    endpoint === 'chat' &&
    isRecord(parsedEnvelope) &&
    isRecord(parsedEnvelope.message) &&
    typeof parsedEnvelope.message.content === 'string'
  ) {
    return parsedEnvelope.message.content;
  }

  if (
    endpoint === 'generate' &&
    isRecord(parsedEnvelope) &&
    typeof parsedEnvelope.response === 'string'
  ) {
    return parsedEnvelope.response;
  }

  throw new Error(
    `Ollama ${endpoint} response did not include generated content.`
  );
}

function parseStructuredJson(
  content: string
):
  | { success: true; value: unknown }
  | { success: false } {
  for (const candidate of collectJsonCandidates(content)) {
    const parsed = tryParseJson(candidate);

    if (parsed !== undefined) {
      return {
        success: true,
        value: parsed
      };
    }
  }

  return {
    success: false
  };
}

function collectJsonCandidates(content: string): string[] {
  const trimmed = content.trim();
  const candidates = new Set<string>();

  if (trimmed !== '') {
    candidates.add(trimmed);
  }

  for (const match of trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    const fencedContent = match[1]?.trim();

    if (fencedContent !== undefined && fencedContent !== '') {
      candidates.add(fencedContent);
    }
  }

  const firstObjectStart = trimmed.indexOf('{');
  const lastObjectEnd = trimmed.lastIndexOf('}');

  if (firstObjectStart !== -1 && lastObjectEnd > firstObjectStart) {
    candidates.add(trimmed.slice(firstObjectStart, lastObjectEnd + 1));
  }

  const firstArrayStart = trimmed.indexOf('[');
  const lastArrayEnd = trimmed.lastIndexOf(']');

  if (firstArrayStart !== -1 && lastArrayEnd > firstArrayStart) {
    candidates.add(trimmed.slice(firstArrayStart, lastArrayEnd + 1));
  }

  return [...candidates];
}

function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function truncateForError(value: string, length = 180): string {
  const trimmed = value.trim();

  if (trimmed.length <= length) {
    return trimmed;
  }

  return `${trimmed.slice(0, length)}...`;
}

function formatPath(path: Array<string | number>): string {
  if (path.length === 0) {
    return '<root>';
  }

  return path
    .map((segment) =>
      typeof segment === 'number' ? `[${segment}]` : segment
    )
    .join('.')
    .replace('.[', '[');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function extractRemoteErrorMessage(
  parsed: unknown,
  raw: string
): string {
  if (isRecord(parsed) && typeof parsed.error === 'string') {
    return parsed.error;
  }

  return truncateForError(raw);
}

function isMissingModelMessage(message: string): boolean {
  const normalized = message.toLocaleLowerCase();

  return normalized.includes('model') && normalized.includes('not found');
}

function stripTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function toOllamaConnectionError(error: unknown, baseUrl: string): Error {
  if (error instanceof Error) {
    if (error.message.includes('Ollama')) {
      return error;
    }

    return new Error(
      `Ollama is not running or could not be reached at ${baseUrl}. Start Ollama and verify the API is available. Original error: ${error.message}`
    );
  }

  return new Error(
    `Ollama is not running or could not be reached at ${baseUrl}. Start Ollama and verify the API is available.`
  );
}

async function loadOntologyConfig(
  root?: string
): Promise<OntologyConfig | undefined> {
  const resolvedRoot = resolve(root ?? process.cwd());
  const configPath = join(resolvedRoot, 'ontology', 'ontology.config.yaml');

  if (!(await pathExists(configPath))) {
    return undefined;
  }

  return validateOrThrow(
    OntologyConfigSchema,
    await readYamlFile<unknown>(configPath),
    'ontology config'
  );
}

function selectMockFixture(prompt: string): unknown {
  const normalizedPrompt = prompt.toLocaleLowerCase();


  if (
    normalizedPrompt.includes('render ast') ||
    normalizedPrompt.includes('renderast')
  ) {
    return validateOrThrow(
      RenderASTSchema,
      {
        id: 'render-ide-main-view',
        viewId: 'IdeMainView',
        version: '1.0.0',
        entityRefs: ['Workspace', 'Pipeline'],
        taskRef: 'trigger_compilation',
        layout: {
          type: 'stack',
          gap: 'comfortable'
        },
        nodes: [
          {
            id: 'screen',
            component: 'Screen',
            props: {
              title: 'Ontology Studio IDE',
              className: 'developer'
            },
            children: [
              {
                id: 'split',
                component: 'SplitPane',
                props: {
                  orientation: 'horizontal'
                },
                children: [
                  {
                    id: 'minimap',
                    component: 'TopologicalMinimap',
                    props: {}
                  },
                  {
                    id: 'node-card',
                    component: 'NodeCard',
                    props: {}
                  }
                ]
              }
            ]
          }
        ],
        dataBindings: [
          {
            id: 'bind-workspace-status',
            source: 'Workspace.pendingChanges',
            target: 'split.props.status'
          }
        ],
        target: 'react-web'
      },
      'mock render ast'
    );
  }

  if (
    normalizedPrompt.includes('critic report') ||
    /\bcritic\b/.test(normalizedPrompt)
  ) {
    return {
      verdict: 'revise',
      summary: 'IDE main view is structurally sound but needs better visual distinction between parsed nodes.',
      findings: [
        {
          id: 'node-distinction',
          severity: 'warning',
          message: 'Explain how semantic nodes differentiate between read-only and editable states.'
        }
      ]
    };
  }

  if (
    normalizedPrompt.includes('ide main view osl') ||
    normalizedPrompt.includes('ontology specification language') ||
    normalizedPrompt.includes('osl') ||
    normalizedPrompt.includes('ide') ||
    normalizedPrompt.includes('ide main view')
  ) {
    return validateOrThrow(
      OSLViewSchema,
      {
        id: 'IdeMainView',
        version: '1.0.0',
        task: 'trigger_compilation',
        actor: 'developer',
        context: {
          operation: 'ide_interaction',
          locale: 'en-US'
        },
        domainEntities: ['Workspace', 'Pipeline'],
        information: {
          summary: ['activeView', 'pendingChanges', 'intent', 'status']
        },
        interaction: {
          primaryAction: 'trigger_compilation',
          varianceHandling: 'log_errors'
        },
        components: [
          {
            id: 'Screen',
            semanticType: 'screen-container'
          },
          {
            id: 'TopologicalMinimap',
            semanticType: 'minimap'
          },
          {
            id: 'NodeCard',
            semanticType: 'card'
          },
          {
            id: 'SplitPane',
            semanticType: 'layout'
          }
        ],
        layout: {
          type: 'stack'
        },
        visual: {
          emphasis: 'high-clarity'
        },
        data: {
          writes: ['Workspace.activeView', 'Pipeline.status']
        },
        target: 'react-web'
      },
      'mock ide main view osl'
    );
  }

  throw new Error(
    `MockLLMProvider does not have a deterministic fixture for prompt: ${truncateForError(
      prompt
    )}`
  );
}
