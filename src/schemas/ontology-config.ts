import { z } from 'zod';

import { NonEmptyStringSchema, TargetSchema, VersionSchema } from './common.js';

export const PipelineStageConfigSchema = z
  .object({
    enabled: z.boolean().default(true),
    model: NonEmptyStringSchema,
    temperature: z.number().min(0).max(2).default(0),
    topP: z.number().min(0).max(1).default(0.8),
    maxTokens: z.number().positive().optional(),
    numCtx: z.number().positive().optional()
  })
  .strict();

export const LLMConfigSchema = z
  .object({
    provider: z.enum(['ollama', 'mock', 'cloud']).default('ollama'),
    baseUrl: NonEmptyStringSchema.default('http://localhost:11434'),
    keepAlive: NonEmptyStringSchema.default('5m'),
    pipeline: z
      .object({
        parser: PipelineStageConfigSchema,
        planner: PipelineStageConfigSchema,
        critic: PipelineStageConfigSchema,
        absorber: PipelineStageConfigSchema
      })
      .strict()
  })
  .strict();

export const OntologyConfigPathsSchema = z
  .object({
    ontologyRoot: NonEmptyStringSchema,
    canonDir: NonEmptyStringSchema,
    domainDir: NonEmptyStringSchema,
    tasksDir: NonEmptyStringSchema,
    viewsDir: NonEmptyStringSchema,
    componentsDir: NonEmptyStringSchema,
    tokensDir: NonEmptyStringSchema,
    migrationsDir: NonEmptyStringSchema,
    evalsDir: NonEmptyStringSchema,
    generatedRoot: NonEmptyStringSchema,
    generatedViewsDir: NonEmptyStringSchema,
    generatedMachinesDir: NonEmptyStringSchema,
    generatedSchemasDir: NonEmptyStringSchema,
    generatedHooksDir: NonEmptyStringSchema,
    cacheDir: NonEmptyStringSchema
  })
  .strict();

export const OntologyConfigSchema = z
  .object({
    version: VersionSchema,
    projectName: NonEmptyStringSchema,
    packageManager: z.literal('npm'),
    defaultTarget: TargetSchema,
    llm: LLMConfigSchema,
    paths: OntologyConfigPathsSchema
  })
  .strict();

export type OntologyConfig = z.infer<typeof OntologyConfigSchema>;
export type OntologyConfigPaths = z.infer<typeof OntologyConfigPathsSchema>;
export type LLMConfig = z.infer<typeof LLMConfigSchema>;
export type PipelineStageConfig = z.infer<typeof PipelineStageConfigSchema>;
