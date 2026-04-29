import { z } from 'zod';

import { NonEmptyStringSchema, VersionSchema } from './common.js';

export const TaskSchema = z
  .object({
    id: NonEmptyStringSchema,
    version: VersionSchema,
    actor: NonEmptyStringSchema,
    goal: NonEmptyStringSchema,
    successConditions: z.array(NonEmptyStringSchema),
    relatedEntities: z.array(NonEmptyStringSchema)
  })
  .strict();

export type Task = z.infer<typeof TaskSchema>;
