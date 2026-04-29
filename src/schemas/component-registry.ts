import { z } from 'zod';

import {
  JsonObjectSchema,
  NonEmptyStringSchema,
  TargetSchema,
  VersionSchema
} from './common.js';

export const ComponentRegistryEntrySchema = z
  .object({
    id: NonEmptyStringSchema,
    semanticType: NonEmptyStringSchema,
    purpose: NonEmptyStringSchema,
    implementationPath: NonEmptyStringSchema,
    propsSchema: JsonObjectSchema,
    eventsSchema: JsonObjectSchema,
    constraints: z.array(NonEmptyStringSchema),
    supportedTargets: z.array(TargetSchema)
  })
  .strict();

export const ComponentRegistrySchema = z
  .object({
    version: VersionSchema,
    target: TargetSchema,
    components: z.record(ComponentRegistryEntrySchema)
  })
  .strict()
  .superRefine((registry, context) => {
    for (const [componentKey, component] of Object.entries(registry.components)) {
      if (component.id !== componentKey) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['components', componentKey, 'id'],
          message: `Component id "${component.id}" must match its registry key "${componentKey}"`
        });
      }
    }
  });

export type ComponentRegistry = z.infer<typeof ComponentRegistrySchema>;
export type ComponentRegistryEntry = z.infer<
  typeof ComponentRegistryEntrySchema
>;
