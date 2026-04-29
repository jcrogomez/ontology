import { z } from 'zod';

import { NonEmptyStringSchema, VersionSchema } from './common.js';

export const CanonRuleSeveritySchema = z.enum(['info', 'warning', 'blocking']);

export const CanonRuleSchema = z
  .object({
    id: NonEmptyStringSchema,
    description: NonEmptyStringSchema,
    severity: CanonRuleSeveritySchema,
    appliesTo: z.array(NonEmptyStringSchema).optional()
  })
  .strict();

export const CanonSchema = z
  .object({
    id: NonEmptyStringSchema,
    version: VersionSchema,
    rules: z.array(CanonRuleSchema)
  })
  .strict();

export type Canon = z.infer<typeof CanonSchema>;
export type CanonRule = z.infer<typeof CanonRuleSchema>;
export type CanonRuleSeverity = z.infer<typeof CanonRuleSeveritySchema>;
