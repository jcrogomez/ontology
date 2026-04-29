import { z } from 'zod';

import { CanonRuleSchema } from './canon.js';
import { JsonObjectSchema, NonEmptyStringSchema, TargetSchema } from './common.js';
import { DomainEntitySchema } from './domain-entity.js';
import { TaskSchema } from './task.js';

export const ComponentPromptSummarySchema = z
  .object({
    id: NonEmptyStringSchema,
    semanticType: NonEmptyStringSchema,
    purpose: NonEmptyStringSchema,
    propsSchema: JsonObjectSchema,
    eventsSchema: JsonObjectSchema,
    constraints: z.array(NonEmptyStringSchema),
    supportedTargets: z.array(TargetSchema),
    compilerMetadata: z
      .object({
        implementationPath: NonEmptyStringSchema
      })
      .strict()
      .optional()
  })
  .strict();

export const TokenSummarySchema = z
  .object({
    id: NonEmptyStringSchema,
    keys: z.array(NonEmptyStringSchema),
    summary: z.record(z.unknown()),
    compilerMetadata: z
      .object({
        path: NonEmptyStringSchema
      })
      .strict()
  })
  .strict();

export const PromptPacketSchema = z
  .object({
    intent: NonEmptyStringSchema,
    canonRules: z.array(CanonRuleSchema),
    domainEntities: z.array(DomainEntitySchema),
    tasks: z.array(TaskSchema),
    componentSummaries: z.array(ComponentPromptSummarySchema),
    tokenSummaries: z.array(TokenSummarySchema),
    target: TargetSchema
  })
  .strict();

export type ComponentPromptSummary = z.infer<typeof ComponentPromptSummarySchema>;
export type PromptPacket = z.infer<typeof PromptPacketSchema>;
export type TokenSummary = z.infer<typeof TokenSummarySchema>;
