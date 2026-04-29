import { z } from 'zod';

import {
  JsonObjectSchema,
  JsonValueSchema,
  NonEmptyStringSchema
} from './common.js';
import type { JsonObject, JsonValue } from './common.js';

export interface RenderNode {
  children?: RenderNode[] | undefined;
  component: string;
  condition?: JsonValue | undefined;
  id: string;
  props: JsonObject;
}

export const RenderNodeSchema: z.ZodType<RenderNode> = z.lazy(() =>
  z
    .object({
      id: NonEmptyStringSchema,
      component: NonEmptyStringSchema,
      props: JsonObjectSchema,
      condition: JsonValueSchema.optional(),
      children: z.array(RenderNodeSchema).optional()
    })
    .strict()
);

export type RenderNodeType = z.infer<typeof RenderNodeSchema>;
