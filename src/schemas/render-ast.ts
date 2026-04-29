import { z } from 'zod';

import {
  JsonObjectSchema,
  NonEmptyStringSchema,
  TargetSchema,
  VersionSchema
} from './common.js';
import { MachineASTSchema } from './machine-ast.js';
import { RenderNodeSchema } from './render-node.js';

export const DataBindingSchema = z
  .object({
    id: NonEmptyStringSchema,
    source: NonEmptyStringSchema,
    target: NonEmptyStringSchema,
    transform: NonEmptyStringSchema.optional(),
    condition: NonEmptyStringSchema.optional()
  })
  .strict();

export const RenderASTSchema = z
  .object({
    id: NonEmptyStringSchema,
    viewId: NonEmptyStringSchema,
    version: VersionSchema,
    entityRefs: z.array(NonEmptyStringSchema),
    taskRef: NonEmptyStringSchema,
    machine: MachineASTSchema.optional(),
    layout: JsonObjectSchema,
    nodes: z.array(RenderNodeSchema),
    dataBindings: z.array(DataBindingSchema),
    target: TargetSchema
  })
  .strict();

export type DataBinding = z.infer<typeof DataBindingSchema>;
export type RenderAST = z.infer<typeof RenderASTSchema>;
