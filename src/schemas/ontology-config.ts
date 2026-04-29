import { z } from 'zod';

import { NonEmptyStringSchema, TargetSchema, VersionSchema } from './common.js';

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
    paths: OntologyConfigPathsSchema
  })
  .strict();

export type OntologyConfig = z.infer<typeof OntologyConfigSchema>;
export type OntologyConfigPaths = z.infer<typeof OntologyConfigPathsSchema>;
