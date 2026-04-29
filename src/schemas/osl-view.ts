import { z } from 'zod';

import {
  JsonObjectSchema,
  NonEmptyStringSchema,
  TargetSchema,
  VersionSchema
} from './common.js';

export const OSLViewComponentSchema = z
  .object({
    id: NonEmptyStringSchema,
    semanticType: NonEmptyStringSchema,
    purpose: NonEmptyStringSchema.optional(),
    bindsTo: z.array(NonEmptyStringSchema).optional(),
    events: z.array(NonEmptyStringSchema).optional(),
    props: JsonObjectSchema.optional()
  })
  .strict();

export const OSLViewSchema = z
  .object({
    id: NonEmptyStringSchema,
    version: VersionSchema,
    task: NonEmptyStringSchema,
    actor: NonEmptyStringSchema,
    context: JsonObjectSchema,
    domainEntities: z.array(NonEmptyStringSchema),
    information: JsonObjectSchema,
    interaction: JsonObjectSchema,
    components: z.array(OSLViewComponentSchema),
    layout: JsonObjectSchema,
    visual: JsonObjectSchema,
    data: JsonObjectSchema,
    target: TargetSchema
  })
  .strict();

export type OSLView = z.infer<typeof OSLViewSchema>;
export type OSLViewComponent = z.infer<typeof OSLViewComponentSchema>;
